// Port of _operation_number / _operation_resource_breakdown in server.py.
export function operationNumber(value){
 if(typeof value==='number')return Number.isFinite(value)?Math.max(0,value):0;
 if(Array.isArray(value))return value.reduce((n,v)=>n+operationNumber(v),0);
 if(value&&typeof value==='object'){
  for(const k of ['total','amount','value','quantity'])if(typeof value[k]==='number')return operationNumber(value[k]);
  return Object.values(value).reduce((n,v)=>n+operationNumber(v),0);
 }
 return 0;
}
export function resourceBreakdown(value){
 const out={};const add=(key,amount)=>{if(amount)Object.defineProperty(out,key,{value:(Object.hasOwn(out,key)?out[key]:0)+amount,writable:true,configurable:true,enumerable:true});};
 if(Array.isArray(value)){for(const item of value)for(const [key,n] of Object.entries(resourceBreakdown(item)))add(key,n);return out;}
 if(value&&typeof value==='object'){
  const publicItems=Object.entries(value).filter(([key])=>!key.startsWith('_'));
  const named=publicItems.filter(([key])=>!['total','amount','value','quantity'].includes(key.toLowerCase()));
  if(!named.length){for(const [key,item] of publicItems)if(['total','amount','value','quantity'].includes(key.toLowerCase())){add('resources',operationNumber(item));break;}return out;}
  for(const [key,item] of named){
   if(typeof item==='number')add(key.trim().toLowerCase(),operationNumber(item));
   else for(const [material,n] of Object.entries(resourceBreakdown(item)))add(material,n);
  }
  return out;
 }
 add('resources',operationNumber(value));return out;
}
