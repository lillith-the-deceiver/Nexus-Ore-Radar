// Desktop has_fields_marker semantics: an overview replaces markers globally;
// a later exact check can restore a marker or confirm an empty inventory.
export function visibleInventories(details,index){
  const ids=new Set((index?.ids||[]).map(String));
  return details.filter(s=>s.verifiedAt>0&&s.belts.length&&(!index||s.verifiedAt>=index.at||ids.has(String(s.id))));
}
// Personal status uses MAX(updated_at) over actual belt rows, not scan progress.
export function lastExactUpdate(systems){
 return systems.reduce((latest,system)=>system.belts?.length&&Number.isFinite(system.verifiedAt)&&system.verifiedAt>latest?system.verifiedAt:latest,0);
}
export function exactUpdateLabel(timestamp){
 return timestamp?`Last updated: ${new Date(timestamp).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`:'Last updated: never';
}
