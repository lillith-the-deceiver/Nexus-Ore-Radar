import {fuelNumber} from './fleet-category.js';
import {operationNumber} from './resource-breakdown.js';
const rates={miner:[1.75,2],gas_collector:[1.75,5/3],excavator:[4.2,1],cruiser:[3.5,8/3],ice_drill:[2.1,4/3]};
export function estimateDispatchFuel(counts,distance,hasLosses=false){
 const d=fuelNumber(distance),keys=Object.keys(counts??{});
 if(hasLosses||!keys.length||d===null||keys.some(k=>!Object.hasOwn(rates,k)))return null;
 const slowest=Math.min(...keys.map(k=>rates[k][1]));
 return Math.sqrt(d)*keys.reduce((sum,k)=>sum+counts[k]*rates[k][0]*slowest/rates[k][1],0);
}
export function historicalContext(records,missions,geometry={}){
 const origins=new Map(),systems=new Map((geometry.systems??[]).map(s=>[String(s.id),s]));
 const add=(planet,system)=>{if(planet==null)return;const key=String(planet);if(!origins.has(key))origins.set(key,new Set());origins.get(key).add(system==null?null:String(system));};
 for(const p of geometry.planets??[])add(p.id,p.system_id??p.systemId);
 for(const m of missions)if(m.sourcePlanetId!=null&&m.sourceSystemId!=null)add(m.sourcePlanetId,m.sourceSystemId);
 return {origins,systems,byName:new Map([...systems.values()].map(s=>[s.name,s])),lossMissions:new Set(records.filter(r=>Math.trunc(operationNumber(r.shipsLost))>0&&r.missionId!=null).map(r=>String(r.missionId)))};
}
export function historicalDistance(report,mission,context){
 const explicit=fuelNumber(mission?.distance);if(explicit!==null)return explicit;
 const origins=context.origins.get(String(report.planetId));
 const origin=origins?.size===1?context.systems.get([...origins][0]):null;
 const target=context.systems.get(String(report._radarLink?.systemId))??context.byName.get(report.locationName);
 if(!origin||!target||![origin.x,origin.y,target.x,target.y].every(v=>typeof v==='number'&&Number.isFinite(v)))return null;
 return Math.hypot(origin.x-target.x,origin.y-target.y);
}
