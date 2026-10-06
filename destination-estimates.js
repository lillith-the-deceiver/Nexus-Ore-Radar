// Exact JavaScript port of the Personal App destination optimizer.
export const REFRESH_MS=24*60*60*1000;
export const MINING_EFFICIENCY_POWER=3200;
export const EXCAVATOR_FLEET_YIELD_BONUS=1.20;
export const DEAD_SPACE_SPEED_MULTIPLIER=.25;
export const MAX_MINING_CYCLES=10000;
export const RESOURCE_TYPES=['ore','gas','plasma','ice'];
export const SORT_MODES=new Set(['balanced','yield','fuel','fastest','net_hydrogen']);
export const BREAKDOWN_CAPABLE_MINERS=new Set(['miner','ice_drill']);
export const MIN_BREAKDOWN_RUNS=5;
export const BASELINE_BREAKDOWN_RATES=Object.freeze({
 miner:0.03211479311164871,
 ice_drill:0.03200054123536973,
});
export const DEDICATED_MINER_BY_RESOURCE={ore:'miner',gas:'gas_collector',plasma:'miner',ice:'ice_drill'};
export const MINING_VESSEL_KEY='mining_vessel';
export const DEDICATED_MINER_ALIASES=new Set(['miner','gas_collector','ice_drill']);
export const EXCLUDED_SHIPS=new Set(['probe','spy_probe','stealth_ship','assault_shuttle','hacker_ship','mine_layer','transport_shuttle','tanker','lunar_shuttle','colony_ship','repair_ship','bomber','engineer_ship','bulk_carrier','ore_freighter','dreadnought','titan']);

const number=value=>typeof value==='number'&&!Number.isNaN(value)&&Number.isFinite(value)?value:null;
const snake=value=>String(value??'').trim().toLowerCase().replaceAll('-','_').replaceAll(' ','_');

export function breakdownRatesWithBaseline(breakdowns=[]){
 const rows=new Map((Array.isArray(breakdowns)?breakdowns:[]).filter(row=>row&&BREAKDOWN_CAPABLE_MINERS.has(row.key)).map(row=>[row.key,row]));
 return Object.fromEntries([...BREAKDOWN_CAPABLE_MINERS].map(key=>{
  const row=rows.get(key),personal=number(row?.perCycle);
  return [key,Number.isSafeInteger(row?.runs)&&row.runs>=MIN_BREAKDOWN_RUNS&&personal!==null&&personal>=0&&personal<100?personal/100:BASELINE_BREAKDOWN_RATES[key]];
 }));
}

export function shipSnapshot(ship){
 if(!ship||typeof ship!=='object'||Array.isArray(ship)||typeof ship.key!=='string')return null;
 const key=ship.key.trim();if(!key||EXCLUDED_SHIPS.has(key))return null;
 const fuel=number(ship.effectiveFuelRate),speed=number(ship.effectiveSpeed),cargo=number(ship.effectiveMiningCargoCapacity);
 if(fuel===null||speed===null||fuel<0||speed<=0)return null;
 const rates={};if(ship.effectiveMiningRates&&typeof ship.effectiveMiningRates==='object')for(const resource of RESOURCE_TYPES){const rate=number(ship.effectiveMiningRates[resource]);if(rate!==null&&rate>0)rates[resource]=rate;}
 return {id:ship.id,key,name:String(ship.name||key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())),fuel_rate:fuel,speed,mining_cargo:Math.max(0,cargo||0),mining_rates:rates};
}

export function destinationCatalog(snapshot,now=Date.now()){
 if(!snapshot||!Array.isArray(snapshot.ships))throw Error('Current ship data is unavailable.');
 const definitions=new Map(snapshot.ships.map(ship=>[ship.key,ship]));
 const mining=[];
 if(Object.values(DEDICATED_MINER_BY_RESOURCE).every(key=>definitions.has(key)))mining.push({key:MINING_VESSEL_KEY,name:'Mining Vessel',resources:[...RESOURCE_TYPES]});
 if(definitions.has('excavator'))mining.push({key:'excavator',name:'Excavator',resources:[...RESOURCE_TYPES]});
 if(definitions.has('freighter'))mining.push({key:'freighter',name:'Freighter',resources:[...RESOURCE_TYPES]});
 const escorts=snapshot.ships.filter(ship=>!Object.keys(ship.mining_rates||{}).length).map(ship=>({key:ship.key,name:ship.name}));
 return {mining,escorts,updated_at:snapshot.updated_at,stale:now-Number(snapshot.updated_at||0)>=REFRESH_MS};
}

export function validateFleet(counts){
 if(!Array.isArray(counts)||!counts.length)throw Error('Enter a fleet first.');
 const seen=new Set(),normalized=[];for(const row of counts){
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.key!=='string'||!Number.isSafeInteger(row.count)||row.count<=0)throw Error('Use whole, positive ship quantities.');
  const original=snake(row.key);if(!original||seen.has(original)||EXCLUDED_SHIPS.has(original))throw Error('Invalid ship selection.');seen.add(original);
  const key=DEDICATED_MINER_ALIASES.has(original)?MINING_VESSEL_KEY:original,existing=normalized.find(item=>item.key===key);
  if(existing)existing.count+=row.count;else normalized.push({key,count:row.count});
 }
 return normalized.sort((left,right)=>left.key.localeCompare(right.key));
}

function selectedFleet(counts,definitions,resource){
 const rows=validateFleet(counts);
 const allowed=new Set([MINING_VESSEL_KEY,'excavator','freighter',...definitions.filter(ship=>!Object.keys(ship.mining_rates||{}).length).map(ship=>ship.key)]);
 const fleet={};for(const selected of rows){if(!allowed.has(selected.key))throw Error('Invalid ship selection.');const actual=selected.key===MINING_VESSEL_KEY?DEDICATED_MINER_BY_RESOURCE[resource]:selected.key;if(!definitions.some(ship=>ship.key===actual))throw Error('Current ship data is unavailable for this resource.');fleet[actual]=(fleet[actual]||0)+selected.count;}
 const miners=Object.keys(fleet).filter(key=>number(definitions.find(ship=>ship.key===key)?.mining_rates?.[resource])>0);if(!miners.length)throw Error('Select a mining ship.');return {fleet,miners};
}

export function miningCycles(expected,richness,resource,fleet,miners,definitions,breakdownRates={}){
 const byKey=new Map(definitions.map(ship=>[ship.key,ship])),active=Object.fromEntries(Object.entries(fleet).map(([key,count])=>[key,Number(count)]));let remaining=Number(expected);
 for(let cycle=1;cycle<=MAX_MINING_CYCLES;cycle++){
  const power=miners.reduce((sum,key)=>sum+active[key]*byKey.get(key).mining_rates[resource],0);if(power<=0)return null;
  const efficiency=Math.min(1,Math.sqrt(MINING_EFFICIENCY_POWER/power)),bonus=fleet.excavator>0?EXCAVATOR_FLEET_YIELD_BONUS:1;
  remaining-=power*efficiency*bonus*richness;if(remaining<=1e-9)return cycle;
  for(const key of BREAKDOWN_CAPABLE_MINERS)if(Object.hasOwn(active,key)){active[key]*=1-(breakdownRates[key]||0);if(active[key]<1e-12)active[key]=0;}
 }
 return null;
}

export function estimateBelt(belt,distance,resource,fleet,miners,definitions,securityZone='sentinel',breakdownRates={}){
 const total=number(belt.total??belt.total_resources),remaining=number(belt.remaining??belt.remaining_pct),richness=number(belt.richness);distance=number(distance);
 if([total,remaining,richness,distance].some(value=>value===null)||Math.min(total,richness)<=0||remaining<=0||distance<0)return null;
 const byKey=new Map(definitions.map(ship=>[ship.key,ship]));
 const power=miners.reduce((sum,key)=>sum+fleet[key]*byKey.get(key).mining_rates[resource],0),capacity=Object.entries(fleet).reduce((sum,[key,count])=>sum+count*byKey.get(key).mining_cargo,0);
 if(power<=0||capacity<=0)return null;
 const expected=Math.min(total*Math.min(100,remaining)/100,capacity);if(expected<=0)return null;
 const cycles=miningCycles(expected,richness,resource,fleet,miners,definitions,breakdownRates);if(cycles===null)return null;
 const slowest=Math.min(...Object.keys(fleet).map(key=>byKey.get(key).speed));
 const fuelTerms=Object.entries(fleet).reduce((sum,[key,count])=>sum+count*byKey.get(key).fuel_rate*slowest/byKey.get(key).speed,0);
 const full_fleet_fuel=Math.ceil(Math.sqrt(distance)*fuelTerms),zoneSpeed=String(securityZone).toLowerCase()==='dead'?DEAD_SPACE_SPEED_MULTIPLIER:1,oneWay=Math.ceil(distance*60/(slowest*zoneSpeed)),mining_seconds=cycles*600,travel_seconds=2*oneWay;
 return {expected_yield:expected,mining_seconds,travel_seconds,mission_seconds:travel_seconds+mining_seconds,full_fleet_fuel};
}

const metrics=item=>{
 const values=[item.expected_yield,item.mission_seconds,item.full_fleet_fuel];if(!values.every(value=>number(value)!==null)||item.expected_yield<=0||item.mission_seconds<=0||item.full_fleet_fuel<0)return null;
 const rate=number(item.yield_rate_override)??item.expected_yield/item.mission_seconds*3600,cost=number(item.fuel_per_resource_override)??item.full_fleet_fuel/item.expected_yield;return rate>0&&cost>=0&&Number.isFinite(rate)&&Number.isFinite(cost)?[rate,cost]:null;
};
const dominates=(left,right)=>left[0]>=right[0]&&left[1]<=right[1]&&(left[0]>right[0]||left[1]<right[1]);
export function orderDestinations(destinations,{resource,enabled=false}={}){
 const items=[...destinations];if(!enabled)return items.map(destination=>({destination,layer:null}));
 if(!resource||items.some(item=>item.resource!==resource))throw Error('Destination optimization requires a single resource.');
 if(items.some(item=>number(item.distance)===null||item.distance<0))throw Error('Destination distance must be finite and non-negative.');
 if(new Set(items.map(item=>item.key)).size!==items.length)throw Error('Destination keys must be unique.');
 const values=items.map(metrics),supported=values.map((value,index)=>value?index:null).filter(index=>index!==null),dominatedBy=items.map(()=>0),edges=items.map(()=>[]);
 for(let p=0;p<supported.length;p++)for(let q=p+1;q<supported.length;q++){const left=supported[p],right=supported[q];if(dominates(values[left],values[right])){edges[left].push(right);dominatedBy[right]++;}else if(dominates(values[right],values[left])){edges[right].push(left);dominatedBy[left]++;}}
 let front=supported.filter(index=>!dominatedBy[index]),layer=0;const result=[];
 while(front.length){front.sort((a,b)=>items[a].distance-items[b].distance||a-b);result.push(...front.map(index=>({destination:items[index],layer})));const following=[];for(const index of front)for(const other of edges[index])if(--dominatedBy[other]===0)following.push(other);front=following;layer++;}
 const unknown=values.map((value,index)=>value?null:index).filter(index=>index!==null).sort((a,b)=>items[a].distance-items[b].distance||a-b);result.push(...unknown.map(index=>({destination:items[index],layer:null})));return result;
}

export function orderDestinationsByMode(destinations,{resource,mode='balanced'}={}){
 const items=[...destinations];
 if(!SORT_MODES.has(mode))throw Error('Unknown destination sorting mode.');
 if(!resource||items.some(item=>item.resource!==resource))throw Error('Destination optimization requires a single resource.');
 if(mode==='net_hydrogen'&&resource!=='gas')throw Error('Net hydrogen sorting requires Gas Cloud.');
 if(mode==='balanced')return orderDestinations(items,{resource,enabled:true});
 if(items.some(item=>number(item.distance)===null||item.distance<0))throw Error('Destination distance must be finite and non-negative.');
 if(new Set(items.map(item=>item.key)).size!==items.length)throw Error('Destination keys must be unique.');
 const supported=[],unknown=[];
 items.forEach((item,index)=>{
  const value=metrics(item);if(!value){unknown.push({item,index});return;}
  const [rate,cost]=value;let key;
  if(mode==='yield')key=[-rate,item.distance,index];
  else if(mode==='fuel')key=[cost,item.distance,index];
  else if(mode==='fastest'){
   const completion=number(item.completion_seconds_override)??number(item.mission_seconds);if(completion===null||completion<=0){unknown.push({item,index});return;}key=[completion,item.distance,index];
  }else{
   const net=number(item.net_hydrogen_rate_override)??((item.expected_yield-item.full_fleet_fuel)/item.mission_seconds*3600);if(!Number.isFinite(net)){unknown.push({item,index});return;}key=[-net,item.distance,index];
  }
  supported.push({item,key});
 });
 const compare=(left,right)=>{for(let i=0;i<left.length;i++){const delta=left[i]-right[i];if(delta)return delta;}return 0;};
 supported.sort((a,b)=>compare(a.key,b.key));unknown.sort((a,b)=>a.item.distance-b.item.distance||a.index-b.index);
 return [...supported.map(row=>({destination:row.item,layer:0})),...unknown.map(row=>({destination:row.item,layer:null}))];
}

export function optimizeDestinations(systems,resource,counts,snapshot,breakdownRates={},mode='balanced'){
 if(!RESOURCE_TYPES.includes(resource))throw Error('Select one resource to use optimized sorting.');
 if(!SORT_MODES.has(mode))throw Error('Unknown destination sorting mode.');
 if(!snapshot||!Array.isArray(snapshot.ships))return {systems:[...systems],optimization:{active:false,message:'Current ship data is unavailable.'}};
 const definitions=snapshot.ships,{fleet,miners}=selectedFleet(counts,definitions,resource);
 for(const key of BREAKDOWN_CAPABLE_MINERS)if(Object.hasOwn(fleet,key)&&number(breakdownRates[key])===null)throw Error('Mining breakdown analytics are unavailable.');
 const output=systems.map(system=>({...system,belts:(system.belts||[]).map(belt=>({...belt}))})),systemDestinations=[];let supported=0;
 for(const system of output){
  const beltDestinations=[];
  for(const belt of system.belts){const key=String(belt.id??belt.field_id),estimate=estimateBelt(belt,system.distance,resource,fleet,miners,definitions,system.securityZone??system.security_zone,breakdownRates);belt.estimate=estimate;beltDestinations.push({key,resource,distance:system.distance,expected_yield:estimate?.expected_yield,mission_seconds:estimate?.mission_seconds,full_fleet_fuel:estimate?.full_fleet_fuel});}
  const rankedBelts=orderDestinationsByMode(beltDestinations,{resource,mode}),beltPositions=new Map(rankedBelts.map((row,index)=>[row.destination.key,index]));
  system.belts.sort((a,b)=>beltPositions.get(String(a.id??a.field_id))-beltPositions.get(String(b.id??b.field_id)));
  const estimates=system.belts.map(belt=>belt.estimate).filter(Boolean);supported+=estimates.length;
  if(estimates.length){
   const totalYield=estimates.reduce((sum,row)=>sum+row.expected_yield,0),totalFuel=estimates.reduce((sum,row)=>sum+row.full_fleet_fuel,0),completion=Math.max(...estimates.map(row=>row.mission_seconds));
   const yieldRate=estimates.reduce((sum,row)=>sum+row.expected_yield/row.mission_seconds*3600,0),netRate=estimates.reduce((sum,row)=>sum+(row.expected_yield-row.full_fleet_fuel)/row.mission_seconds*3600,0);
   systemDestinations.push({key:String(system.systemId??system.system_id??system.id),resource,distance:system.distance,expected_yield:totalYield,mission_seconds:completion,full_fleet_fuel:totalFuel,yield_rate_override:yieldRate,fuel_per_resource_override:totalFuel/totalYield,completion_seconds_override:completion,net_hydrogen_rate_override:netRate});
  }else systemDestinations.push({key:String(system.systemId??system.system_id??system.id),resource,distance:system.distance});
 }
 const rankedSystems=orderDestinationsByMode(systemDestinations,{resource,mode}),systemPositions=new Map(rankedSystems.map((row,index)=>[row.destination.key,index]));
 for(const system of output)system.optimizationRank=systemPositions.get(String(system.systemId??system.system_id??system.id));
 output.sort((a,b)=>a.optimizationRank-b.optimizationRank);
 return {systems:output,optimization:{active:!!supported,supported,updated_at:snapshot.updated_at,mode,message:supported?'':'No usable belts for this fleet.'}};
}

export function cyclesLeft(belt,resource,counts,snapshot,breakdownRates={}){
 if(!RESOURCE_TYPES.includes(resource)||!snapshot||!Array.isArray(snapshot.ships))return null;
 const definitions=snapshot.ships,{fleet,miners}=selectedFleet(counts,definitions,resource);
 for(const key of BREAKDOWN_CAPABLE_MINERS)if(Object.hasOwn(fleet,key)&&number(breakdownRates[key])===null)return null;
 const total=number(belt?.total??belt?.total_resources),remaining=number(belt?.remaining??belt?.remaining_pct),richness=number(belt?.richness);
 if(total===null||remaining===null||richness===null||total<=0||remaining<=0||richness<=0)return remaining===0?0:null;
 return miningCycles(total*Math.min(100,remaining)/100,richness,resource,fleet,miners,definitions,breakdownRates);
}
