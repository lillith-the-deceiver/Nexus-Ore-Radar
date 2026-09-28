// Port of fuel_analytics.dispatched_fleet; never infer a key from a ship ID.
export function fuelNumber(value){
 if(typeof value!=='number'&&typeof value!=='string')return null;
 if(typeof value==='string'&&!value.trim())return null;
 const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;
}
export function dispatchedFleet(raw){
 let entries=raw;
 if(typeof entries==='string'){try{entries=JSON.parse(entries);}catch{return {counts:null,category:null};}}
 const unknown=()=>({counts:null,category:null});
 if(!Array.isArray(entries)||!entries.length)return unknown();
 const counts={},classes={};
 for(const entry of entries){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return unknown();
  const quantity=fuelNumber(entry.quantity),damaged=fuelNumber(entry.damagedQuantity===undefined?0:entry.damagedQuantity);
  if(quantity===null||damaged===null)return unknown();
  const count=quantity+damaged;if(!count)continue;
  if(!entry.shipKey||!Number.isInteger(count))return unknown();
  const key=entry.shipKey==='mining_vessel'?'miner':entry.shipKey;
  Object.defineProperty(counts,key,{value:(Object.hasOwn(counts,key)?counts[key]:0)+count,enumerable:true,configurable:true});
  Object.defineProperty(classes,key,{value:entry.shipClass,enumerable:true,configurable:true});
 }
 const keys=Object.keys(counts);if(!keys.length)return unknown();
 const combat=['scout','fighter','interceptor','cruiser','missile_cruiser','battleship','ewar','hacker_ship'];
 const category=keys.some(k=>['miner','gas_collector','ice_drill'].includes(k))?'dedicated':keys.includes('excavator')&&keys.every(k=>k==='excavator'||combat.includes(k)||classes[k]==='combat')?'excavators':null;
 return {counts,category};
}
