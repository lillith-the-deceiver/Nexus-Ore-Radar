import {operationEpoch} from './operation-time.js';

const VERSION=2;
const idOf=report=>String(report.id);
const copySources=stored=>stored?.sources&&typeof stored.sources==='object'?structuredClone(stored.sources):{};
const reportTime=report=>{
  const epoch=operationEpoch(report?.createdAt);
  return epoch===null?null:epoch*1000;
};

// Authentication establishes one per-context first-use time before either
// report feed is read. Reports already present at that boundary never enter
// local analytics or uploads; newer IDs remain eligible on every read so a
// later, more complete API representation can update the saved copy.
export function reportsAfterFirstUse(feeds,stored,now=Date.now()){
  const existing=stored?.version===VERSION&&Number.isFinite(stored.startedAt);
  const legacy=stored?.version===1;
  const startedAt=existing?stored.startedAt:now;
  const sources=existing||legacy?copySources(stored):{};
  const filtered=[];
  for(const feed of feeds){
    const source=feed.source,reports=feed.reports||[];
    if(!Object.hasOwn(sources,source)){
      // A baseline created before this feed was available uses the report's
      // completion time. Unknown timestamps stay excluded rather than pulling
      // arbitrary historical data into a new installation.
      const old=existing||legacy?reports.filter(report=>{
        const at=reportTime(report);
        return at===null||at<=startedAt;
      }):reports;
      sources[source]=[...new Set(old.map(idOf))];
      const baseline=new Set(sources[source]);
      filtered.push({...feed,reports:reports.filter(report=>!baseline.has(idOf(report)))});
      continue;
    }
    const baseline=new Set(sources[source].map(String));
    filtered.push({...feed,reports:reports.filter(report=>!baseline.has(idOf(report)))});
  }
  return {feeds:filtered,baseline:{version:VERSION,startedAt,sources}};
}

export const reportBaselineKey=context=>`report-baseline:${context}`;
