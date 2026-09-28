const VERSION=1;
const idOf=report=>String(report.id);

// The first successful read of each report feed establishes a per-context
// baseline. Those pre-existing IDs never enter local analytics or uploads;
// reports whose IDs appear later remain eligible on every read so a later,
// more complete API representation can update the saved copy.
export function reportsAfterFirstUse(feeds,stored){
  const sources=stored?.version===VERSION&&stored.sources&&typeof stored.sources==='object'?structuredClone(stored.sources):{};
  const filtered=[];
  for(const feed of feeds){
    const source=feed.source,reports=feed.reports||[];
    if(!Object.hasOwn(sources,source)){
      sources[source]=[...new Set(reports.map(idOf))];
      filtered.push({...feed,reports:[]});
      continue;
    }
    const baseline=new Set(sources[source].map(String));
    filtered.push({...feed,reports:reports.filter(report=>!baseline.has(idOf(report)))});
  }
  return {feeds:filtered,baseline:{version:VERSION,sources}};
}

export const reportBaselineKey=context=>`report-baseline:${context}`;
