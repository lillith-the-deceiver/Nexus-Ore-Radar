import {CONSENT_VERSION,SEASONS,contributesRaids,seasonOrigin,contextKey,hasConsent} from './core.js';
import {sendRead} from './bridge.js';
import {readReportFeeds} from './report-feeds.js';
import {normalizedFieldIndex,indexSystems} from './field-index.js';
import {refreshMapSnapshot} from './map-refresh.js';
import {relinkMissionReports} from './db.js';
import {captureReportFeeds,counts,reportsFor,saveMissions,missionsFor,leaseFuelQuote,saveFuelQuote,fuelQuotesFor,searchExamplesFor,recordSearchOutcome,cachedSystemsFor} from './db.js';
import {quoteResult} from './fuel.js';
import {decodeMissions,activeLinkedMiningSystems} from './missions.js';
import {candidates,fields,list} from './search.js';
import {rankDetailCandidates,outcomeModel} from './search-ranking.js';
import {STATE_PROTOCOL} from './connection-state.js';
import {scanTiming} from './scan-timing.js';
import {lastExactUpdate} from './belt-cache.js';
import {pumpContributions} from './upload-worker.js';
import {RequestPacing,detailWithRetries} from './request-pacing.js';
import {runScanQueue} from './scan-scheduler.js';
import {manualMarkerStore} from './manual-markers.js';
import {saveFieldIndex,visibleSystemsFor,clearExactBeltCache,mapDataFor,saveMapData,clearExtensionDatabase} from './db.js';
import {scanProgress} from './scan-progress.js';
import {deferredUpdate,refreshUpdatedDashboards} from './release-updates.js';
import {reportsAfterFirstUse,reportBaselineKey} from './report-baseline.js';
import {resetExtensionDataForUpdate} from './update-reset.js';
const pacing=new RequestPacing();
const manualMarkers=manualMarkerStore(chrome.storage.local);
let busy=false,lastAttempt=0;
let missionBusy=false,quoteBusy=false,lastMissionAttempt=0;
const missionSnapshots=new Map();
let searchBusy=false;
let activeScan=null;
let lifecycleReady=Promise.resolve();
let updateMessages=0,updateUploads=0;
const updateBusy=()=>!!(busy||missionBusy||quoteBusy||searchBusy||activeScan||updateMessages||updateUploads);
const releaseUpdate=deferredUpdate(updateBusy,()=>chrome.runtime.reload());
chrome.runtime.onUpdateAvailable?.addListener(()=>releaseUpdate.available());
const getSettings=async()=> (await chrome.storage.local.get('settings')).settings || {};
const putSettings=settings=>chrome.storage.local.set({settings});
const setStatus=status=>chrome.storage.session.set({status:{...status,at:Date.now()}});
const analyticsChanged=context=>chrome.storage.session.set({analyticsRevision:{context,value:crypto.randomUUID()}});
const beltsChanged=context=>chrome.storage.session.set({beltsRevision:{context,value:crypto.randomUUID()}});
async function reportsSinceFirstUse(context,feeds){
  const key=reportBaselineKey(context),stored=(await chrome.storage.local.get(key))[key];
  const result=reportsAfterFirstUse(feeds,stored);
  await chrome.storage.local.set({[key]:result.baseline});
  return result.feeds;
}
const storedMapFor=context=>mapDataFor(context);
async function loadMapFor(c,force=false){
  const previous=await mapDataFor(c.context);
  let result={data:previous,refreshed:false,planetsRefreshed:false};
  if(force||!previous){
    result=await refreshMapSnapshot(path=>searchRead(c,path,path==='/api/galaxy/map'),previous);
    const identity=await searchRead(c,'/api/auth/me',false);
    if(contextKey(c.origin,identity?.user?.id)!==c.context||(await activeContext()).context!==c.context)throw Error('Account or season changed.');
    result.data={...result.data,context:c.context};
    if(result.refreshed){await saveMapData(c.context,result.data,result.markers);await beltsChanged(c.context);}
  }
  await chrome.storage.session.set({mapRefreshContext:null});await analyticsChanged(c.context);
  return result;
}
async function matchingTabs(origin) {
  const tabs=await chrome.tabs.query({url:origin+'/*'});
  return tabs.filter(t=>t.id!==undefined);
}
async function read(tabId,origin,path,priority=false,validate,trackScanIdentity=true) {
  await pacing.wait(priority);
  if(validate)await validate();
  const result=await sendRead(tabId,origin,path);
  if(!result?.ok) {
    const status=result?.status || 0;
    throw Object.assign(Error(status===401 || status===403 ? 'Sign into the selected season in Nexus, then reconnect.' : `Nexus request unavailable (${status}).`),{status});
  }
  if(trackScanIdentity&&path==='/api/auth/me'&&activeScan&&JSON.parse(activeScan.context)[0]===origin&&result.data?.user?.id!=null&&contextKey(origin,result.data.user.id)!==activeScan.context){
    activeScan.contextChanged=true;activeScan.error='Account changed. Reconnect before searching.';
  }
  return result.data;
}
async function authenticatedTab(origin,expectedContext=null,preferredTabId=null,validate){
  const tabs=await matchingTabs(origin);
  if(!tabs.length)throw Error('Open the selected season in Nexus.');
  const ordered=preferredTabId==null?tabs:[...tabs].sort((a,b)=>Number(b.id===preferredTabId)-Number(a.id===preferredTabId));
  let lastError;
  for(const tab of ordered){
    try{
      const identity=await read(tab.id,origin,'/api/auth/me',true,validate,false);
      const context=contextKey(origin,identity?.user?.id);
      if(expectedContext&&context!==expectedContext)continue;
      return {tab,identity,context};
    }catch(error){lastError=error;}
  }
  if(expectedContext)throw Object.assign(Error('Open the selected account and season in Nexus, then reconnect.'),{status:409,contextChanged:true});
  throw lastError||Error('Sign into the selected season in Nexus, then reconnect.');
}
async function establishConnection(origin,force=false){
  const selected=await authenticatedTab(origin);
  const {tab,identity,context}=selected;
  const current=await getSettings();
  if(!hasConsent(current)||!current.enabled||current.origin!==origin)throw Error('Account, season or connection changed.');
  await reportsSinceFirstUse(context,[]);
  const connection={origin,context,tabId:tab.id,username:identity.user.username||'Nexus player'};
  await chrome.storage.session.set({connection,status:{...connection,state:'connected',at:Date.now(),message:`Connected to ${SEASONS.find(s=>s.origin===origin).name}. Capturing reports…`}});
  void syncMissions(tab,origin,context,force);
  return selected;
}
async function sync(force=false) {
  await lifecycleReady;
  // Small timing tolerance avoids skipping a 2.5-second pulse due to jitter.
  if(busy || (!force && Date.now()-lastAttempt<2300)) return;
  busy=true;
  try {
    const settings=await getSettings();
    if(!hasConsent(settings) || !settings.origin || !settings.enabled) return;
    lastAttempt=Date.now();
    const origin=seasonOrigin(settings.origin);
    if(!(await matchingTabs(origin)).length) {await setStatus({state:'waiting',message:'Open Nexus in the selected season to capture reports.'});return;}
    const {tab,identity,context}=await establishConnection(origin,force);
    const userId=identity?.user?.id;
    const {feeds,errors}=await readReportFeeds(path=>read(tab.id,origin,path,false));
    // Detect a changed account before attributing the response to it.
    const check=await read(tab.id,origin,'/api/auth/me',true);
    if(String(check?.user?.id)!==String(userId)) throw Error('Account changed during capture. Retrying without mixing accounts.');
    const current=await getSettings();
    if(!hasConsent(current) || !current.enabled || current.origin!==origin || !(await matchingTabs(origin)).length) return;
    const newFeeds=await reportsSinceFirstUse(context,feeds);
    let changed=await captureReportFeeds(context,newFeeds);
    if(await relinkMissionReports(context))changed=true;
    if(changed)await analyticsChanged(context);
    if(!feeds.length)throw Error(errors.join('; '));
    const capturedCounts=await counts(context);
    const latest=await getSettings();
    if(!hasConsent(latest)||!latest.enabled||latest.origin!==origin)return;
    const connection={origin,context,tabId:tab.id,username:identity.user.username || 'Nexus player'};
    await chrome.storage.session.set({connection,status:{...connection,state:errors.length?'error':'connected',at:Date.now(),
      message:errors.length?errors.join('; '):`Connected to ${SEASONS.find(s=>s.origin===origin).name}.`,reportErrors:errors,...capturedCounts}});
    // Independent network task: a slow Drive receiver must not delay Nexus polling.
    updateUploads++;void pumpContributions(context).finally(()=>{updateUploads--;releaseUpdate.check();});
  } catch(error) {await setStatus({state:'error',message:error.message || 'Connection failed.'});}
  finally {busy=false;releaseUpdate.check();}
}
async function syncMissions(tab,origin,context,force=false){
    if(missionBusy||(!force&&Date.now()-lastMissionAttempt<3000))return;
    missionBusy=true;lastMissionAttempt=Date.now();
    try{
      const validate=async()=>{
        const settings=await getSettings();
        if(!hasConsent(settings)||!settings.enabled||settings.origin!==origin||!(await matchingTabs(origin)).length)throw Error('Account, season or connection changed.');
      };
      const missions=decodeMissions(await read(tab.id,origin,'/api/fleet/missions',true,validate));
      const identityCheck=await read(tab.id,origin,'/api/auth/me',true,validate);
      const latestSettings=await getSettings();
      if(contextKey(origin,identityCheck?.user?.id)!==context||!hasConsent(latestSettings)||!latestSettings.enabled||latestSettings.origin!==origin)return;
      const mapData=await storedMapFor(context);
      const knownSystems=new Map((mapData?.context===context?list(mapData.map,'systems'):[]).map(s=>[String(s.id),s]));
      for(const s of await cachedSystemsFor(context))knownSystems.set(String(s.id),s);
      const {links,changed}=await saveMissions(context,missions,[...knownSystems.values()]);
      if(changed)await analyticsChanged(context);
      await chrome.storage.session.set({missionMarkers:{context,activeSystemIds:activeLinkedMiningSystems(missions,links),at:Date.now(),stale:false}});
      missionSnapshots.set(context,missions);
      void syncQuote(tab,origin,context,missions);
    }catch(error){const previous=(await chrome.storage.session.get('missionMarkers')).missionMarkers;await chrome.storage.session.set({missionMarkers:{...(previous?.context===context?previous:{context,activeSystemIds:[]}),stale:true,error:error.message}});}
    finally{missionBusy=false;releaseUpdate.check();}
}
async function syncQuote(tab,origin,context,missions){
    if(quoteBusy)return;quoteBusy=true;
    try{
      await validateOperationContext(origin,context);
      const quote=await leaseFuelQuote(context,missions);
      if(quote){try{
        await pacing.wait();
        await validateOperationContext(origin,context);
        const result=await sendRead(tab.id,origin,'/api/fleet/fuel-estimate',quote.request).catch(()=>({status:0}));
        const verified=await read(tab.id,origin,'/api/auth/me'),currentSettings=await getSettings();
        if(contextKey(origin,verified?.user?.id)===context&&hasConsent(currentSettings)&&currentSettings.enabled&&currentSettings.origin===origin){await saveFuelQuote(quoteResult(quote,result,Date.now()));await chrome.storage.session.set({fuelUpdatedAt:Date.now()});}
      }catch(error){await chrome.storage.session.set({fuelCaptureError:{context,message:error.message,at:Date.now()}});}}
    }catch(error){await chrome.storage.session.set({fuelCaptureError:{context,message:error.message,at:Date.now()}});}
    finally{quoteBusy=false;releaseUpdate.check();}
}
async function validateOperationContext(origin,context){
  const settings=await getSettings(),connection=(await chrome.storage.session.get('connection')).connection;
  if(!hasConsent(settings)||!settings.enabled||settings.origin!==origin||connection?.context!==context||!(await matchingTabs(origin)).length)throw Error('Account, season or connection changed.');
}
async function pollOperations(force=false){
  const reports=sync(force);
  try{
    const settings=await getSettings(),c=(await chrome.storage.session.get('connection')).connection;
    if(hasConsent(settings)&&settings.enabled&&c?.origin===settings.origin){
      try{const {tab}=await authenticatedTab(c.origin,c.context,c.tabId);void syncMissions(tab,c.origin,c.context,force);const missions=missionSnapshots.get(c.context);if(missions)void syncQuote(tab,c.origin,c.context,missions);}catch{}
    }
  }finally{await reports;}
}
async function dashboard() {
  const url=chrome.runtime.getURL('dashboard.html');
  const tabs=await chrome.tabs.query({url});
  if(tabs[0]) await chrome.tabs.update(tabs[0].id,{active:true}); else await chrome.tabs.create({url});
}
async function activeContext() {
  const settings=await getSettings(), c=(await chrome.storage.session.get('connection')).connection;
  if(!hasConsent(settings)||!settings.enabled||!c||settings.origin!==c.origin)throw Error('Connect to a season first.');
  return c;
}
async function searchRead(c,path,verifyIdentity=true) {
  const validate=async()=>{
    if((await activeContext()).context!==c.context)throw Object.assign(Error('Account or season changed.'),{status:409,contextChanged:true});
  };
  await validate();
  let tab=(await matchingTabs(c.origin)).find(candidate=>candidate.id===c.tabId);
  if(verifyIdentity||!tab){
    const selected=await authenticatedTab(c.origin,c.context,c.tabId,validate);tab=selected.tab;
    if(c.tabId!==tab.id){c.tabId=tab.id;await chrome.storage.session.set({connection:c});}
  }
  return read(tab.id,c.origin,path,false,validate);
}
async function runScan(job,c){
  const started=performance.now();
  const publish=async()=>{job.updatedAt=Date.now();Object.assign(job,scanTiming(job.done,job.queue.length,(performance.now()-started)/1000,pacing.delay,performance.now()<pacing.holdUntil));await chrome.storage.session.set({scan:scanProgress(job)});};
  try{
    pacing.reset();
    await publish();
    await runScanQueue(job.queue,{
      stopped:()=>job.cancelled||job.needsGameAuth||!!job.contextChanged,
      rank:async pending=>{
        const criteria=pending[0]._ranking_criteria,model=outcomeModel(await searchExamplesFor(c.context),criteria.min_richness,criteria.min_pct);
        return rankDetailCandidates(pending,0,0,criteria,model);
      },
      check:async system=>{
        const phase=system._scan_pass===1?'remaining':'priority';
        if(job.phase!==phase){job.phase=phase;await publish();}
        const result=await detailWithRetries(async()=>{
          if(job.contextChanged)return {status:409,error:'Scan stopped.'};
          try{return {status:200,data:await searchRead(c,`/api/galaxy/systems/${system.id}/planets?include=fields`,false)};}
          catch(e){if(e.contextChanged){job.contextChanged=true;job.error=e.message;}return {status:e.status||0,error:e.message};}
        },pacing);
        if(result.status!==200)return {...result,ok:false};
        return {...result,ok:true,belts:fields(result.data)};
      },
      onResult:async(system,result)=>{
        if((await activeContext()).context!==c.context){job.contextChanged=true;throw Error('Account or season changed; scan stopped.');}
        // Like the desktop, stop launching new work on cancellation but retain
        // valid results from requests already in flight in the same context.
        if(job.contextChanged)return;
        if(result.ok){
          const relinked=await recordSearchOutcome(c.context,job.id,system,result.belts,result.data);
          if(relinked)await analyticsChanged(c.context);
          await beltsChanged(c.context);
          await manualMarkers.set(c.context,system.id,false);
        }else{job.failedCount=(job.failedCount||0)+1;job.error=result.error||'System detail request failed.';if([401,403].includes(result.status))job.needsGameAuth=true;}
        job.done++;await publish();
      }
    });
  }catch(e){job.error=e.message;}
  finally{job.running=false;await publish();if(activeScan===job)activeScan=null;releaseUpdate.check();}
}
chrome.action.onClicked.addListener(()=>dashboard());
chrome.runtime.onInstalled.addListener(details=>{
  lifecycleReady=resetExtensionDataForUpdate(chrome,details,clearExtensionDatabase).then(()=>{chrome.alarms.create('capture',{periodInMinutes:.5});return refreshUpdatedDashboards(chrome,details);});
  void lifecycleReady.catch(()=>{});
});
chrome.runtime.onStartup.addListener(()=>chrome.alarms.create('capture',{periodInMinutes:.5}));
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='capture')void pollOperations().catch(()=>{});});
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  if(sender.id!==chrome.runtime.id) return;
  const ui=sender.url===chrome.runtime.getURL('dashboard.html');
  if(msg?.type==='GAME_PULSE') {
    if(!sender.tab?.url) return;
    lifecycleReady.then(()=>getSettings()).then(s=>{try{if(seasonOrigin(sender.tab.url)===s.origin)return pollOperations();}catch{}}).then(()=>respond({ok:true}),()=>respond({ok:false}));
    return true;
  }
  if(!ui) return;
  updateMessages++;
  (async()=>{
    await lifecycleReady;
    if(msg.type==='STATE') {
      const seasons=SEASONS;
      const state=await chrome.storage.session.get(['status','connection','scan','missionMarkers','fuelUpdatedAt','analyticsRevision','beltsRevision']);
      if(state.scan?.running&&!activeScan&&!searchBusy){
        state.scan={...state.scan,running:false,cancelled:true,error:'Scan stopped when the extension worker stopped.'};
        await chrome.storage.session.set({scan:state.scan});
      }
      const scan=scanProgress(state.scan);
      const manualSent=state.connection?await manualMarkers.get(state.connection.context):{};
      return {protocol:STATE_PROTOCOL,appVersion:chrome.runtime.getManifest?.().version,updateBusy:!!(busy||missionBusy||quoteBusy||searchBusy||activeScan||updateUploads),settings:await getSettings(),...state,scan,seasons,manualSent};
    }
    if(msg.type==='CONSENT') {
      if(activeScan)activeScan.contextChanged=true;
      const s=await getSettings();s.consent={accepted:msg.accepted===true,version:CONSENT_VERSION,at:Date.now()};
      s.enabled=false;await putSettings(s);await setStatus({state:'locked',message:s.consent.accepted?'Choose a season.':'Agreement declined. Radar is disabled.'});return {ok:true};
    }
    if(msg.type==='CONNECT') {
      const s=await getSettings();if(!hasConsent(s))throw Error('Agreement required.');
      if(activeScan&&JSON.parse(activeScan.context)[0]!==seasonOrigin(msg.origin))activeScan.contextChanged=true;
      s.origin=seasonOrigin(msg.origin);s.enabled=true;await putSettings(s);await setStatus({state:'connecting',message:'Connecting to selected season…'});
      if(!(await matchingTabs(s.origin)).length){await setStatus({state:'waiting',message:'Open Nexus in the selected season to capture reports.'});return {ok:true};}
      try{const connected=await establishConnection(s.origin,true);await chrome.storage.session.set({mapRefreshContext:connected.context});void sync(true);return {ok:true};}
      catch(error){await setStatus({state:'error',message:error.message||'Connection failed.'});throw error;}
    }
    if(msg.type==='SYNC') {await pollOperations(true);return {ok:true};}
    if(msg.type==='REPORTS'){const c=await activeContext(),saved=await storedMapFor(c.context);return {context:c.context,reports:await reportsFor(c.context),missions:await missionsFor(c.context),fuelQuotes:await fuelQuotesFor(c.context),geometry:saved?.context===c.context?{systems:list(saved.map,'systems'),planets:list(saved.planets,'planets')}:{systems:[],planets:[]}};}
    if(msg.type==='BELTS'){const c=await activeContext(),saved=await storedMapFor(c.context);return {context:c.context,systems:await visibleSystemsFor(c.context),lastExactUpdate:lastExactUpdate(await cachedSystemsFor(c.context)),mapSystems:saved?.context===c.context?list(saved.map,'systems'):null};}
    if(msg.type==='SET_SENT'){
      const c=await activeContext(),id=Number(msg.systemId);if(!Number.isSafeInteger(id)||id<=0)throw Error('System ID must be a positive whole number.');
      const marked=msg.sent===undefined?true:msg.sent;
      if(typeof marked!=='boolean')throw Error('Sent state must be true or false.');
      const saved=await storedMapFor(c.context),hasSystem=systems=>systems.some(system=>Number(system.id??system.system_id)===id);
      if(!hasSystem(list(saved?.map,'systems'))&&!hasSystem(await visibleSystemsFor(c.context)))throw Error('System was not found.');
      const markers=(await chrome.storage.session.get('missionMarkers')).missionMarkers;
      if(!marked&&markers?.context===c.context&&markers.activeSystemIds?.includes(String(id)))throw Error('An active mining fleet is still assigned here.');
      return {manualSent:await manualMarkers.set(c.context,id,marked)};
    }
    if(msg.type==='LOAD_MAP'){
      if(searchBusy)throw Error('Search request already running.');searchBusy=true;
      try{const c=await activeContext(),force=msg.refresh===true||(await chrome.storage.session.get('mapRefreshContext')).mapRefreshContext===c.context;
        const result=await loadMapFor(c,force),data=result.data;
        return {systems:list(data.map,'systems'),planets:list(data.planets,'planets'),refreshed:result.refreshed,planetsRefreshed:result.planetsRefreshed,refreshError:result.error};
      }finally{searchBusy=false;}
    }
    if(msg.type==='START_SCAN'){
      if(searchBusy||activeScan)throw Error('Search request already running.');searchBusy=true;
      try{const c=await activeContext();let saved=await storedMapFor(c.context);
        if(!saved)saved=(await loadMapFor(c,true)).data;
        const index=await searchRead(c,'/api/galaxy/field-index');
        await saveFieldIndex(c.context,list(index,'systems'));
        const queue=candidates(saved.map,index,msg.originId,Number(msg.radius),{examples:await searchExamplesFor(c.context),sent:await manualMarkers.get(c.context)});
        const updatedMap={...saved,map:indexSystems(list(saved.map,'systems'),normalizedFieldIndex(index))};
        await saveMapData(c.context,updatedMap);
        await clearExactBeltCache(c.context);
        await beltsChanged(c.context);
        const job={id:crypto.randomUUID(),context:c.context,queue,done:0,running:queue.length>0,startedAt:Date.now()};
        await chrome.storage.session.set({scan:scanProgress(job)});
        if(job.running){activeScan=job;void runScan(job,c).catch(()=>{if(activeScan===job)activeScan=null;});}
        return {ok:true};
      }finally{searchBusy=false;}
    }
    // Compatibility for a dashboard loaded before this worker update. It no
    // longer advances the queue; the background scheduler owns scan progress.
    if(msg.type==='SCAN_STEP')return {ok:true};
    if(msg.type==='CANCEL_SCAN'){const job=activeScan||(await chrome.storage.session.get('scan')).scan;if(job){job.running=!!activeScan;job.cancelled=true;await chrome.storage.session.set({scan:scanProgress(job)});}return {ok:true};}
    throw Error('Unsupported action');
  })().then(respond,error=>respond({error:error.message})).finally(()=>{updateMessages--;releaseUpdate.check();});return true;
});
