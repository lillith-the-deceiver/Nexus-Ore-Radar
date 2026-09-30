// Lifetime report mechanics, paired mission-by-mission as in desktop Radar.
import {operationNumber,resourceBreakdown} from './resource-breakdown.js';
import {operationEpoch} from './operation-time.js';
import {desktopRound} from './detail-parsing.js';
function entries(fleet){if(typeof fleet==='string'){try{return JSON.parse(fleet);}catch{return [];}}return fleet;}
export function fleetCounts(fleet){const counts={miner:0,gas_collector:0,ice_drill:0,excavator:0};const rows=entries(fleet);if(!Array.isArray(rows))return counts;for(const s of rows){if(!s||typeof s!=='object'||Array.isArray(s))continue;const raw=String(s.shipKey||s.shipName||'').trim().toLowerCase().replaceAll('-','_').replaceAll(' ','_');const key=raw==='mining_vessel'?'miner':raw;if(key)Object.defineProperty(counts,key,{value:(Object.hasOwn(counts,key)?counts[key]:0)+Math.trunc(operationNumber(s.quantity)),enumerable:true,configurable:true});}return counts;}
export function excavatorOnly(fleet){
 const rows=entries(fleet);if(!Array.isArray(rows)||!rows.length)return false;let found=false;
 const escorts=['scout','fighter','interceptor','cruiser','missile_cruiser','battleship','ewar'];
 for(const s of rows){if(!s||typeof s!=='object'||Array.isArray(s)||!Object.hasOwn(s,'quantity'))return false;
  if(operationNumber(s.quantity)+operationNumber(s.damagedQuantity)<=0)continue;
  const key=String(s.shipKey||s.shipName||'').toLowerCase().replaceAll(' ','_');
  if(key==='excavator')found=true;
  else if(['miner','mining_vessel','gas_collector','ice_drill'].includes(key)||operationNumber(s.miningCargoCapacity)>0||(!escorts.includes(key)&&s.shipClass!=='combat'))return false;
 }return found;
}
export function mechanicsSamples(records,missions=[]){
 const byMission=new Map(missions.map(m=>[String(m.id),m])),unique=new Map();
 const ordered=records.filter(r=>['mining','delivery'].includes(String(r?.reportType||'').toLowerCase())&&r.id!=null&&r.id!==''&&['mining','mine'].includes(r._radarSource??'mining')).map(r=>({r,epoch:operationEpoch(r.createdAt)})).sort((a,b)=>(b.epoch??-Infinity)-(a.epoch??-Infinity));
 for(const {r} of ordered){const key=r.missionId!=null&&r.missionId!==''?String(r.missionId):`${r._radarSource??'mining'}:${r.id}`;if(unique.has(key))continue;
  let fleet=byMission.get(String(r.missionId))?.fleetComposition;if(!Object.values(fleetCounts(fleet)).some(n=>n>0))fleet=r.fleetComposition??[];
  const completedAt=operationEpoch(r.createdAt);unique.set(key,{at:completedAt===null?NaN:completedAt*1000,counts:fleetCounts(fleet),excavatorOnly:excavatorOnly(fleet),amounts:resourceBreakdown(r.resourcesDelivered),cycles:Math.trunc(operationNumber(r.cycleCount||r.resourcesDelivered?._cyclesDone))||null,breakdowns:observedBreakdowns(r)});
 }return [...unique.values()];
}
export function mechanics(runs){
  const average=rs=>{const known=rs.filter(r=>r.cycles!==null);return known.length?known.reduce((n,r)=>n+r.cycles,0)/known.length:null;};
  const only=runs.filter(r=>r.excavatorOnly);
  const breakdowns=[];
  for(const [key,label]of [['miner','Miner'],['ice_drill','Ice Drill']]){
    const valid=runs.filter(r=>r.counts[key]>0&&!(r.counts[key==='miner'?'ice_drill':'miner']>0)&&r.breakdowns!==null);
    if(!valid.length)continue;
    const sent=valid.reduce((n,r)=>n+r.counts[key],0),broken=valid.reduce((n,r)=>n+r.breakdowns,0),cycled=valid.filter(r=>r.cycles>0),exposure=cycled.reduce((n,r)=>n+r.counts[key]*r.cycles,0);
    breakdowns.push({key,label,perCycle:exposure?100*cycled.reduce((n,r)=>n+r.breakdowns,0)/exposure:null,returned:sent?100*broken/sent:null,runs:valid.length});
  }
  const specs=[['Ore + Silicates','miner','Mining Vessel',['ore','silicates']],['Hydrogen','gas_collector','Gas Collector',['hydrogen','gas']],['Plasma Core','miner','Mining Vessel',['plasma_core','plasma']],['Cryo-ice','ice_drill','Ice Drill',['cryo_ice','ice']]];
  const yields=excavators=>{const used=new Set();const rows=specs.map(([label,key,hull,materials])=>{let amount=0,exposure=0,count=0;
    runs.forEach((r,i)=>{if(excavators&&!r.excavatorOnly)return;const ships=r.counts[excavators?'excavator':key]||0,value=materials.reduce((n,k)=>n+(r.amounts[k]||0),0);if(ships<=0||!(r.cycles>0)||value<=0)return;amount+=value;exposure+=ships*r.cycles;count++;used.add(i);});
    const ready=count>=(excavators?1:5)&&exposure>0;
    return {label,hull:excavators?'Excavator':hull,value:ready?amount/exposure:null,runs:count,preliminary:!!(excavators&&ready&&count<5)};
  });return {runs:used.size,rows};};
  return {average:average(runs),breakdowns,dedicated:yields(false),excavators:yields(true),excavatorTotals:{runs:only.length,cycles:desktopRound(only.reduce((n,r)=>n+(r.cycles||0),0),0),average:average(only)}};
}
export const observedBreakdowns=r=>{const raw=r.drillBreakdowns??r.resourcesDelivered?._drillBreakdowns;return typeof raw==='number'?Math.trunc(operationNumber(raw)):null;};
