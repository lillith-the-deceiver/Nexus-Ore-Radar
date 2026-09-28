import {asFloat,firstPresent,desktopRound} from './detail-parsing.js';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
// sync_live_field_index: the index updates system coordinates/names as well as
// summaries. Do not require a system to have existed in the earlier galaxy map.
export function normalizedFieldIndex(payload){
 const rows=(Array.isArray(payload)?payload:payload?.systems)||[];
 if(!Array.isArray(rows))throw Error('Unexpected field-index response.');
 const entries=rows.filter(object);
 if(!entries.length)throw Error('Nexus returned an empty live field index; the saved overview was left unchanged.');
 const normalized=[],seen=new Set();
 for(const entry of entries){
  const raw=firstPresent(entry,'systemId','system_id','id');
  if(raw===null||(typeof raw==='string'&&!/^[+-]?\d+$/.test(raw.trim())))continue;
  const id=Math.trunc(Number(raw));if(!Number.isSafeInteger(id)||id<=0)continue;
  const type=String(firstPresent(entry,'fieldType','field_type')||'ore').trim().toLowerCase();
  const zone=String(firstPresent(entry,'securityZone','security_zone')||'sentinel').trim().toLowerCase();
  if(!['ore','gas','plasma','ice'].includes(type)||!['sentinel','open','dead'].includes(zone))continue;
  const count=asFloat(firstPresent(entry,'fieldCount','field_count'));if(!Number.isFinite(count))continue;
  const key=JSON.stringify([id,type]);if(seen.has(key))throw Error('Duplicate field-index summary.');seen.add(key);
  const minimum=Math.max(0,asFloat(firstPresent(entry,'minRichness','min_richness')));
  normalized.push({...entry,systemId:id,fieldType:type,
   systemName:String(firstPresent(entry,'systemName','system_name','name')||`System ${id}`).trim(),
   systemX:asFloat(firstPresent(entry,'systemX','x')),systemY:asFloat(firstPresent(entry,'systemY','y')),securityZone:zone,
   fieldCount:Math.max(0,Math.trunc(count)),minRichness:minimum,maxRichness:Math.max(minimum,asFloat(firstPresent(entry,'maxRichness','max_richness'))),
   totalRemaining:Math.max(0,asFloat(firstPresent(entry,'totalRemaining','total_remaining'))),totalCapacity:Math.max(0,asFloat(firstPresent(entry,'totalCapacity','total_capacity')))});
 }
 return normalized;
}
export function indexSystems(map,entries){
 const systems=new Map(map.map(s=>[String(s.id),s]));
 for(const e of entries)systems.set(String(e.systemId),{...systems.get(String(e.systemId)),id:e.systemId,name:e.systemName,x:e.systemX,y:e.systemY,securityZone:e.securityZone});
 return [...systems.values()];
}
export function indexSummary(e){return {field_type:e.fieldType,field_count:e.fieldCount,max_richness:e.maxRichness,
 remaining_pct:desktopRound(Math.max(0,Math.min(100,e.totalCapacity>0?e.totalRemaining*100/e.totalCapacity:0)),1)};}
// sync_galaxy_map accepts the game's legacy marker-only index shapes too.
export function mapFieldIds(payload){
 const rows=Array.isArray(payload)?payload:payload?.systems_with_fields??payload?.systems??payload?.systemIds??[];
 if(!Array.isArray(rows))return [];
 return rows.flatMap(row=>object(row)?[row.id||row.systemId]:Number.isInteger(row)?[row]:[]).filter(id=>id!=null);
}
