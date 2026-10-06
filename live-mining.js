import {operationEpoch} from './operation-time.js';

export const MINING_CYCLE_SECONDS=600;
const finalStatuses=new Set(['','completed','complete','cancelled','canceled','failed','expired']);
const numeric=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;};
const first=(value,...keys)=>{for(const key of keys)if(value?.[key]!==undefined&&value?.[key]!==null)return value[key];return null;};
const statusOf=mission=>String(mission?.status||'').trim().toLowerCase();
const resourceTotal=cargo=>Object.entries(cargo&&typeof cargo==='object'?cargo:{}).reduce((sum,[key,value])=>key.startsWith('_')?sum:sum+Math.max(0,numeric(value)),0);
const systemKey=value=>String(value??'');

export function activeMiningMissions(rows,systems=[]){
 const bySystem=new Map(systems.map(system=>[systemKey(system.id??system.system_id),system])),missions=new Map();
 for(const row of [...(rows||[])].sort((a,b)=>Number(b.lastSeenAt||0)-Number(a.lastSeenAt||0))){
  if(row?.active===false)continue;
  const payload=row?.mission||{},type=String(payload.missionType||payload.mission_type||'').trim().toLowerCase(),status=statusOf(payload);
  if(!['mine','mining'].includes(type)||finalStatuses.has(status))continue;
  const fieldId=row?.link?.fieldId??payload.targetFieldId??payload.target_field_id;if(fieldId===null||fieldId===undefined||fieldId==='')continue;
  const fieldKey=String(fieldId);if(missions.has(fieldKey))continue;
  const targetSystem=row?.link?.systemId??payload.targetSystemId??payload.target_system_id,system=bySystem.get(systemKey(targetSystem)),belt=system?.belts?.find(entry=>String(entry.id??entry.field_id)===fieldKey),saved=row?.linkSnapshot||{},cargo=payload.cargo&&typeof payload.cargo==='object'?payload.cargo:{};
  missions.set(fieldKey,{mission_id:String(payload.id),field_id:fieldId,system_id:targetSystem,system_name:String(payload.targetSystemName||payload.target_system_name||system?.name||system?.system_name||saved.systemName||''),field_name:String(belt?.name||belt?.field_name||saved.fieldName||''),field_type:String(payload.targetFieldType||payload.target_field_type||belt?.type||belt?.field_type||saved.fieldType||'').toLowerCase(),richness:numeric(belt?.richness??saved.richness),linked_remaining_pct:numeric(belt?.remaining??belt?.remaining_pct??saved.remaining),security_zone:String(system?.securityZone||system?.security_zone||saved.securityZone||'sentinel').toLowerCase(),total_resources:numeric(belt?.total??belt?.total_resources??saved.total),status,cycle_count:Math.max(0,Math.trunc(numeric(cargo._cyclesDone))),cycle_started_at:operationEpoch(cargo._cycleStartedAt),next_cycle_at:operationEpoch(cargo._nextCycleAt),cargo_total:resourceTotal(cargo),cargo_capacity:numeric(cargo._miningCargoCapacity),cargo_bonus:numeric(first(cargo,'_miningCargoAppliedBonus','_miningCargoBonus')),breakdowns:Math.trunc(numeric(cargo._drillBreakdowns)),mining_efficiency:numeric(payload.miningEfficiencyPercent)/100,fleet:Array.isArray(payload.fleetComposition)?payload.fleetComposition:[],travel_seconds:Math.max(0,Math.trunc(numeric(payload.travelTime))),arrives_at:operationEpoch(payload.arrivesAt),return_arrives_at:operationEpoch(payload.returnArrivesAt),observed_at:Math.trunc(Number(row.lastSeenAt||Date.now())/1000)});
 }
 return missions;
}

export function observedFieldRemaining(field){
 const units=first(field,'remainingResources','remaining_resources');
 if(units!==null)return {remaining:Math.max(0,numeric(units)),exact:true};
 const total=Math.max(0,numeric(first(field,'total','totalResources','total_resources'))),pct=Math.max(0,Math.min(100,numeric(first(field,'remaining','remainingPct','remaining_pct'))));
 return {remaining:total*pct/100,exact:false};
}

export function estimateLiveMissionCycleYield(mission,field,snapshot){
 const efficiency=numeric(mission?.mining_efficiency),richness=Math.max(0,numeric(field?.richness)),resource=String(mission?.field_type||field?.type||field?.field_type||'').toLowerCase(),definitions=new Map((snapshot?.ships||[]).map(ship=>[ship.key,ship]));
 if(efficiency<=0||richness<=0||!resource||!Array.isArray(mission?.fleet))return 0;
 let power=0;for(const row of mission.fleet){const key=String(row?.shipKey||row?.key||''),rate=numeric(definitions.get(key)?.mining_rates?.[resource]);if(rate>0)power+=numeric(row?.quantity)*rate;}
 return power>0?power*efficiency*(1+numeric(mission.cargo_bonus))*richness:0;
}

export function projectMiningReturnDeadline(mission,observation,now=Math.trunc(Date.now()/1000)){
 const direct=Math.trunc(numeric(mission?.return_arrives_at));if(direct>now)return direct;
 if(!['mine','mining'].includes(statusOf(mission)))return null;
 const own=numeric(observation?.own_cycle_yield),remaining=numeric(observation?.field_remaining);if(own<=0||remaining<=0)return null;
 const outside=Math.max(0,numeric(observation.external_rate_per_second));let next=Math.trunc(numeric(mission.next_cycle_at));if(next<=now)next=now+MINING_CYCLE_SECONDS;
 const firstCombined=own+outside*Math.max(0,next-now);let cycles=1;
 if(remaining>firstCombined){const later=own+outside*MINING_CYCLE_SECONDS;if(later<=0)return null;cycles=1+Math.ceil((remaining-firstCombined)/later);}
 const capacity=numeric(mission.cargo_capacity),cargo=numeric(mission.cargo_total);if(capacity>cargo)cycles=Math.min(cycles,Math.max(1,Math.ceil((capacity-cargo)/own)));
 return next+(cycles-1)*MINING_CYCLE_SECONDS+Math.max(0,Math.trunc(numeric(mission.travel_seconds)));
}

export function projectPresetReturnDeadline(mission,cyclesLeft,now=Math.trunc(Date.now()/1000)){
 const direct=Math.trunc(numeric(mission?.return_arrives_at));if(direct)return direct;if(cyclesLeft===null||cyclesLeft===undefined)return null;
 const travel=Math.max(0,Math.trunc(numeric(mission.travel_seconds))),status=statusOf(mission);let starts=now;
 if(!['mine','mining'].includes(status)){const arrival=Math.trunc(numeric(mission.arrives_at));starts=arrival?Math.max(now,arrival):now+travel;}
 return starts+Math.max(0,Math.trunc(numeric(cyclesLeft)))*MINING_CYCLE_SECONDS+travel;
}

export function updateMiningFieldObservation(mission,field,previous=null,observedAt=Math.trunc(Date.now()/1000),snapshot=null){
 const {remaining,exact}=observedFieldRemaining(field),total=Math.max(0,numeric(first(field,'total','totalResources','total_resources'))),tolerance=exact?1:Math.max(5,total*.0011),cargo=numeric(mission.cargo_total),cycle=Math.max(0,Math.trunc(numeric(mission.cycle_count)));
 const reset=!previous||previous.mission_id!==mission.mission_id||cycle<numeric(previous.last_cycle_count)||cargo+tolerance<numeric(previous.last_cargo_total)||remaining>numeric(previous.field_remaining)+tolerance;
 let state;
 if(reset){state={mission_id:mission.mission_id,field_id:mission.field_id,field_remaining:remaining,baseline_field_remaining:remaining,baseline_cargo_total:cargo,last_cargo_total:cargo,last_cycle_count:cycle,last_observed_at:observedAt,own_cycle_yield:cycle>0&&cargo>0?cargo/cycle:estimateLiveMissionCycleYield(mission,field,snapshot),external_removed_total:0,external_removed_last:0,external_rate_per_second:0,exact_remaining:exact};}
 else{
  state={...previous};const elapsed=Math.max(1,observedAt-numeric(state.last_observed_at)),fieldLoss=Math.max(0,numeric(state.field_remaining)-remaining),cargoGain=Math.max(0,cargo-numeric(state.last_cargo_total)),cycleGain=cycle-numeric(state.last_cycle_count);
  if(cycleGain>0&&cargoGain>0)state.own_cycle_yield=cargoGain/cycleGain;else if(!state.own_cycle_yield&&cycle>0&&cargo>0)state.own_cycle_yield=cargo/cycle;
  const cumulativeLoss=Math.max(0,numeric(state.baseline_field_remaining)-remaining),cumulativeCargo=Math.max(0,cargo-numeric(state.baseline_cargo_total)),priorTotal=Math.max(0,numeric(state.external_removed_total));let external=Math.max(0,cumulativeLoss-cumulativeCargo);if(external<=tolerance)external=0;const gain=Math.max(0,external-priorTotal),priorRate=Math.max(0,numeric(state.external_rate_per_second));
  if(fieldLoss>tolerance||cargoGain>tolerance){if(external+tolerance<priorTotal)state.external_rate_per_second=0;else{const measured=gain/elapsed;state.external_rate_per_second=priorRate<=0?measured:measured*.65+priorRate*.35;}if(state.external_rate_per_second<1/600)state.external_rate_per_second=0;}
  Object.assign(state,{external_removed_last:gain,external_removed_total:external,field_remaining:remaining,last_cargo_total:cargo,last_cycle_count:cycle,last_observed_at:observedAt,exact_remaining:exact});
 }
 Object.assign(state,{return_deadline:projectMiningReturnDeadline(mission,state,observedAt),status:mission.status,cycle_count:cycle,next_cycle_at:mission.next_cycle_at,updated_at:observedAt});return state;
}

export function publicMiningObservation(mission,observation){
 if(!observation||observation.mission_id!==mission.mission_id)return {mission_id:mission.mission_id,status:mission.status,cycle_count:mission.cycle_count||0,next_cycle_at:mission.next_cycle_at,return_deadline:mission.return_arrives_at,mined_total:Math.round(Math.max(0,numeric(mission.cargo_total))),external_removed:0,external_rate_per_hour:0};
 const mined=Math.max(0,numeric(mission.cargo_total));let external=Math.max(0,numeric(observation.external_removed_total)),total=Math.max(0,numeric(mission.total_resources));if(observation.exact_remaining&&total>0)external=Math.min(external,Math.max(0,total-Math.max(0,numeric(observation.field_remaining))-mined));
 return {mission_id:mission.mission_id,status:mission.status,cycle_count:mission.cycle_count||0,next_cycle_at:mission.next_cycle_at,return_deadline:mission.return_arrives_at||observation.return_deadline,mined_total:Math.round(mined),external_removed:Math.round(external),external_rate_per_hour:Math.round(Math.max(0,numeric(observation.external_rate_per_second))*3600)};
}

export function missionSampleMatchesFieldTime(mission,observedAt){const at=Math.trunc(numeric(observedAt)),started=Math.trunc(numeric(mission.cycle_started_at)),next=Math.trunc(numeric(mission.next_cycle_at));return !(started&&started>at+5)&&!(next&&at>next+5);}

export function currentMiningResults({missions,systems,observations={},origin={x:0,y:0},presetName='',cyclesFor=null,now=Math.trunc(Date.now()/1000)}){
 const bySystem=new Map((systems||[]).map(system=>[systemKey(system.id??system.system_id),system])),output=new Map();
 for(const [fieldKey,mission] of missions){const source=bySystem.get(systemKey(mission.system_id)),sourceBelt=source?.belts?.find(belt=>String(belt.id??belt.field_id)===fieldKey),x=numeric(source?.x),y=numeric(source?.y),systemId=mission.system_id;
  if(!output.has(systemKey(systemId)))output.set(systemKey(systemId),{system_id:systemId,system_name:mission.system_name||source?.name||source?.system_name||`System ${systemId}`,x,y,security_zone:String(source?.securityZone||source?.security_zone||mission.security_zone||'sentinel').toLowerCase(),distance:Math.round(Math.hypot(x-numeric(origin.x),y-numeric(origin.y))*10)/10,auto_sent:true,sent_at:now,belts:[]});
  const returning=!['mine','mining'].includes(mission.status),belt={field_id:mission.field_id,position:sourceBelt?.position??null,field_name:sourceBelt?.name||sourceBelt?.field_name||mission.field_name||`Field ${mission.field_id}`,field_type:sourceBelt?.type||sourceBelt?.field_type||mission.field_type||'ore',richness:numeric(sourceBelt?.richness??mission.richness),remaining_pct:returning?0:numeric(sourceBelt?.remaining??sourceBelt?.remaining_pct??mission.linked_remaining_pct),total_resources:numeric(sourceBelt?.total??sourceBelt?.total_resources??mission.total_resources),zone:String(sourceBelt?.zone||mission.security_zone||'sentinel').toLowerCase(),auto_sent:true,sent_at:now};
  const observation=observations[fieldKey],live=publicMiningObservation(mission,observation);if(cyclesFor){const adjusted=observation?.exact_remaining&&belt.total_resources>0?{...belt,remaining_pct:Math.min(100,Math.max(0,numeric(observation.field_remaining)*100/belt.total_resources))}:belt;try{live.cycles_left=cyclesFor(adjusted,belt.field_type);live.cycles_preset=presetName;if(!live.return_deadline)live.return_deadline=projectPresetReturnDeadline(mission,live.cycles_left,now);}catch{live.cycles_left=null;}}
  belt.live_mining=live;output.get(systemKey(systemId)).belts.push(belt);
 }
 const rows=[...output.values()];for(const system of rows)system.belts.sort((a,b)=>b.richness-a.richness||(a.position||0)-(b.position||0));rows.sort((a,b)=>a.distance-b.distance||a.system_name.localeCompare(b.system_name));return {systems:rows,total_systems:rows.length,total_belts:rows.reduce((sum,row)=>sum+row.belts.length,0)};
}
