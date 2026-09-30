import {CONSENT_VERSION,SEASONS,contributesRaids,seasonOrigin,contextKey,hasConsent} from './core.js';
import {sendRead} from './bridge.js';
import {readReportFeeds} from './report-feeds.js';
import {normalizedFieldIndex,indexSystems} from './field-index.js';
import {refreshMapSnapshot} from './map-refresh.js';
import {relinkMissionReports} from './db.js';
import {captureReportFeeds,counts,reportsFor,saveMissions,missionsFor,leaseFuelQuote,saveFuelQuote,fuelQuotesFor,searchExamplesFor,recordSearchOutcome,cachedSystemsFor} from './db.js';
import {quoteResult} from './fuel.js';
import {decodeMissions,activeLinkedMiningSystems,activeLinkedMiningFields} from './missions.js';
import {candidates,fields,list} from './search.js';
import {rankDetailCandidates,outcomeModel} from './search-ranking.js';
import {STATE_PROTOCOL} from './connection-state.js';
import {scanTiming} from './scan-timing.js';
import {lastExactUpdate} from './belt-cache.js';
import {pumpContributions} from './upload-worker.js';
import {RequestPacing,detailWithRetries} from './request-pacing.js';
import {runScanQueue} from './scan-scheduler.js';
import {manualMarkerStore} from './manual-markers.js';
import {saveFieldIndex,visibleSystemsFor,clearExactBeltCache,mapDataFor,saveMapData,clearExtensionDatabase,metadataFor,saveMetadata} from './db.js';
import {scanProgress} from './scan-progress.js';
import {deferredUpdate,refreshUpdatedDashboards} from './release-updates.js';
import {reportsAfterFirstUse,reportBaselineKey} from './report-baseline.js';
import {resetExtensionDataForUpdate} from './update-reset.js';
import {REFRESH_MS,shipSnapshot,destinationCatalog,validateFleet} from './destination-estimates.js';
const pacing=new RequestPacing();
const manualMarkers=manualMarkerStore(chrome.storage.local);
const REPORT_CAPTURE_MS=6000;
const SIDE_PANEL_PATH='dashboard.html?view=side-panel';
const VIEW_MODE_KEY='radarViewMode';
let viewMode='side-panel';
let busy=false,lastAttempt=0;
let missionBusy=false,quoteBusy=false,missionTask=null;
let captureTimer=null;
const missionSnapshots=new Map();
let searchBusy=false;
let scanPreparation=null;
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
const isNexusUrl=url=>{
  try{const origin=new URL(url).origin;return SEASONS.some(season=>season.origin===origin);}catch{return false;}
};
async function configureSidePanelTab(tab){
  if(tab?.id===undefined)return;
  const enabled=isNexusUrl(tab.url);
  await chrome.sidePanel.setOptions(enabled?{tabId:tab.id,path:SIDE_PANEL_PATH,enabled:true}:{tabId:tab.id,enabled:false});
  if(enabled)await chrome.action.enable?.(tab.id);else await chrome.action.disable?.(tab.id);
}
async function configureOpenNexusTabs(){
  const found=new Map();
  for(const season of SEASONS)for(const tab of await matchingTabs(season.origin))found.set(tab.id,tab);
  await Promise.all([...found.values()].map(configureSidePanelTab));
}
async function loadMapFor(c,force=false){
  const previous=await mapDataFor(c.context);
  let result={data:previous,refreshed:false,planetsRefreshed:false};
  if(force||!previous){
    result=await refreshMapSnapshot(path=>searchRead(c,path,path==='/api/galaxy/map',true),previous);
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
  return selected;
}
async function sync(force=false) {
  await lifecycleReady;
  // Match the Personal App's six-second report cadence. The worker-owned loop
  // is independent of page visibility; manual Sync remains an explicit force.
  if(busy || (!force && Date.now()-lastAttempt<REPORT_CAPTURE_MS-200)) return;
  busy=true;
  try {
    const settings=await getSettings();
    if(!hasConsent(settings) || !settings.origin || !settings.enabled) return;
    lastAttempt=Date.now();
    const origin=seasonOrigin(settings.origin);
    if(!(await matchingTabs(origin)).length) {await setStatus({state:'waiting',message:'Open Nexus in the selected season to capture reports.'});return;}
    const {tab,identity,context}=await establishConnection(origin,force);
    const userId=identity?.user?.id;
    // These feeds are short-lived. Give them the next safe request slots and
    // persist their raw payloads before any mission refresh or enrichment.
    const {feeds,errors}=await readReportFeeds(path=>read(tab.id,origin,path,true));
    // Detect a changed account before attributing the response to it.
    const check=await read(tab.id,origin,'/api/auth/me',true);
    if(String(check?.user?.id)!==String(userId)) throw Error('Account changed during capture. Retrying without mixing accounts.');
    const current=await getSettings();
    if(!hasConsent(current) || !current.enabled || current.origin!==origin || !(await matchingTabs(origin)).length) return;
    const newFeeds=await reportsSinceFirstUse(context,feeds);
    let changed=await captureReportFeeds(context,newFeeds);
    if(changed)await analyticsChanged(context);
    // Mission refresh, linking and quote capture are enrichment. None of them
    // may delay the next report-feed read or the raw report commit above.
    void syncMissions(tab,origin,context,true).then(async()=>{
      if(await relinkMissionReports(context))await analyticsChanged(context);
    }).catch(()=>{});
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
    if(missionTask)return missionTask;
    if(!force&&missionSnapshots.has(context))return missionSnapshots.get(context);
    missionBusy=true;
    missionTask=(async()=>{try{
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
      await chrome.storage.session.set({missionMarkers:{context,activeSystemIds:activeLinkedMiningSystems(missions,links),activeFieldIds:activeLinkedMiningFields(missions,links),at:Date.now(),stale:false}});
      missionSnapshots.set(context,missions);
      void syncQuote(tab,origin,context,missions);
      return missions;
    }catch(error){const previous=(await chrome.storage.session.get('missionMarkers')).missionMarkers;await chrome.storage.session.set({missionMarkers:{...(previous?.context===context?previous:{context,activeSystemIds:[],activeFieldIds:[]}),stale:true,error:error.message}});return missionSnapshots.get(context)||[];}
    finally{missionBusy=false;missionTask=null;releaseUpdate.check();}})();
    return missionTask;
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
  await sync(force);
}
function stopCaptureLoop(){
  if(captureTimer!==null)clearTimeout(captureTimer);
  captureTimer=null;
}
async function captureTick(force=false){
  captureTimer=null;let keepRunning=false;
  try{
    const settings=await getSettings();
    if(!hasConsent(settings)||!settings.enabled||!settings.origin)return;
    const origin=seasonOrigin(settings.origin);
    if(!(await matchingTabs(origin)).length)return;
    keepRunning=true;
    await pollOperations(force);
  }catch{}
  finally{if(keepRunning)ensureCaptureLoop(false);}
}
function ensureCaptureLoop(immediate=false,force=false){
  if(captureTimer!==null)return;
  captureTimer=setTimeout(()=>captureTick(force),immediate?0:REPORT_CAPTURE_MS);
  // Node integration tests should not be kept alive by a browser timer.
  captureTimer?.unref?.();
}
function restartCaptureLoop(){stopCaptureLoop();ensureCaptureLoop(true,true);}
void chrome.storage.local.get(VIEW_MODE_KEY).then(stored=>{
  viewMode=stored[VIEW_MODE_KEY]==='tab'?'tab':'side-panel';
}).catch(()=>{});
const rememberView=async mode=>{
  viewMode=mode;
  await chrome.storage.local.set({[VIEW_MODE_KEY]:mode});
};
async function dashboard(windowId,nexusTabId) {
  try{await chrome.sidePanel.close({tabId:nexusTabId});}catch{}
  const base=chrome.runtime.getURL('dashboard.html');
  const url=`${base}?view=tab&nexusTab=${nexusTabId}`;
  const tabs=await chrome.tabs.query({url:`${base}*`,windowId});
  if(tabs[0]) await chrome.tabs.update(tabs[0].id,{active:true,url}); else await chrome.tabs.create({url,windowId});
  await rememberView('tab');
}
async function closeDashboardTabs(){
  const url=`${chrome.runtime.getURL('dashboard.html')}*`;
  const dashboards=await chrome.tabs.query({url});
  await Promise.all(dashboards.filter(candidate=>candidate.id!==undefined).map(candidate=>chrome.tabs.remove(candidate.id)));
}
async function openSidePanel(tab){
  // Chrome requires sidePanel.open() to be called directly from the user
  // gesture. Do not put any storage or tab work before this call.
  const opening=chrome.sidePanel.open({tabId:tab.id});
  await opening;
  await closeDashboardTabs();
  await rememberView('side-panel');
}
function openPreferredView(tab){
  if(!isNexusUrl(tab?.url)||tab?.id===undefined)throw Error('Open Nexus before opening Radar.');
  return viewMode==='tab'?dashboard(tab.windowId,tab.id):openSidePanel(tab);
}
async function activeContext() {
  const settings=await getSettings(), c=(await chrome.storage.session.get('connection')).connection;
  if(!hasConsent(settings)||!settings.enabled||!c||settings.origin!==c.origin)throw Error('Connect to a season first.');
  return c;
}
async function searchRead(c,path,verifyIdentity=true,priority=false) {
  const validate=async()=>{
    if((await activeContext()).context!==c.context)throw Object.assign(Error('Account or season changed.'),{status:409,contextChanged:true});
  };
  await validate();
  let tab=(await matchingTabs(c.origin)).find(candidate=>candidate.id===c.tabId);
  if(verifyIdentity||!tab){
    const selected=await authenticatedTab(c.origin,c.context,c.tabId,validate);tab=selected.tab;
    if(c.tabId!==tab.id){c.tabId=tab.id;await chrome.storage.session.set({connection:c});}
  }
  return read(tab.id,c.origin,path,priority,validate);
}

function payload(value){return value?.data&&typeof value.data==='object'?value.data:value;}
async function destinationSnapshot(c){
  let snapshot=await metadataFor(c.context,'destination-ship-snapshot'),now=Date.now();
  if(snapshot&&Array.isArray(snapshot.ships)&&now-Number(snapshot.updated_at||0)<REFRESH_MS)return snapshot;
  try{
    const planetsBody=payload(await searchRead(c,'/api/planets',false)),planets=Array.isArray(planetsBody)?planetsBody:planetsBody?.planets;
    const planetId=Array.isArray(planets)?planets.find(planet=>planet&&planet.id!=null)?.id:null;if(planetId==null)throw Error('Current ship data is unavailable.');
    const yard=payload(await searchRead(c,`/api/planets/${planetId}/shipyard`,false)),ships=yard?.ships;
    if(!Array.isArray(ships))throw Error('Current ship data is unavailable.');
    const clean=ships.map(shipSnapshot).filter(Boolean);if(!clean.length||!clean.some(ship=>Object.keys(ship.mining_rates).length))throw Error('Current ship data is unavailable.');
    const identity=await searchRead(c,'/api/auth/me',true);
    if(contextKey(c.origin,identity?.user?.id)!==c.context||(await activeContext()).context!==c.context)throw Error('Account or season changed.');
    snapshot={updated_at:now,ships:clean};await saveMetadata(c.context,'destination-ship-snapshot',snapshot);return snapshot;
  }catch(error){if(snapshot&&Array.isArray(snapshot.ships))return snapshot;throw error;}
}
function normalizedDestinationState(value){
 const state=value&&typeof value==='object'&&!Array.isArray(value)?value:{},names=new Set(),presets=[];
 if(state.presets!==undefined&&!Array.isArray(state.presets))throw Error('Saved fleet presets are invalid.');
 for(const row of state.presets||[]){const name=typeof row?.name==='string'?row.name.trim():'';if(!name||name.length>80||names.has(name))throw Error('Saved fleet presets are invalid.');names.add(name);presets.push({name,fleet:validateFleet(row.fleet)});}
 let lastPreset=typeof state.lastPreset==='string'?state.lastPreset.trim():'';if(lastPreset&&!names.has(lastPreset))lastPreset='';
 return {presets,lastPreset,remembered:state.remembered===true};
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
void Promise.resolve(chrome.action.disable?.()).then(configureOpenNexusTabs).catch(()=>{});
void chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false}).catch(()=>{});
chrome.action.onClicked.addListener(tab=>{void openPreferredView(tab).catch(()=>{});});
chrome.sidePanel.onOpened?.addListener(info=>{
  if(info.path===SIDE_PANEL_PATH&&info.tabId!==undefined)void closeDashboardTabs().then(()=>rememberView('side-panel')).catch(()=>{});
});
chrome.tabs.onUpdated?.addListener((tabId,changeInfo,tab)=>{
  if(changeInfo.url||changeInfo.status==='loading')void configureSidePanelTab({...tab,id:tabId}).catch(()=>{});
});
chrome.runtime.onInstalled.addListener(details=>{
  lifecycleReady=resetExtensionDataForUpdate(chrome,details,clearExtensionDatabase).then(()=>{chrome.alarms.create('capture',{periodInMinutes:.5});ensureCaptureLoop(true);void configureOpenNexusTabs();return refreshUpdatedDashboards(chrome,details);});
  void lifecycleReady.catch(()=>{});
});
chrome.runtime.onStartup.addListener(()=>{chrome.alarms.create('capture',{periodInMinutes:.5});ensureCaptureLoop(true);void configureOpenNexusTabs();});
// Alarms are only a watchdog. The six-second extension worker loop owns the
// normal capture cadence and an alarm restarts it if Chrome stopped the worker.
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='capture')ensureCaptureLoop(true);});
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  if(sender.id!==chrome.runtime.id) return;
  const ui=sender.url?.split(/[?#]/,1)[0]===chrome.runtime.getURL('dashboard.html');
  if(msg?.type==='GAME_PULSE') {
    if(!sender.tab?.url) return;
    void configureSidePanelTab(sender.tab).catch(()=>{});
    lifecycleReady.then(()=>getSettings()).then(s=>{try{if(seasonOrigin(sender.tab.url)===s.origin)ensureCaptureLoop(true);}catch{}}).then(()=>respond({ok:true}),()=>respond({ok:false}));
    return true;
  }
  if(!ui) return;
  updateMessages++;
  (async()=>{
    await lifecycleReady;
    if(msg.type==='OPEN_FULL_VIEW') {
      const windowId=Number(msg.windowId),nexusTabId=Number(msg.nexusTabId);
      if(!Number.isSafeInteger(windowId)||windowId<0)throw Error('Radar window is unavailable.');
      if(!Number.isSafeInteger(nexusTabId)||nexusTabId<0)throw Error('The associated Nexus tab is unavailable.');
      const nexusTab=await chrome.tabs.get(nexusTabId);
      if(!isNexusUrl(nexusTab?.url)||nexusTab.windowId!==windowId)throw Error('The associated Nexus tab is unavailable.');
      await dashboard(windowId,nexusTabId);return {ok:true};
    }
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
      s.enabled=false;stopCaptureLoop();await putSettings(s);await setStatus({state:'locked',message:s.consent.accepted?'Choose a season.':'Agreement declined. Radar is disabled.'});return {ok:true};
    }
    if(msg.type==='CONNECT') {
      const s=await getSettings();if(!hasConsent(s))throw Error('Agreement required.');
      if(activeScan&&JSON.parse(activeScan.context)[0]!==seasonOrigin(msg.origin))activeScan.contextChanged=true;
      s.origin=seasonOrigin(msg.origin);s.enabled=true;await putSettings(s);await setStatus({state:'connecting',message:'Connecting to selected season…'});
      if(!(await matchingTabs(s.origin)).length){await setStatus({state:'waiting',message:'Open Nexus in the selected season to capture reports.'});return {ok:true};}
      try{const connected=await establishConnection(s.origin,true);await chrome.storage.session.set({mapRefreshContext:connected.context});restartCaptureLoop();return {ok:true};}
      catch(error){await setStatus({state:'error',message:error.message||'Connection failed.'});throw error;}
    }
    if(msg.type==='SYNC') {await pollOperations(true);ensureCaptureLoop(false);return {ok:true};}
    if(msg.type==='REPORTS'){const c=await activeContext(),saved=await storedMapFor(c.context);return {context:c.context,reports:await reportsFor(c.context),missions:await missionsFor(c.context),fuelQuotes:await fuelQuotesFor(c.context),geometry:saved?.context===c.context?{systems:list(saved.map,'systems'),planets:list(saved.planets,'planets')}:{systems:[],planets:[]}};}
    if(msg.type==='DESTINATION_DATA'){
      const c=await activeContext(),snapshot=await destinationSnapshot(c),state=normalizedDestinationState(await metadataFor(c.context,'destination-state'));
      return {context:c.context,snapshot,catalog:destinationCatalog(snapshot),state};
    }
    if(msg.type==='SAVE_DESTINATION_STATE'){
      const c=await activeContext(),state=normalizedDestinationState(msg.state);await saveMetadata(c.context,'destination-state',state);return {context:c.context,state};
    }
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
      const preparation={id:crypto.randomUUID(),cancelled:false};scanPreparation=preparation;
      try{const c=await activeContext();preparation.context=c.context;const validatePreparation=()=>{if(preparation.cancelled)throw Error('Update cancelled.');};let saved=await storedMapFor(c.context);
        if(!saved)saved=(await loadMapFor(c,true)).data;validatePreparation();
        const index=await searchRead(c,'/api/galaxy/field-index',true,true);validatePreparation();
        await saveFieldIndex(c.context,list(index,'systems'));
        const queue=candidates(saved.map,index,msg.originId,Number(msg.radius),{examples:await searchExamplesFor(c.context),sent:await manualMarkers.get(c.context)});
        const updatedMap={...saved,map:indexSystems(list(saved.map,'systems'),normalizedFieldIndex(index))};
        await saveMapData(c.context,updatedMap);
        validatePreparation();await clearExactBeltCache(c.context);
        await beltsChanged(c.context);
        const job={id:crypto.randomUUID(),context:c.context,queue,done:0,running:queue.length>0,startedAt:Date.now()};
        await chrome.storage.session.set({scan:scanProgress(job)});
        if(job.running){activeScan=job;void runScan(job,c).catch(()=>{if(activeScan===job)activeScan=null;});}
        return {ok:true};
      }finally{if(scanPreparation===preparation)scanPreparation=null;searchBusy=false;}
    }
    // Compatibility for a dashboard loaded before this worker update. It no
    // longer advances the queue; the background scheduler owns scan progress.
    if(msg.type==='SCAN_STEP')return {ok:true};
    if(msg.type==='CANCEL_SCAN'){if(scanPreparation)scanPreparation.cancelled=true;const job=activeScan||(await chrome.storage.session.get('scan')).scan;if(job){job.running=!!activeScan;job.cancelled=true;await chrome.storage.session.set({scan:scanProgress(job)});}return {ok:true};}
    throw Error('Unsupported action');
  })().then(respond,error=>respond({error:error.message})).finally(()=>{updateMessages--;releaseUpdate.check();});return true;
});
