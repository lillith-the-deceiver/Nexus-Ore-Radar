export function list(data,key) {
  const result=Array.isArray(data)?data:data?.[key];
  if(!Array.isArray(result))throw Error(`Unexpected ${key} response.`);
  return result;
}
export function candidates(map,index,originId,radius,{examples=[],sent={}}={}) {
  if(!Number.isFinite(radius) || radius<1 || radius>10000)throw Error('Radius must be between 1 and 10000 ly.');
  const originalSystems=list(map,'systems'), origin=originalSystems.find(s=>String(s.id)===String(originId));
  if(!origin || !Number.isFinite(Number(origin.x)) || !Number.isFinite(Number(origin.y)))throw Error('Choose a valid search origin.');
  const entries=normalizedFieldIndex(index),systems=indexSystems(originalSystems,entries),indexed=new Map();
  for(const e of entries){const id=typeof e==='object'?e.systemId ?? e.id:e;if(id!==undefined && id!==null){const key=String(id);indexed.set(key,[...(indexed.get(key)||[]),e]);}}
  const queue=systems.filter(s=>indexed.has(String(s.id))||sent[s.id]).map(s=>{
    const distance=Math.hypot(Number(s.x)-Number(origin.x),Number(s.y)-Number(origin.y));
    const summaries=(indexed.get(String(s.id))||[]).map(indexSummary);
    return {...s,system_id:s.id,system_name:s.name||'',distance,_sent_recheck:!!sent[s.id],summary_fields:summaries};
  }).filter(s=>Number.isFinite(s.distance)&&s.distance<=radius);
  return rankDetailCandidates(queue,0,0,UPDATE_RANKING,outcomeModel(examples,1,100));
}
export function fields(data) {
  return systemDetailFields(data).map(f=>{
    const position=Object.hasOwn(f,'position')?f.position:0,richness=Object.hasOwn(f,'richness')?asFloat(f.richness,NaN):1;
    if(Number.isNaN(richness))throw Error('Invalid field richness.');
    return {id:f.id??null,name:Object.hasOwn(f,'name')?f.name:`Asteroid Field ${position}`,position,type:Object.hasOwn(f,'fieldType')?f.fieldType:Object.hasOwn(f,'field_type')?f.field_type:'ore',richness,total:Math.max(0,asFloat(firstPresent(f,'totalResources','total_resources'))),remaining:remainingPct(f),zone:f.zone,quantityKnown:firstPresent(f,'totalResources','total_resources')!==null,remainingResources:firstPresent(f,'remainingResources','remaining_resources'),reportedRemainingPct:firstPresent(f,'remainingPct','remaining_pct')};
  }).sort((a,b)=>b.richness-a.richness||(a.position||0)-(b.position||0));
}
export function matches(results,filter) {
  return results.filter(s=>['sentinel','open','dead'].includes((s.securityZone||'sentinel').toLowerCase())&&(filter.zone==='all'||(s.securityZone||'sentinel').toLowerCase()===filter.zone))
    .map(s=>({...s,belts:s.belts.map(b=>({...b,richness:desktopRound(Number(b.richness||0),2),remaining:b.remaining===null?null:desktopRound(Number(b.remaining||0),1)})).filter(b=>['ore','gas','plasma','ice'].includes(b.type)&&(filter.type==='all'||b.type===filter.type)&&b.richness>=filter.richness&&b.remaining!==null&&b.remaining>=filter.remaining).sort((a,b)=>b.richness-a.richness||(a.position||0)-(b.position||0))}))
    .filter(s=>s.belts.length)
    .sort((a,b)=>a.distance-b.distance||b.belts[0].richness-a.belts[0].richness||((a.name||'')<(b.name||'')?-1:(a.name||'')>(b.name||'')?1:0));
}
import {rankDetailCandidates,outcomeModel} from './search-ranking.js';
import {normalizedFieldIndex,indexSystems,indexSummary} from './field-index.js';
import {systemDetailFields,remainingPct,asFloat,firstPresent,desktopRound} from './detail-parsing.js';
export const UPDATE_RANKING={min_richness:1,min_pct:100,two_pass:true};
export function distancesFrom(results,systems,originId){
  const map=new Map(systems.map(s=>[String(s.id),s])),origin=map.get(String(originId));
  if(!origin)return results;
  return results.map(s=>{const destination=map.get(String(s.id));if(!destination)return s;return {...s,distance:desktopRound(Math.hypot(Number(destination.x)-Number(origin.x),Number(destination.y)-Number(origin.y)),1)};});
}
