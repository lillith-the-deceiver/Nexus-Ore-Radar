import {contributionForContext} from './core.js';
import {reportStorageKey} from './report-feeds.js';
import {normalizedFieldIndex} from './field-index.js';
import {updatedContribution} from './contribution-queue.js';
import {newFuelQuote,expiredQuote,MAX_ATTEMPTS,RETRY_MS} from './fuel.js';
import {visibleInventories} from './belt-cache.js';
import {explicitInventory} from './detail-parsing.js';
import {retainedMissionSnapshot,missionForAnalytics} from './missions.js';
import {exactOperationLink,reportOperationLink,joinedReport,pendingReportRelinks,missionReportRelinks} from './report-links.js';
let opening;
const DATABASE_NAME='nexus-radar-community-v1';
export async function metadataFor(context,kind){
 const db=await database();return new Promise((resolve,reject)=>{const q=db.transaction('metadata','readonly').objectStore('metadata').get(JSON.stringify([context,kind]));q.onsuccess=()=>resolve(q.result?.value??null);q.onerror=()=>reject(q.error);});
}
export async function saveMetadata(context,kind,value){
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('metadata','readwrite');tx.objectStore('metadata').put({key:JSON.stringify([context,kind]),context,kind,value});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save Radar data'));});
}
export async function deleteMetadata(context,kind){
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('metadata','readwrite');tx.objectStore('metadata').delete(JSON.stringify([context,kind]));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not remove Radar data'));});
}
export async function mapDataFor(context){
 const db=await database();return new Promise((resolve,reject)=>{
  const q=db.transaction('metadata','readonly').objectStore('metadata').get(JSON.stringify([context,'galaxy-map']));
  q.onsuccess=()=>resolve(q.result?.value??null);q.onerror=()=>reject(q.error);
 });
}
export async function saveMapData(context,value,fieldMarkers){
 const db=await database();return new Promise((resolve,reject)=>{
  const tx=db.transaction('metadata','readwrite');tx.objectStore('metadata').put({key:JSON.stringify([context,'galaxy-map']),context,kind:'galaxy-map',value:{...value,context}});
  if(fieldMarkers!==undefined){
   const key=JSON.stringify([context,'field-index']),store=tx.objectStore('metadata'),q=store.get(key);
   q.onsuccess=()=>store.put({key,context,kind:'field-index',value:{...q.result?.value,ids:fieldMarkers,at:Date.now()}});
  }
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save galaxy map'));
 });
}
export async function commitExactBeltCache(context,runId){
 const db=await database();return new Promise((resolve,reject)=>{
  const tx=db.transaction('metadata','readwrite');
  const q=tx.objectStore('metadata').index('contextKind').openCursor([context,'system-detail']);
  q.onsuccess=()=>{const cursor=q.result;if(!cursor)return;if(cursor.value.value?.runId!==runId)cursor.delete();cursor.continue();};
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not commit exact belt cache'));
 });
}
export async function saveFieldIndex(context,entries){
 entries=normalizedFieldIndex(entries);
 const ids=entries.filter(e=>e&&typeof e==='object').map(e=>e.systemId??e.system_id??e.id).filter(id=>id!==undefined&&id!==null);
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('metadata','readwrite');tx.objectStore('metadata').put({key:JSON.stringify([context,'field-index']),context,kind:'field-index',value:{ids,at:Date.now(),entries}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save field index'));});
}
export async function visibleSystemsFor(context){
 const db=await database();const index=await new Promise((resolve,reject)=>{const q=db.transaction('metadata').objectStore('metadata').get(JSON.stringify([context,'field-index']));q.onsuccess=()=>resolve(q.result?.value);q.onerror=()=>reject(q.error);});
 return visibleInventories(await cachedSystemsFor(context),index);
}
export async function searchExamplesFor(context){
  const db=await database();return new Promise((resolve,reject)=>{
    const q=db.transaction('metadata').objectStore('metadata').index('contextKind').getAll([context,'candidate-outcome']);
    q.onsuccess=()=>resolve(q.result.filter(r=>r.kind==='candidate-outcome').map(r=>r.value));q.onerror=()=>reject(q.error);
  });
}
export async function cachedSystemsFor(context){
  const db=await database();return new Promise((resolve,reject)=>{
    const q=db.transaction('metadata').objectStore('metadata').index('contextKind').getAll([context,'system-detail']);
    q.onsuccess=()=>resolve(q.result.map(r=>r.value));q.onerror=()=>reject(q.error);
  });
}
export async function completedScanSystemIds(context,runId){
 const db=await database();return new Promise((resolve,reject)=>{
  const tx=db.transaction('metadata','readonly'),ids=[];
  const q=tx.objectStore('metadata').index('contextKind').openCursor([context,'field-inventory']);
  q.onsuccess=()=>{const cursor=q.result;if(!cursor)return;const value=cursor.value.value;if(value?.runId===runId)ids.push(String(value.systemId));cursor.continue();};
  tx.oncomplete=()=>resolve(ids);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not recover scan progress'));
 });
}
export async function recordSearchOutcome(context,runId,system,belts,rawInventory){
  const db=await database();await new Promise((resolve,reject)=>{
    const tx=db.transaction('metadata','readwrite'),store=tx.objectStore('metadata'),now=Date.now();
    const inventoryKey=JSON.stringify([context,'field-inventory',runId,String(system.id)]),q=store.get(inventoryKey);
    q.onsuccess=()=>{
      if(q.result)return;
      store.put({key:inventoryKey,context,kind:'field-inventory',value:{runId,systemId:system.id,observedAt:now,inventoryConfirmed:explicitInventory(rawInventory),rawInventory,belts}});
      // Replace the current inventory, including confirmed empty inventories.
      // Prior observations remain intact in field-inventory history.
      store.put({key:JSON.stringify([context,'system-detail',String(system.id)]),context,kind:'system-detail',value:{id:system.id,name:system.name,x:system.x,y:system.y,securityZone:system.securityZone??system.security_zone??'sentinel',belts,verifiedAt:now,runId}});
      for(const feature of system._candidate_features||[]){
        const fields=belts.filter(b=>b.type===feature.field_type);
        const value={...feature,system_id:system.id,best_full_richness:Math.max(0,...fields.filter(b=>b.remaining>=100).map(b=>b.richness)),best_any_richness:Math.max(0,...fields.map(b=>b.richness)),observed_at:now};
        store.put({key:JSON.stringify([context,'candidate-observation',runId,String(system.id),feature.field_type]),context,kind:'candidate-observation',value});
        store.put({key:JSON.stringify([context,'candidate-outcome',String(system.id),feature.field_type]),context,kind:'candidate-outcome',value});
      }
    };
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save search evidence'));
  });
  const systems=await cachedSystemsFor(context);
  return relinkStoredReports(db,context,systems);
}
function relinkStoredReports(db,context,systems){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('reports','readwrite'),store=tx.objectStore('reports');
    const q=store.index('context').getAll(context);let changed=0;
    q.onsuccess=()=>{const rows=pendingReportRelinks(q.result,systems);changed=rows.length;for(const row of rows)store.put(row);};
    tx.oncomplete=()=>resolve(changed);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Report re-matching aborted'));
  });
}
function database() {
  if (!opening) opening = new Promise((resolve,reject) => {
    const req = indexedDB.open(DATABASE_NAME,5);
    req.onupgradeneeded = event => {
      const db=req.result;
      for(const store of ['reports','outbox','missions','fuelQuotes','metadata'])if(!db.objectStoreNames.contains(store))db.createObjectStore(store,{keyPath:'key'}).createIndex('context','context');
      const metadata=req.transaction.objectStore('metadata');
      if(!metadata.indexNames.contains('contextKind'))metadata.createIndex('contextKind',['context','kind']);
      if(event.oldVersion>=4)return;
      // Recover retained originals atomically; preserve old payloads and receipts.
      const tx=req.transaction,cursor=tx.objectStore('reports').openCursor();
      cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;const row=item.value;
        const q=tx.objectStore('outbox').get(row.key);q.onsuccess=()=>{const next=updatedContribution(q.result,row.context,row.report,row.capturedAt);if(next)tx.objectStore('outbox').put(next);};item.continue();};
    };
    req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();opening=undefined;};resolve(req.result);}; req.onerror=()=>{opening=undefined;reject(req.error);};
  });
  return opening;
}
export async function saveMissions(context,missions,systems=[]){
 const db=await database();return new Promise((resolve,reject)=>{
  const links={};let changed=false;
  const tx=db.transaction(['missions','fuelQuotes','metadata'],'readwrite'),store=tx.objectStore('missions'),now=Date.now(),meta=tx.objectStore('metadata'),cutoffKey=JSON.stringify([context,'fuelCaptureStartedAt']),cutoffQuery=meta.get(cutoffKey);
  const activeKeys=new Set(missions.map(mission=>JSON.stringify([context,String(mission.id)]))),activeCursor=store.index('context').openCursor(context);activeCursor.onsuccess=()=>{const cursor=activeCursor.result;if(!cursor)return;if(!activeKeys.has(cursor.value.key)&&cursor.value.active!==false){changed=true;cursor.update({...cursor.value,active:false});}cursor.continue();};
  cutoffQuery.onsuccess=()=>{const cutoff=cutoffQuery.result?.value??now;if(!cutoffQuery.result)meta.put({key:cutoffKey,context,value:cutoff});
  for(const mission of missions){const key=JSON.stringify([context,String(mission.id)]),q=store.get(key);q.onsuccess=()=>{const old=q.result,link=exactOperationLink(mission,systems,old?.link),retained=retainedMissionSnapshot(mission,old),linkedSystem=systems.find(system=>String(system.id??system.system_id)===String(link?.systemId)),linkedBelt=linkedSystem?.belts?.find(belt=>String(belt.id??belt.field_id)===String(link?.fieldId)),linkSnapshot=linkedSystem&&linkedBelt?{systemId:link.systemId,systemName:linkedSystem.name??linkedSystem.system_name,x:linkedSystem.x,y:linkedSystem.y,securityZone:linkedSystem.securityZone??linkedSystem.security_zone,fieldId:link.fieldId,fieldName:linkedBelt.name??linkedBelt.field_name,fieldType:linkedBelt.type??linkedBelt.field_type,richness:linkedBelt.richness,remaining:linkedBelt.remaining??linkedBelt.remaining_pct,total:linkedBelt.total??linkedBelt.total_resources,position:linkedBelt.position}:old?.linkSnapshot??null;links[String(mission.id)]=link;if(old?.active===false||JSON.stringify(old?.mission)!==JSON.stringify(retained.mission)||old?.createdAtEpoch!==retained.createdAtEpoch||JSON.stringify(old?.link)!==JSON.stringify(link)||JSON.stringify(old?.linkSnapshot)!==JSON.stringify(linkSnapshot))changed=true;store.put({key,context,link,linkSnapshot,active:true,firstSeenAt:old?.firstSeenAt??now,...retained,dispatch:old?.dispatch??mission,lastSeenAt:now});if(!old){const quote=newFuelQuote(mission,cutoff,now);if(quote)tx.objectStore('fuelQuotes').put({...quote,key,context});}};}
  };
  tx.oncomplete=()=>resolve({links,changed});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Mission storage aborted'));
 });
}
export async function missionsFor(context){const db=await database();return new Promise((resolve,reject)=>{const q=db.transaction('missions').objectStore('missions').index('context').getAll(context);q.onsuccess=()=>resolve(q.result.map(missionForAnalytics));q.onerror=()=>reject(q.error);});}
export async function missionRowsFor(context){const db=await database();return new Promise((resolve,reject)=>{const q=db.transaction('missions','readonly').objectStore('missions').index('context').getAll(context);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
export async function leaseFuelQuote(context,missions,now=Date.now()){
 const db=await database(),active=new Set(missions.filter(m=>m.status==='outbound').map(m=>String(m.id)));return new Promise((resolve,reject)=>{let leased=null;const tx=db.transaction('fuelQuotes','readwrite'),store=tx.objectStore('fuelQuotes'),q=store.index('context').getAll(context);q.onsuccess=()=>{for(const row of q.result.sort((a,b)=>a.firstSeenAt-b.firstSeenAt)){if(row.status!=='pending')continue;if(expiredQuote(row,active,now)){store.put({...row,status:'expired'});continue;}if(row.attempts>=MAX_ATTEMPTS){store.put({...row,status:'failed'});continue;}if(!leased&&row.nextAttemptAt<=now){leased={...row,attempts:row.attempts+1,nextAttemptAt:now+RETRY_MS};store.put(leased);}}};tx.oncomplete=()=>resolve(leased);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Quote lease aborted'));});
}
export async function saveFuelQuote(row){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('fuelQuotes','readwrite'),store=tx.objectStore('fuelQuotes'),q=store.get(row.key);q.onsuccess=()=>{if(q.result?.status==='pending'&&q.result.attempts===row.attempts)store.put(row);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Quote storage aborted'));});}
export async function fuelQuotesFor(context){const db=await database();return new Promise((resolve,reject)=>{const q=db.transaction('fuelQuotes').objectStore('fuelQuotes').index('context').getAll(context);q.onsuccess=()=>resolve(q.result.filter(r=>r.status==='quoted'));q.onerror=()=>reject(q.error);});}
export async function capture(context, reports, source='mining') {
  return captureReportFeeds(context,[{source,reports}]);
}
export async function captureReportFeeds(context,feeds){
  for(const {source} of feeds)reportStorageKey(context,'',source);
  const systems=await cachedSystemsFor(context),db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['reports','outbox','missions'],'readwrite');let changed=false;
    for(const {source,reports} of feeds)for(const report of reports) {
      if(!report||typeof report!=='object'||Array.isArray(report)||report.id==null||report.id==='')continue;
      const key=reportStorageKey(context,report.id,source);
      const previous=tx.objectStore('reports').get(key);
      previous.onsuccess=()=>{
        const mission=tx.objectStore('missions').get(JSON.stringify([context,String(report.missionId)]));
        mission.onsuccess=()=>{
          const link=mission.result?.link?.fieldId!=null?mission.result.link:
            previous.result?.link?.fieldId!=null?previous.result.link:
            reportOperationLink(report,systems,mission.result?.link);
          if(JSON.stringify(previous.result?.report)!==JSON.stringify(report)||JSON.stringify(previous.result?.link)!==JSON.stringify(link))changed=true;
          tx.objectStore('reports').put({key,context,source,report,link,capturedAt:Date.now()});
        };
      };
      const contribution=source==='mining'?contributionForContext(context,report):null;
      if(contribution) {
        const request=tx.objectStore('outbox').get(key);
        request.onsuccess=()=>{
          const next=updatedContribution(request.result,context,report);
          if(next)tx.objectStore('outbox').put(next);
        };
      }
    }
    tx.oncomplete=()=>resolve(changed);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || Error('Capture aborted'));
  });
}
export async function counts(context) {
  const db=await database();
  const count=store=>new Promise((resolve,reject)=>{
    const q=db.transaction(store).objectStore(store).index('context').count(context);
    q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
  });
  const queuedRaids=await new Promise((resolve,reject)=>{
    const q=db.transaction('outbox').objectStore('outbox').index('context').getAll(context);
    q.onsuccess=()=>resolve(q.result.filter(row=>row.state==='pending').length);q.onerror=()=>reject(q.error);
  });
  return {localReports:await count('reports'),queuedRaids};
}
export async function relinkMissionReports(context){
 const db=await database();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['reports','missions'],'readwrite'),store=tx.objectStore('reports');
  const reports=store.index('context').getAll(context),missions=tx.objectStore('missions').index('context').getAll(context);let ready=0,changed=0;
  const apply=()=>{if(++ready!==2)return;const rows=missionReportRelinks(reports.result,missions.result);changed=rows.length;for(const row of rows)store.put(row);};
  reports.onsuccess=apply;missions.onsuccess=apply;
  tx.oncomplete=()=>resolve(changed);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Mission report re-matching aborted'));
 });
}
export async function reportsFor(context) {
  const systems=await cachedSystemsFor(context),db=await database();
  await relinkStoredReports(db,context,systems);
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['reports','missions']),q=tx.objectStore('reports').index('context').getAll(context),missions=tx.objectStore('missions').index('context').getAll(context);
    tx.oncomplete=()=>{const links=new Map(missions.result.map(row=>[String(row.mission.id),row.link]));resolve(q.result.map(row=>joinedReport(row,links.get(String(row.report.missionId)),systems)));};
    tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Report join aborted'));
  });
}
export async function leaseContribution(context,now=Date.now()){
  const db=await database();return new Promise((resolve,reject)=>{
    let leased=null;const tx=db.transaction('outbox','readwrite'),store=tx.objectStore('outbox'),q=store.index('context').getAll(context);
    q.onsuccess=()=>{for(const row of q.result.sort((a,b)=>a.capturedAt-b.capturedAt)){
      if(leased||row.format!==2||row.state!=='pending'||(row.nextAttemptAt||0)>now)continue;
      leased={...row,attempts:(row.attempts||0)+1,leaseId:crypto.randomUUID(),nextAttemptAt:now+60000};store.put(leased);
    }};
    tx.oncomplete=()=>resolve(leased);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Upload lease aborted'));
  });
}
export async function finishContribution(row,result){
  const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction('outbox','readwrite'),store=tx.objectStore('outbox'),q=store.get(row.key);
    q.onsuccess=()=>{const current=q.result;if(current?.state==='pending'&&current.leaseId===row.leaseId)store.put({...current,...result});};
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Upload acknowledgement aborted'));
  });
}
