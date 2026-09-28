// get_operations_analytics orders every delivered resource by total, then key.
export function resourceTotals(totals){
 const labels={ore:'Ore',silicates:'Silicates',hydrogen:'Hydrogen',plasma_core:'Plasma Core',cryo_ice:'Cryo-ice',resources:'Resources'};
 return Object.entries(totals).filter(([,total])=>total>0)
  .sort(([a,x],[b,y])=>y-x||(a<b?-1:a>b?1:0))
  .map(([resource,total])=>({resource,total,label:labels[resource]||resource.replace(/\b\w/g,c=>c.toUpperCase())}));
}
