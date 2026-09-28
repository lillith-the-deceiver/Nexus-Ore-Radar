// Behavioural port of search_ranking.py and server.py's candidate ranker.
const key=p=>JSON.stringify(p);
const pattern=f=>[f.field_type,f.field_count_bucket,f.richness_bucket,f.remaining_pct_bucket];
const family=p=>[p[0],p[1],Math.floor(p[2]/5),p[3]===100?100:Math.floor(p[3]/20)*20];
const round4=n=>Number(n.toFixed(4));
export class PooledOutcomeModel extends Map {
  constructor(exact=[]){super();this.families=new Map();for(const [p,counts] of exact){this.set(key(p),counts);const k=key(family(p)),total=this.families.get(k)||[0,0];total[0]+=counts[0];total[1]+=counts[1];this.families.set(k,total);}}
  prior(p,fallback){
    const [matches,observed]=this.get(key(p))||[0,0];if(observed>=30)return fallback;
    const [pooledMatches,pooledObserved]=this.families.get(key(family(p)))||[0,0],peers=pooledObserved-observed;
    if(peers<8)return fallback;
    const weight=Math.min(peers,60),pooledPrior=(((pooledMatches-matches)/peers)*weight+fallback*12)/(weight+12);
    return fallback+(30-observed)/30*(pooledPrior-fallback);
  }
}
export function candidateFeatures(system,minRichness){
  return (system.summary_fields||[]).filter(s=>Number(s.max_richness||0)>=minRichness&&['ore','gas','plasma','ice'].includes(String(s.field_type||'ore').toLowerCase())).map(s=>{
    const remaining=Math.max(0,Math.min(100,Number(s.remaining_pct||0))),richness=Math.max(0,Number(s.max_richness||0)),count=Math.max(1,Math.trunc(Number(s.field_count||1)));
    return {field_type:String(s.field_type||'ore').toLowerCase(),field_count_bucket:Math.min(4,count),richness_bucket:Math.min(100,Math.max(0,Math.floor(richness*10))),remaining_pct_bucket:Math.min(100,Math.max(0,Math.floor(remaining/10)*10)),best_remaining_pct:remaining,best_richness:richness};
  });
}
export function candidatePriorityScore(feature,minRichness,model){
  const headroom=Math.min(1,Math.max(0,feature.best_richness-minRichness)/0.6);
  let prior=Math.min(.95,Math.max(.05,.10+.60*feature.best_remaining_pct/100+.20*headroom+.10/feature.field_count_bucket));
  const p=pattern(feature);prior=model.prior(p,prior);
  let [matches,observed]=model.get(key(p))||[0,0];observed=Math.max(0,Math.trunc(observed||0));matches=Math.max(0,Math.min(matches||0,observed));
  const effective=Math.min(observed,60),posterior=((observed?matches/observed*effective:0)+prior*12)/(effective+12);
  const uncertainty=Math.sqrt(Math.max(0,posterior*(1-posterior))/(effective+12));
  return round4(Math.max(0,Math.min(1,posterior-.75*uncertainty))*100+headroom*2);
}
export function candidateSystemPriority(features,minRichness,model){
  if(!features.length)return 0;
  let miss=1,best=-Infinity;for(const f of features){const score=candidatePriorityScore(f,minRichness,model);best=Math.max(best,score);miss*=1-Math.max(0,Math.min(1,score/100));}
  return round4((1-miss)*100+best/1000);
}
export function outcomeModel(examples,minRichness,minPct){
  const grouped=new Map();
  for(const example of examples){const p=pattern(example),k=key(p),row=grouped.get(k)||[p,[0,0]],best=minPct>=100?example.best_full_richness:example.best_any_richness;row[1][1]++;if(best>0&&best>=minRichness)row[1][0]++;grouped.set(k,row);}
  return new PooledOutcomeModel([...grouped.values()]);
}
export function rankDetailCandidates(systems,minRichness,minPct,criteria,model=new PooledOutcomeModel()){
  criteria=criteria||systems[0]?._ranking_criteria||{min_richness:minRichness,min_pct:minPct};
  const ranked=systems.map(original=>{
    const s={...original},features=s._candidate_features&&s._update_criteria?.min_richness===minRichness?s._candidate_features:candidateFeatures(s,minRichness);
    const strongest=[...features].sort((a,b)=>b.best_remaining_pct-a.best_remaining_pct||b.best_richness-a.best_richness||a.field_count_bucket-b.field_count_bucket)[0]||null;
    s._candidate_feature=strongest;s._candidate_features=features;
    s._priority_tier=s._sent_recheck||s.sent_at?0:criteria.min_pct>=100&&features.some(f=>f.best_remaining_pct>=100)?1:2;
    s._priority_score=candidateSystemPriority(features.filter(f=>f.best_richness>=criteria.min_richness),criteria.min_richness,model);
    s._scan_pass=criteria.two_pass?(features.some(f=>f.best_remaining_pct>=100&&f.best_richness>=1)?0:1):0;
    s._update_criteria={min_richness:minRichness,min_pct:minPct};s._ranking_criteria={...criteria};return s;
  });
  return ranked.sort((a,b)=>a._scan_pass-b._scan_pass||Math.floor(Math.max(0,a.distance||0)/20)-Math.floor(Math.max(0,b.distance||0)/20)||(a._priority_tier===0?0:1)-(b._priority_tier===0?0:1)||b._priority_score-a._priority_score||a._priority_tier-b._priority_tier||(a.distance||0)-(b.distance||0)||((a.system_name||'')<(b.system_name||'')?-1:(a.system_name||'')>(b.system_name||'')?1:0));
}
