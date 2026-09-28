import {CONSENT_VERSION,hasConsent} from './core.js';
import {bindGuide} from './guide.js';
bindGuide();
import {analyze} from './analytics.js';
import {matches,distancesFrom} from './search.js';
import {desktopSearch} from './desktop-search.js';
import {renderDesktopHistory} from './desktop-history.js';
import {renderDesktopResults,matchedColumnCount} from './desktop-results.js';
import {desktopLocations,renderDesktopLocations} from './desktop-locations.js';
import {saveLocation,syncPlanetLocations,locationOptionLabel} from './locations.js';
import {compatibleState,connectedState,RELOAD_MESSAGE} from './connection-state.js';
import {analyticsStamp,calendarStamp} from './analytics-refresh.js';
import {formatDuration} from './analytics-display.js';
import {renderDesktopYieldFuel,desktopYieldFuelData} from './desktop-yield-fuel.js';
import {dashboardUpdateNeeded} from './release-updates.js';
import {updateSearchButtons,validDisplayFilter} from './search-controls.js';
import {scanStatus} from './scan-timing.js';
import {scanOutcome,progressRetry} from './scan-feedback.js';
import {exactUpdateLabel} from './belt-cache.js';
import {sectionRenderer} from './analytics-sections.js';
import {showToast,copySystemName,analyticsSyncLabel} from './desktop-feedback.js';
import {resourceTotals} from './resource-totals.js';
const loadedVersion=chrome.runtime.getManifest().version;
const $=id=>document.getElementById(id),fmt=n=>n===null||n===undefined?'—':Math.round(n).toLocaleString();
const request=async message=>{const r=await chrome.runtime.sendMessage(message);if(r?.error)throw Error(r.error);return r;};
const guard=fn=>async()=>{try{$('error').textContent='';await fn();}catch(e){$('error').textContent=e.message;}};
let previousSeasons='',currentContext='',period='total',records=[],analysis,scanState,showSeason=false,lastReportStamp=0,lastScanSignature='',lastRecordsSignature='',sent={},refreshing=false,refreshAgain=false;
let missions=[],fuelQuotes=[],geometry={},markers=null;
let cachedBelts=[],lastBeltsStamp='',lastCalendarStamp='';
let scanStarting=false,scanStopping=false;
let nextBeltReadAt=0,lastBeltScanId='';
let progressFailures=0,progressRetryAt=0;
let exactUpdatedAt=0;
const renderSection=sectionRenderer();
const prefKey=()=>`ui:${currentContext}`;
// Static, source-extracted desktop markup. Game data is never inserted as HTML.
$('search-body').innerHTML=desktopSearch;
document.body.insertAdjacentHTML('beforeend',desktopLocations);
let preferences={},mapSystems=[],searchFilter={type:'all',zone:'all',richness:1.0001,remaining:100};
let originsLoadedContext='',originsRefreshAttemptedContext='',nextOriginsAttempt=0;
async function savePreferences(){await chrome.storage.local.set({[prefKey()]:{...preferences,filter:searchFilter,customRichness:$('custom-richness').value||'',radius:$('radius').value,origin:$('search-origin').value}});}
function restoreHidden(){document.querySelectorAll('[data-hide]').forEach(b=>{const hidden=!!preferences.hidden?.[b.dataset.hide];$(b.dataset.hide).hidden=hidden;b.textContent=hidden?'Show':'Hide';b.setAttribute('aria-expanded',String(!hidden));});}
function renderOrigins(){const selected=$('search-origin').value||preferences.origin;const options=(preferences.locations||[]).map(l=>new Option(locationOptionLabel(l),String(l.id)));$('search-origin').replaceChildren(...(options.length?options:[new Option('Add a saved location to calculate proximity','')]));$('search-origin').value=options.some(o=>o.value===selected)?selected:(options[0]?.value||'');preferences.origin=$('search-origin').value;}
async function loadOrigins(){const context=currentContext,refresh=originsRefreshAttemptedContext!==context;originsRefreshAttemptedContext=context;const data=await request({type:'LOAD_MAP',refresh});if(context!==currentContext)return;mapSystems=data.systems;preferences.locations=syncPlanetLocations(preferences.locations||[],data.planets,data.systems);if(data.refreshError)$('error').textContent=data.refreshError;renderOrigins();await savePreferences();if(context!==currentContext)return;originsLoadedContext=context;nextOriginsAttempt=0;renderScanControls();renderSearch(true);}
function locationMessage(text='',isError=false){const message=$('locations-message');message.textContent=text;message.className=`text-xs font-bold ${text?'':'hidden'} ${isError?'text-rose-400':'text-emerald-400'}`;}
async function saveLocationRows(rows,origin=$('search-origin').value){
  const context=currentContext;
  const next={...preferences,locations:rows,filter:searchFilter,customRichness:$('custom-richness').value||'',radius:$('radius').value,origin};
  await chrome.storage.local.set({[`ui:${context}`]:next});
  if(context!==currentContext)return false;
  preferences=next;$('search-origin').value='';renderOrigins();
  return true;
}
function showLocations(){
  renderDesktopLocations(preferences.locations||[],async(from,to)=>{
    const rows=[...(preferences.locations||[])];if(to<0||to>=rows.length||from===to)return;
    rows.splice(to,0,rows.splice(from,1)[0]);
    try{if(await saveLocationRows(rows))showLocations();}catch(error){locationMessage(error.message,true);}
  },async(id,label)=>{
    if(!confirm(`Remove saved location "${label}" from this computer?`))return;
    try{if(await saveLocationRows(preferences.locations.filter(l=>l.id!==id))){showLocations();renderSearch(true);locationMessage(`Removed ${label}.`);}}
    catch(error){locationMessage(error.message,true);}
  });
  $('locations-modal').classList.remove('hidden');
}
function el(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
async function refresh() {
  if(scanState?.running&&Date.now()<progressRetryAt)return;
  if(refreshing){refreshAgain=true;return;}refreshing=true;
  try {
    let state;
    try{state=await request({type:'STATE'});progressFailures=0;progressRetryAt=0;}
    catch(error){
      if(!scanState?.running)throw error;
      const retry=progressRetry(++progressFailures,error);progressRetryAt=Date.now()+retry.delay;
      $('scan-status').textContent=retry.message;return;
    }
    if(dashboardUpdateNeeded(state,loadedVersion)){location.reload();return;}
    if(!compatibleState(state)){
      $('workspace').hidden=false;$('season-panel').hidden=false;$('radar').hidden=true;$('change-season').hidden=true;
      $('connection-badge').textContent='Extension reload required';$('connection').textContent=RELOAD_MESSAGE;$('connect').disabled=true;
      return;
    }
    const {settings,status,seasons,connection,scan,missionMarkers}=state;
    $('connect').disabled=false;
    const accepted=hasConsent(settings), known=settings.consent?.version===CONSENT_VERSION;
    $('workspace').hidden=!accepted;$('locked').hidden=accepted||!known;
    if(!known&&!$('agreement').open)$('agreement').showModal();
    const sig=JSON.stringify(seasons);if(sig!==previousSeasons){previousSeasons=sig;const selected=$('seasons').value||settings.origin||seasons[0]?.origin;$('seasons').replaceChildren(...seasons.map(s=>new Option(s.name,s.origin)));$('seasons').value=selected;}
    const connected=connectedState(settings,connection,accepted);
    $('radar').hidden=!connected;$('change-season').hidden=!connected;$('season-panel').hidden=connected&&!showSeason;
    $('connection').textContent=status?.message||'Choose a season.';
    $('connection-badge').textContent=connected?`${seasons.find(s=>s.origin===connection.origin)?.name} · ${status?.state==='connected'?'Connected':status?.state==='waiting'?'Waiting for game':'Connection needs attention'}`:'Not connected';
    if(!connected)return;
    $('analytics-loading-state').textContent=analyticsSyncLabel(status);
    $('analytics-loading-state').classList.toggle('text-rose-300',status?.state==='error');
    if(currentContext!==connection.context){
      currentContext=connection.context;lastReportStamp=0;records=[];missions=[];fuelQuotes=[];geometry={};lastScanSignature='';lastRecordsSignature='';
      cachedBelts=[];mapSystems=[];lastBeltsStamp='';exactUpdatedAt=0;originsLoadedContext='';originsRefreshAttemptedContext='';nextOriginsAttempt=0;
      preferences=(await chrome.storage.local.get(prefKey()))[prefKey()]||{};sent=preferences.sent||{};
      searchFilter=preferences.filter||{type:'all',zone:'all',richness:1.0001,remaining:100};
      $('custom-richness').value=preferences.customRichness||'';$('radius').value=preferences.radius||350;
      $('search-origin').value='';renderOrigins();renderAnalytics();
      restoreHidden();updateFilterButtons();showSeason=false;
    }
    if(originsLoadedContext!==currentContext&&Date.now()>=nextOriginsAttempt){
      nextOriginsAttempt=Date.now()+3000;
      try{await loadOrigins();}catch(e){$('error').textContent=e.message;renderScanControls();}
    }
    markers=missionMarkers?.context===currentContext?missionMarkers:null;
    sent=state.manualSent||{};
    const reportStamp=analyticsStamp(currentContext,state);
    const previousScan=scanState;
    scanState=scan?.context===currentContext?scan:null;
    const beltsStamp=currentContext+':'+(state.beltsRevision?.context===currentContext?state.beltsRevision.value:'initial');
    renderSearch();
    await Promise.allSettled([refreshAnalyticsData(reportStamp),refreshBeltData(beltsStamp)]);
    if(previousScan?.running&&previousScan.context===scanState?.context&&previousScan.id===scanState?.id&&!scanState.running){const outcome=scanOutcome(scanState);if(outcome?.toast)showToast(outcome.toast);}
  }finally{refreshing=false;if(refreshAgain){refreshAgain=false;queueMicrotask(()=>refresh().catch(()=>{}));}}
}
async function refreshAnalyticsData(stamp){
  if(stamp===lastReportStamp)return;
  const context=currentContext;
  try{
    const data=await request({type:'REPORTS'});
    if(context!==currentContext||data.context!==context)return;
    const signature=JSON.stringify([data.reports,data.missions,data.fuelQuotes,data.geometry]);
    if(signature!==lastRecordsSignature){records=data.reports;missions=data.missions||[];fuelQuotes=data.fuelQuotes||[];geometry=data.geometry||{};renderAnalytics();lastRecordsSignature=signature;}
    lastReportStamp=stamp;
  }catch(error){
    if(context===currentContext){$('analytics-loading-state').textContent='Could not load analytics. Try again.';$('analytics-loading-state').classList.add('text-rose-300');}
  }
}
async function refreshBeltData(stamp){
  if(stamp===lastBeltsStamp)return;
  const scanId=scanState?.running?`${currentContext}:${scanState.id}`:'';
  if(scanId!==lastBeltScanId){lastBeltScanId=scanId;nextBeltReadAt=0;}
  if(scanId&&Date.now()<nextBeltReadAt)return;
  const context=currentContext;
  try{
    const data=await request({type:'BELTS'});
    if(context!==currentContext||data.context!==context)return;
    cachedBelts=data.systems;exactUpdatedAt=data.lastExactUpdate||0;if(data.mapSystems)mapSystems=data.mapSystems;
    renderSearch(true);lastBeltsStamp=stamp;
  }catch(error){if(context===currentContext)$('error').textContent=error.message;}
  finally{if(context===currentContext&&scanId&&lastBeltScanId===scanId)nextBeltReadAt=Date.now()+4000;}
}
function renderAnalytics(){const now=Date.now();lastCalendarStamp=calendarStamp(period,now);analysis=analyze(records,period,now,missions,fuelQuotes,geometry);
  renderSection('summary',[analysis.runs,analysis.resources,analysis.averageDuration],()=>{$('runs').textContent=fmt(analysis.runs);$('resources').textContent=fmt(analysis.resources);$('duration').textContent=formatDuration(analysis.averageDuration);});
  renderSection('resources',analysis.totals,()=>{
  $('total-yields').replaceChildren(...resourceTotals(analysis.totals).map(({total,label})=>{const row=el('div',undefined,'value-row'),value=el('strong',fmt(total)+' ','green');value.append(el('span','total','font-normal text-slate-400'));row.append(el('span',label),value);return row;}));
  if(!$('total-yields').children.length)$('total-yields').textContent='No completed exact deliveries in this period.';
  });
  const fuel=desktopYieldFuelData(analysis.tables);renderSection('fuel',fuel,()=>renderDesktopYieldFuel(fuel));
  renderSection('mechanics',[analysis.lifetimeRuns,analysis.cycles,analysis.mechanics],()=>{
  $('cycles').textContent=`${fmt(analysis.lifetimeRuns)} completed runs · ${fmt(analysis.cycles)} cycles`;
  renderMechanics();
  });
  renderSection('history',analysis.yieldHistory,()=>renderChart());
}
function renderMechanics(){const m=analysis.mechanics,container=$('mining-mechanics');container.replaceChildren();const rate=n=>n===null?'—':n.toLocaleString(undefined,{maximumFractionDigits:2});
  $('cycles').append(el('span',`${rate(m.average)} avg cycles/run`,'muted push'));
  if(m.breakdowns.length){container.append(el('h3','AVERAGE BREAKDOWN RATE'));const grid=el('div',undefined,'two');for(const b of m.breakdowns){const row=el('div',undefined,'value-row breakdown-row');row.append(el('span',b.label),el('strong',b.perCycle===null?'—':`${rate(b.perCycle)}% / ship / cycle`,'gold'),el('span',`${rate(b.returned)}% returned broken`,'gold'));grid.append(row);}container.append(grid);}
  const yields=(title,data)=>{const head=el('div',undefined,'row mechanics-heading');head.append(el('h3',title),el('span',`${fmt(data.runs)} runs`,'run-badge'));container.append(head);const grid=el('div',undefined,'two');for(const r of data.rows){const row=el('div',undefined,'value-row'),label=el('span');label.append(el('span',r.label+' '),el('span',r.hull,'muted'));const value=el('strong',r.value===null?'—':`${rate(r.value)} / ship / cycle`,r.value===null?'text-slate-600':'green');if(r.preliminary)value.append(el('span',`Early sample · ${r.runs} run${r.runs===1?'':'s'}`,'block text-[10px] font-normal text-slate-400'));row.append(label,value);grid.append(row);}container.append(grid);};
  yields('DEDICATED SHIP YIELDS',m.dedicated);container.append(el('h3','EXCAVATORS ONLY — TOTAL MINING RUNS AND CYCLES'));const totals=el('div',undefined,'value-row cyan');totals.append(el('strong',`${fmt(m.excavatorTotals.runs)} completed runs · ${fmt(m.excavatorTotals.cycles)} cycles`),el('span',`${rate(m.excavatorTotals.average)} avg cycles/run`,'muted'));container.append(totals);yields('EXCAVATORS ONLY YIELD',m.excavators);
}
function renderChart(){if(!analysis)return;
  const history=analysis.yieldHistory,buckets=history.buckets||[],dateLabel=epoch=>new Date(epoch*1000).toLocaleDateString(undefined,{day:'2-digit',month:'short'});
  $('history-period').textContent=buckets.length?`${dateLabel(buckets[0].start)} – ${dateLabel(buckets[buckets.length-1].start)} · ${{hour:'Hourly',day:'Daily',week:'Weekly'}[history.granularity||'day']}`:'';
  if($('history-body').hidden)return;$('history-empty').hidden=true;
  renderDesktopHistory(analysis.yieldHistory);
}
function filter(){return searchFilter;}
function renderSearch(force=false){
  renderScanControls();
  const outcome=scanOutcome(scanState);
  $('scan-status').textContent=outcome?outcome.message:scanStatus(scanState);
  $('scan-status').classList.toggle('text-rose-400',!!outcome?.error);
  $('refresh-last-updated').textContent=exactUpdateLabel(exactUpdatedAt);
  if(!validDisplayFilter(filter()))return;
  const signature=JSON.stringify([lastBeltsStamp,filter(),sent,$('search-origin').value,markers?.activeSystemIds,markers?.stale,matchedColumnCount()]);if(!force&&signature===lastScanSignature)return;lastScanSignature=signature;
  const selected=(preferences.locations||[]).find(l=>String(l.id)===$('search-origin').value);
  const results=matches(distancesFrom(cachedBelts,mapSystems,selected?.system_id),filter());$('match-count').textContent=`${results.length} Systems · ${results.reduce((n,s)=>n+s.belts.length,0)} Belts`;$('matches-empty').hidden=!!results.length;
  $('matches-empty').textContent=scanState?'No checked systems match these filters.':'No scan results yet.';
  const automatic=new Set(markers?.activeSystemIds||[]);
  renderDesktopResults(results.map(s=>({system_id:s.id,system_name:s.name,distance:s.distance,security_zone:s.securityZone,sent_at:sent[s.id]||automatic.has(String(s.id))?1:null,belts:s.belts.map(b=>({field_type:b.type,richness:b.richness,total_resources:b.total,remaining_pct:b.remaining}))})),{copySystemName,setSystemSent:async(id,value)=>{
    try{const result=await request({type:'SET_SENT',systemId:id,sent:value});sent=result.manualSent;renderSearch(true);showToast(value?'Fleet marked as sent':'Fleet marker cleared');}
    catch(error){showToast(`Could not update fleet marker: ${error.message}`,true);}
  }});
  $('matches').querySelectorAll('[data-toggle-sent]').forEach(b=>{b.title=markers?.stale?'Mission sync delayed; showing last known state':automatic.has(b.dataset.toggleSent)?'Active mining fleet':sent[b.dataset.toggleSent]?'Click to clear manual marker':'Click to mark sent';});
  $('matches-empty').hidden=true;
}
function renderScanControls(){
  const updating=scanStarting||!!scanState?.running,stopping=scanStopping||!!(scanState?.running&&scanState?.cancelled);
  $('scan').disabled=updating||originsLoadedContext!==currentContext;$('radius').disabled=updating;
  $('scan').textContent=scanStarting?'Starting…':updating?'Updating…':'⚡ Update belts';
  $('cancel-scan').hidden=!updating;$('cancel-scan').classList.toggle('hidden',!updating);
  $('cancel-scan').disabled=!updating||stopping;$('cancel-scan').textContent=stopping?'Stopping…':'Cancel';
}
$('agree').onclick=guard(async()=>{await request({type:'CONSENT',accepted:true});$('agreement').close();await refresh();});$('disagree').onclick=guard(async()=>{await request({type:'CONSENT',accepted:false});$('agreement').close();await refresh();});$('agreement').addEventListener('cancel',e=>e.preventDefault());$('review').onclick=()=>$('agreement').showModal();
$('connect').onclick=guard(async()=>{const b=$('connect');b.disabled=true;b.textContent='Connecting…';try{await request({type:'CONNECT',origin:$('seasons').value});showSeason=false;currentContext='';await refresh();}finally{b.disabled=false;b.textContent='Connect';}});
$('change-season').onclick=()=>{showSeason=!showSeason;$('season-panel').hidden=!showSeason;};
$('sync').onclick=guard(async()=>{
 const button=$('sync');button.disabled=true;button.textContent='Syncing…';$('analytics-body').setAttribute('aria-busy','true');
 try{await request({type:'SYNC'});await refresh();}
 finally{button.disabled=false;button.textContent='Sync';$('analytics-body').removeAttribute('aria-busy');}
});
document.querySelectorAll('[data-hide]').forEach(b=>{b.setAttribute('aria-controls',b.dataset.hide);b.setAttribute('aria-expanded','true');b.onclick=guard(async()=>{preferences.hidden={...preferences.hidden,[b.dataset.hide]:!$(b.dataset.hide).hidden};restoreHidden();if(b.dataset.hide==='history-body'&&!$('history-body').hidden)renderChart();if(['matched-body','search-body'].includes(b.dataset.hide)&&!$(b.dataset.hide).hidden)renderSearch(true);await savePreferences();});});document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{period=b.dataset.period;document.querySelectorAll('[data-period]').forEach(x=>x.classList.toggle('selected',x===b));renderAnalytics();});let chartWidth=0;new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width>0&&Math.abs(width-chartWidth)>1){chartWidth=width;renderChart();}}).observe($('history-charts'));
function updateFilterButtons(){updateSearchButtons(document,searchFilter,$('custom-richness').value!=='');}
document.querySelectorAll('[data-onclick]').forEach(b=>{
 const action=b.dataset.onclick,match=action.match(/^(setRichness|setPct|setZone|setOreType)\(([^,)]+)/);
 if(match)b.onclick=guard(async()=>{const key={setRichness:'richness',setPct:'remaining',setZone:'zone',setOreType:'type'}[match[1]],raw=match[2].replaceAll("'",'');searchFilter[key]=['richness','remaining'].includes(key)?Number(raw):raw;if(key==='richness')$('custom-richness').value='';updateFilterButtons();renderSearch(true);await savePreferences();});
 else if(action==='openLocationsModal()')b.onclick=()=>{showLocations();locationMessage('');$('location-label-input').focus();};
 else if(action==='closeLocationsModal()')b.onclick=()=>$('locations-modal').classList.add('hidden');
 else if(action==='addSavedLocation()')b.onclick=guard(async()=>{
  b.disabled=true;locationMessage('Saving...');
  try{const result=saveLocation(preferences.locations||[],$('location-system-input').value,$('location-label-input').value,mapSystems,crypto.randomUUID());
   if(!await saveLocationRows(result.rows,String(result.location.id)))return;showLocations();renderSearch(true);
   $('location-label-input').value='';$('location-system-input').value='';locationMessage(`Saved ${result.location.label}.`);
  }catch(e){locationMessage(e.message,true);}finally{b.disabled=false;}
 });
});
$('custom-richness').oninput=guard(async()=>{const value=Number($('custom-richness').value);if($('custom-richness').value!==''&&Number.isFinite(value)&&value>=0){searchFilter.richness=value;updateFilterButtons();renderSearch(true);await savePreferences();}});
$('search-origin').onchange=guard(async()=>{renderSearch(true);await savePreferences();});$('radius').onchange=guard(savePreferences);
$('scan').onclick=guard(async()=>{
 if(scanStarting||scanState?.running)return;
 const radius=Number($('radius').value);
 if(!Number.isFinite(radius)||radius<1||radius>10000){$('scan-status').textContent='Enter an update radius between 1 and 10,000 ly.';$('radius').focus();return;}
 const selected=(preferences.locations||[]).find(l=>String(l.id)===$('search-origin').value);if(!selected)throw Error('Choose a saved search origin.');
 scanStarting=true;renderScanControls();$('scan-status').textContent='Starting update…';
 try{await request({type:'START_SCAN',originId:selected.system_id,radius});await refresh();if(scanState&&!scanState.running&&scanState.total===0&&!scanState.error)showToast('No supported belt systems in range');}
 catch(error){$('scan-status').textContent=`Update could not be started: ${error.message}`;}
 finally{scanStarting=false;renderScanControls();}
});
$('cancel-scan').onclick=guard(async()=>{
 if(scanStopping)return;scanStopping=true;renderScanControls();
 try{await request({type:'CANCEL_SCAN'});await refresh();}
 catch(error){showToast(`Could not stop update: ${error.message}`,true);}
 finally{scanStopping=false;renderScanControls();}
});
chrome.storage.onChanged.addListener(()=>refresh().catch(()=>{}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh().catch(e=>{$('error').textContent=e.message;});});
window.addEventListener('resize',()=>{if(currentContext)renderSearch();});
async function tick(){try{if(scanState?.running)await refresh();if(analysis&&lastCalendarStamp!==calendarStamp(period))renderAnalytics();}catch(e){$('error').textContent=e.message;}finally{setTimeout(tick,500);}}
guard(refresh)();tick();
