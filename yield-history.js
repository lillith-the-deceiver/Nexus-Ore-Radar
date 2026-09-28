// Behavioural port of the personal app's yield_history.py.
// Input/output timestamps use seconds, matching the desktop renderer contract.
export function calendarStartSeconds(hours,now){
  if(hours===0)return 0;
  const day=new Date(now*1000);day.setHours(0,0,0,0);
  if(hours===168)day.setDate(day.getDate()-(day.getDay()+6)%7);
  return Math.max(0,Math.floor(+day/1000));
}
export function buildYieldHistory(runs,hours,now){
  const dated=runs.filter(r=>typeof r.created_at_epoch==='number'&&r.created_at_epoch>0&&r.created_at_epoch<=now);
  let first=null;for(const r of dated)first=first===null?r.created_at_epoch:Math.min(first,r.created_at_epoch);
  if(first===null)return {buckets:[],series:[],granularity:'day',coverage_start:null};
  let start=calendarStartSeconds(hours,now);
  if(hours===0){const d=new Date(first*1000);d.setHours(0,0,0,0);start=Math.max(0,Math.floor(+d/1000));}
  const granularity=hours===24?'hour':hours===0&&now-start>90*86400?'week':'day';
  if(granularity==='week'){const d=new Date(start*1000);d.setDate(d.getDate()-(d.getDay()+6)%7);start=Math.max(0,Math.floor(+d/1000));}
  const boundaries=[start];
  while(boundaries.at(-1)<=now){const a=boundaries.at(-1),d=new Date(a*1000);d.setDate(d.getDate()+(granularity==='week'?7:1));boundaries.push(granularity==='hour'?a+3600:Math.floor(+d/1000));}
  const buckets=boundaries.slice(0,-1).map((a,i)=>({start:a,end:boundaries[i+1],partial:boundaries[i+1]>now||a<first}));
  const keys=[['ore','Ore + Silicates'],['hydrogen','Hydrogen'],['plasma_core','Plasma Core'],['cryo_ice','Cryo-ice']];
  const values=Object.fromEntries(keys.map(([key])=>[key,buckets.map(b=>b.end<=first?null:0)]));
  for(const run of dated){
    let lo=0,hi=boundaries.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(boundaries[mid]<=run.created_at_epoch)lo=mid+1;else hi=mid;}
    const index=lo-1;if(index<0||index>=buckets.length)continue;
    let amounts;try{amounts=JSON.parse(run.resource_breakdown_json||'{}');}catch{continue;}
    if(!amounts||typeof amounts!=='object'||Array.isArray(amounts))continue;
    for(const [resource,raw] of Object.entries(amounts)){
      const key=['ore','silicates'].includes(resource)?'ore':resource;
      if(!Object.hasOwn(values,key)||typeof raw==='boolean'||raw===null||typeof raw==='object'||(typeof raw==='string'&&!raw.trim()))continue;
      const amount=Number(raw);if(Number.isFinite(amount)&&amount>=0)values[key][index]=(values[key][index]||0)+amount;
    }
  }
  return {buckets,granularity,coverage_start:first,series:keys.map(([key,label])=>({key,label,values:values[key],total:values[key].reduce((s,v)=>s+(v||0),0)}))};
}
