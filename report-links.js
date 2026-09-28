import {retainedMissionLink} from './missions.js';

export function exactOperationLink(target,systems,previous){
 const link=retainedMissionLink(target,systems,previous);
 if(!link)return null;
 // Preserve an existing dispatch snapshot, not today's belt characteristics.
 if(previous?.fieldId!=null&&Object.hasOwn(previous,'fieldType'))return previous;
 const system=systems.find(s=>String(s.id)===String(link.systemId));
 const field=system?.belts?.find(b=>link.fieldId!=null&&String(b.id)===String(link.fieldId));
 // A legacy ID-only snapshot cannot acquire missing characteristics by guessing.
 if(previous?.fieldId!=null&&!field)return previous;
 return {...link,systemName:system?.name??null,fieldName:field?.name??null,fieldType:field?.type??null,richness:field?.richness??null,remaining:field?.remaining??null,securityZone:field?(system?.securityZone??system?.security_zone??null):null,totalResources:field?.total??null};
}
function firstPresent(row,...keys){for(const key of keys)if(row[key]!=null&&row[key]!=='')return row[key];return null;}
export function reportOperationLink(report,systems,missionLink){
 // Desktop prefers the retained mission link, including a system-only link.
 if(missionLink?.systemId)return missionLink;
 return exactOperationLink({targetSystemId:firstPresent(report,'targetSystemId','target_system_id','systemId','system_id'),targetFieldId:firstPresent(report,'targetFieldId','target_field_id','fieldId','field_id'),targetSystemName:report.locationName},systems);
}
export function joinedReport(row,missionLink,systems){
 const link=missionLink?.fieldId!=null?missionLink:row.link??reportOperationLink(row.report,systems,missionLink);
 return {...row.report,_radarLink:link,_radarSource:row.source??'mining',_radarSyncedAt:Math.floor((row.capturedAt??0)/1000)};
}
export function missionReportRelinks(rows,missions){
 const links=new Map(missions.filter(row=>row.link?.fieldId!=null).map(row=>[String(row.mission.id),row.link]));
 return rows.flatMap(row=>{
  if(row.report.missionId==null)return [];
  const link=links.get(String(row.report.missionId));
  return link&&JSON.stringify(link)!==JSON.stringify(row.link)?[{...row,link}]:[];
 });
}

// Desktop relink_pending_operation_reports: retry the newest 500 incomplete
// saved reports using their own exact identities, not a coarse mission link.
export function pendingReportRelinks(rows,systems){
 return rows.filter(row=>row.link?.fieldId==null)
  .sort((a,b)=>(b.capturedAt??0)-(a.capturedAt??0)).slice(0,500)
  .flatMap(row=>{const link=reportOperationLink(row.report,systems);
   return link?.fieldId!=null?[{...row,link}]:[];});
}
