import {decodeReports} from './core.js';

// Same two feeds and per-source identity as sync_operations_analytics.
export async function readReportFeeds(read){
 const feeds=[],errors=[],specs=[['battle','/api/fleet/reports'],['mining','/api/fleet/mining-reports']];
 // Match the Personal App: start both independent feeds through the shared
 // limiter so one slow endpoint cannot postpone the other request's start.
 const results=await Promise.all(specs.map(async([source,path])=>{
  try{
   const seen=new Set();
   const reports=decodeReports(await read(path)).filter(report=>{
    if(!report||typeof report!=='object'||Array.isArray(report)||report.id==null||report.id==='')return false;
    const id=String(report.id);if(seen.has(id))return false;seen.add(id);return true;
   });
   return {feed:{source,reports}};
  }catch(error){return {error:`${source}: ${error.message}`};}
 }));
 for(const result of results){if(result.feed)feeds.push(result.feed);else errors.push(result.error);}
 return {feeds,errors};
}

export function reportStorageKey(context,id,source='mining'){
 if(!['mining','battle'].includes(source))throw Error('Unknown report source');
 // Retain existing mining keys: no migration or rewriting historical data.
 return JSON.stringify(source==='mining'?[context,String(id)]:[context,source,String(id)]);
}
