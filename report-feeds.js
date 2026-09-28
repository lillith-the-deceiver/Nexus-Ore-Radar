import {decodeReports} from './core.js';

// Same two feeds and per-source identity as sync_operations_analytics.
export async function readReportFeeds(read){
 const feeds=[],errors=[];
 for(const [source,path] of [['battle','/api/fleet/reports'],['mining','/api/fleet/mining-reports']]){
  try{
   const seen=new Set();
   const reports=decodeReports(await read(path)).filter(report=>{
    if(!report||typeof report!=='object'||Array.isArray(report)||report.id==null||report.id==='')return false;
    const id=String(report.id);if(seen.has(id))return false;seen.add(id);return true;
   });
   feeds.push({source,reports});
  }catch(error){errors.push(`${source}: ${error.message}`);}
 }
 return {feeds,errors};
}

export function reportStorageKey(context,id,source='mining'){
 if(!['mining','battle'].includes(source))throw Error('Unknown report source');
 // Retain existing mining keys: no migration or rewriting historical data.
 return JSON.stringify(source==='mining'?[context,String(id)]:[context,source,String(id)]);
}
