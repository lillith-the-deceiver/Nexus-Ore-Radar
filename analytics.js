// Completed mining deliveries only. Raid payloads never enter yield totals.
import {fleetCounts,mechanics,observedBreakdowns,mechanicsSamples} from './mechanics.js';
import {missionDuration} from './missions.js';
import {buildYieldHistory} from './yield-history.js';
import {resourceBreakdown,operationNumber} from './resource-breakdown.js';
import {desktopRound} from './detail-parsing.js';
import {operationEpoch} from './operation-time.js';
import {dispatchedFleet,fuelNumber} from './fleet-category.js';
import {historicalContext,historicalDistance,estimateDispatchFuel} from './historical-fuel.js';
export const RESOURCES=[['ore','Ore'],['silicates','Silicates'],['hydrogen','Hydrogen'],['plasma_core','Plasma Core'],['cryo_ice','Cryo-ice']];
export const GROUPS=[['ore','Ore + Silicates'],['hydrogen','Hydrogen'],['plasma_core','Plasma Core'],['cryo_ice','Cryo-ice']];
export function materials(value) {
  return resourceBreakdown(value);
}
export function calendarStart(period,now=Date.now()) {
  if(period==='total')return 0;
  const d=new Date(now);d.setHours(0,0,0,0);
  if(period==='week')d.setDate(d.getDate()-(d.getDay()+6)%7);
  return +d;
}
export function quantile(values,q) {
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b), pos=(sorted.length-1)*q,lo=Math.floor(pos);
  return sorted[lo]+(sorted[Math.ceil(pos)]-sorted[lo])*(pos-lo);
}
export function miningRuns(records,missions=[],quotes=[],geometry={}) {
  const historical=historicalContext(records,missions,geometry);
  const quoteMap=new Map(quotes.filter(q=>q.status==='quoted').map(q=>[String(q.missionId),q]));
  const missionMap=new Map(missions.map(m=>[String(m.id),m]));
  const unique=new Map();
  for(const r of records) {
    if(!['delivery','mining'].includes(String(r?.reportType||'').toLowerCase()))continue;
    if(r._radarLink?.fieldId==null||!['ore','gas','plasma','ice'].includes(r._radarLink.fieldType))continue;
    if(r.id===undefined||r.id===null||r.id==='')continue;
    const key=r.missionId!=null&&r.missionId!==''?String(r.missionId):`${r._radarSource??'mining'}:${r.id}`;
    const epoch=operationEpoch(r.createdAt),at=epoch===null?NaN:epoch*1000, amounts=materials(r.resourcesDelivered);
    const resourcesTotal=Object.values(amounts).reduce((a,b)=>a+b,0);
    if(!Number.isFinite(at)||at<0||resourcesTotal<=0)continue;
    const quote=quoteMap.get(String(r.missionId));
    const mission=missionMap.get(String(r.missionId));
    let composition=r.fleetComposition,dispatch=dispatchedFleet(composition);
    if(dispatch.counts===null){composition=mission?.fleetComposition;dispatch=dispatchedFleet(composition);}
    if(quote){composition=quote.dispatch?.fleetComposition;dispatch=dispatchedFleet(composition);}
    const fleet=Array.isArray(composition)?composition:[];
    const category=dispatch.category??'unknown';
    const cycles=r.cycleCount ?? r.resourcesDelivered?._cyclesDone;
    const fuel=quote?fuelNumber(quote.fuelCost):estimateDispatchFuel(dispatch.counts,historicalDistance(r,mission,historical),historical.lossMissions.has(String(r.missionId))||Math.trunc(operationNumber(r.shipsLost))>0);
    const run={at,amounts,category,fieldType:r._radarLink.fieldType,fuel,duration:missionDuration(r,mission),counts:fleetCounts(Array.isArray(r.fleetComposition)?r.fleetComposition:fleet),breakdowns:observedBreakdowns(r),cycles:typeof cycles==='number' && Number.isFinite(cycles) && cycles>=0?cycles:null};
    // Desktop orders by resources, completion time, then whole-second sync time.
    run.resourcesTotal=resourcesTotal;
    run.fuelSource=fuel===null?null:quote?'api':'estimate';
    run.syncedAt=r._radarSyncedAt??0;
    const old=unique.get(String(key));
    if(!old||resourcesTotal>old.resourcesTotal||(resourcesTotal===old.resourcesTotal&&(old.at<at||(old.at===at&&old.syncedAt<run.syncedAt))))unique.set(String(key),run);
  }
  return [...unique.values()];
}
export function analyze(records,period='total',now=Date.now(),missions=[],quotes=[],geometry={}) {
  const start=calendarStart(period,now),samples=mechanicsSamples(records,missions).filter(sample=>Number.isFinite(sample.at)&&sample.at>=start);
  const all=miningRuns(records,missions,quotes,geometry),runs=all.filter(r=>r.at>=start&&r.at<=now);
  const timed=runs.filter(r=>r.duration!==null);
  const totals={};for(const r of runs)for(const [key,value] of Object.entries(r.amounts))totals[key]=(Object.hasOwn(totals,key)?totals[key]:0)+value;
  const tables={};
  for(const category of ['dedicated','excavators']) {
    const own=runs.filter(r=>r.category===category);
    tables[category]={runs:own.length,rows:GROUPS.map(([key,label])=>{
      const [belt,materials]={ore:['ore',['ore','silicates']],hydrogen:['gas',['hydrogen','gas']],plasma_core:['plasma',['plasma_core','plasma']],cryo_ice:['ice',['cryo_ice','ice']]}[key];
      const matching=own.filter(r=>r.fieldType===belt);
      const values=matching.map(r=>materials.reduce((sum,k)=>sum+(fuelNumber(r.amounts[k])??0),0));
      const fuels=matching.filter(r=>r.fuel!==null).map(r=>r.fuel);
      return {key,label,runs:values.length,fuelRuns:fuels.length,apiQuoteRuns:matching.filter(r=>r.fuelSource==='api').length,estimatedRuns:matching.filter(r=>r.fuelSource==='estimate').length,fuelMean:fuels.length?fuels.reduce((a,b)=>a+b,0)/fuels.length:null,fuelMedian:quantile(fuels,.5),fuelLow:quantile(fuels,.25),fuelHigh:quantile(fuels,.75),mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,
        median:quantile(values,.5),low:quantile(values,.25),high:quantile(values,.75)};
    })};
  }
  const yieldHistory=buildYieldHistory(all.map(r=>({created_at_epoch:r.at/1000,resource_breakdown_json:JSON.stringify(r.amounts)})),period==='day'?24:period==='week'?168:0,now/1000);
  return {runs:runs.length,averageDuration:timed.length?desktopRound(timed.reduce((n,r)=>n+r.duration,0)/timed.length,0):null,resources:Object.values(totals).reduce((a,b)=>a+b,0),totals,tables,
    cycles:desktopRound(samples.reduce((sum,r)=>sum+(r.cycles||0),0),0),cycleRuns:samples.filter(r=>r.cycles!==null).length,
    history:history(yieldHistory),yieldHistory,lifetimeRuns:samples.length,mechanics:mechanics(samples)};
}
function history(data) {
  return data.buckets.map((b,i)=>({...b,start:b.start*1000,end:b.end*1000,values:Object.fromEntries(data.series.map(s=>[s.key,s.values[i]]))}));
}
