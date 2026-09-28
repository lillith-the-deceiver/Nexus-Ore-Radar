import {operationEpoch} from './operation-time.js';
// Current mission snapshot semantics ported from desktop Radar.
export function retainedMissionSnapshot(mission,previous){
 return {mission:{...mission,createdAt:mission.createdAt??previous?.mission?.createdAt},createdAtEpoch:operationEpoch(mission.createdAt)??previous?.createdAtEpoch??operationEpoch(previous?.mission?.createdAt)};
}
export function missionForAnalytics(row){return {...row.mission,_createdAtEpoch:row.createdAtEpoch??operationEpoch(row.mission?.createdAt)};}
export function decodeMissions(data){
 const rows=Array.isArray(data)?data:data?.missions;
 if(!Array.isArray(rows))throw Error('Invalid mission snapshot; previous markers retained.');
 // Personal sync_operation_missions skips invalid entries, not the whole feed.
 return rows.filter(m=>m!==null&&typeof m==='object'&&!Array.isArray(m)&&m.id!==undefined&&m.id!==null&&m.id!=='');
}
// Match desktop _operation_link precedence: field ID, exact named field,
// system ID, exact system name. Never guess from a partial name.
export function linkedSystemId(mission,systems){
 const fieldId=mission.targetFieldId??mission.target_field_id;
 if(fieldId!==undefined&&fieldId!==null&&fieldId!==''){
   const found=systems.find(s=>s.belts?.some(b=>String(b.id)===String(fieldId)));if(found)return found.id;
 }
 const location=String(mission.targetSystemName??mission.target_system_name??'').trim(),parts=location.split('/').map(s=>s.trim()).filter(Boolean);
 if(parts.length>1){const found=systems.find(s=>String(s.name).toLowerCase()===parts[0].toLowerCase()&&s.belts?.some(b=>String(b.name).toLowerCase()===parts.at(-1).toLowerCase()));if(found)return found.id;}
 const id=mission.targetSystemId??mission.target_system_id;
 if(id!==undefined&&id!==null&&id!==''){const found=systems.find(s=>String(s.id)===String(id));if(found)return found.id;}
 const name=location.split('/',1)[0].trim().toLowerCase();return systems.find(s=>String(s.name).toLowerCase()===name)?.id;
}
export function retainedMissionLink(mission,systems,previous){
 // Desktop mission upsert never downgrades a previously exact field link.
 if(previous?.fieldId!==null&&previous?.fieldId!==undefined)return previous;
 const systemId=linkedSystemId(mission,systems);if(systemId===undefined)return null;
 const system=systems.find(s=>String(s.id)===String(systemId)),fieldId=mission.targetFieldId??mission.target_field_id;
 let field=system.belts?.find(b=>fieldId!==null&&fieldId!==undefined&&String(b.id)===String(fieldId));
 if(!field){const parts=String(mission.targetSystemName??mission.target_system_name??'').trim().split('/').map(s=>s.trim()).filter(Boolean);if(parts.length>1&&String(system.name).toLowerCase()===parts[0].toLowerCase())field=system.belts?.find(b=>String(b.name).toLowerCase()===parts.at(-1).toLowerCase());}
 return {systemId,fieldId:field?.id??null};
}
export function activeLinkedMiningSystems(missions,links){
 const active=new Set(activeMiningSystems(missions.map(m=>({...m,targetSystemId:links[String(m.id)]?.systemId,target_system_id:undefined}))));
 return [...active];
}
export function activeMiningSystems(missions,systems){return [...new Set(missions.filter(m=>['mine','mining'].includes(String(m.missionType||'').trim().toLowerCase())&&!['','completed','complete','cancelled','canceled','failed','expired'].includes(String(m.status||'').trim().toLowerCase())).map(m=>systems?linkedSystemId(m,systems):m.targetSystemId??m.target_system_id).filter(id=>id!==undefined&&id!==null).map(String))];}
export function missionDuration(report,mission){
 if(!mission||String(report.missionId)!==String(mission.id))return null;
 const start=mission._createdAtEpoch??operationEpoch(mission.createdAt),end=operationEpoch(report.createdAt);
 return start&&end&&end>start?end-start:null;
}
