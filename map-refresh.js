import {mapFieldIds} from './field-index.js';
import {list} from './search.js';

// sync_galaxy_map upserts systems; fetch_user_planets_internal leaves saved
// planets untouched when that separate request fails.
export async function refreshMapSnapshot(read,previous){
 let map;
 try{map=await read('/api/galaxy/map');list(map,'systems');}
 catch(error){
  if(error.contextChanged||[401,403].includes(error.status)||!previous)throw error;
  return {data:previous,refreshed:false,planetsRefreshed:false,error:error.message};
 }
 let markers=[];
 try{markers=mapFieldIds(await read('/api/galaxy/field-index'));}
 catch(error){if(error.contextChanged||[401,403].includes(error.status))throw error;}
 let planets=previous?.planets??[],planetsRefreshed=false,raw,received=false;
 try{
  raw=await read('/api/planets');received=true;
 }catch(error){if(error.contextChanged||[401,403].includes(error.status))throw error;}
 if(received){planets=Array.isArray(raw)?raw:raw&&typeof raw==='object'?(raw.planets??[]):[];list(planets,'planets');planetsRefreshed=true;}
 const merged=new Map((previous?list(previous.map,'systems'):[]).map(s=>[String(s.id),s]));
 for(const s of list(map,'systems'))merged.set(String(s.id),{...merged.get(String(s.id)),...s});
 return {data:{map:[...merged.values()],planets},markers,refreshed:true,planetsRefreshed};
}
