// Desktop location-reference resolution using the extension's local map.
export function resolveLocation(reference,label,systems){
  const input=String(reference||'').trim(),name=String(label||'').trim()||input;
  if(!name||name.length>80)throw Error('Location name must be between 1 and 80 characters.');
  if(input.length>120)throw Error('System name or ID is too long.');
  let system=/^#?\d+$/.test(input)?systems.find(s=>String(s.id)===input.replace(/^#/,'')):systems.find(s=>String(s.name).toLowerCase()===input.toLowerCase());
  if(!system){const parent=input.match(/^(.*)-\d+$/)?.[1];if(parent)system=systems.find(s=>String(s.name).toLowerCase()===parent.toLowerCase());}
  if(!system)throw Error('That planet or system is not in the local map.');
  return {label:name,system_id:system.id,system_name:system.name};
}
export function saveLocation(rows,reference,label,systems,newId){
 // Personal /api/locations limit check precedes default-label resolution.
 const lower=value=>String(value).replace(/[A-Z]/g,c=>c.toLowerCase());
 if(rows.length>=30&&!rows.some(r=>lower(r.label)===lower(String(label||'').trim())))throw Error('You can save up to 30 locations.');
 const location=resolveLocation(reference,label,systems);
 const existing=rows.findIndex(r=>lower(r.label)===lower(location.label));
 const next=rows.map(r=>({...r}));
 if(existing>=0){next[existing]={...next[existing],...location,label:next[existing].label};return {rows:next,location:next[existing]};}
 const saved={...location,id:newId};next.push(saved);return {rows:next,location:saved};
}
export function syncPlanetLocations(rows,planets,systems,makeId=()=>crypto.randomUUID()){
 // Browser-auth counterpart of _sync_steam_planet_locations. Keep the already
 // approved unprefixed browser labels; refresh does not delete old locations.
 const next=rows.map(row=>({...row})),lower=s=>String(s).replace(/[A-Z]/g,c=>c.toLowerCase());
 for(const planet of planets.slice(0,30)){
  if(!planet||planet.systemId==null)continue;
  const system=systems.find(s=>String(s.id)===String(planet.systemId));if(!system)continue;
  const label=String(planet.name||system.name||'').trim().slice(0,80);if(!label)continue;
  const existing=next.findIndex(r=>lower(r.label)===lower(label));
  if(existing<0&&next.length>=30)continue;
  const location={label,system_id:system.id,system_name:system.name};
  if(existing>=0)next[existing]={...next[existing],...location,label:next[existing].label};
  else next.push({...location,id:makeId()});
 }
 return next;
}
export function locationOptionLabel(location){
 const name=String(location.label||'').replace(/^Steam\s*[·•:—-]\s*/i,'').trim(),system=String(location.system_name||'').trim();
 return name&&system&&name!==system?`${name} — ${system}`:name||system||(location.system_id?`System #${location.system_id}`:'Unknown location');
}
