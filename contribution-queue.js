import {contributionForContext} from './core.js';
import {canonical} from './contribution-wire.js';
export function updatedContribution(old,context,report,now=Date.now()){
  const contribution=contributionForContext(context,report);
  if(!contribution)return null;
  if(old?.format===2&&canonical(old.contribution)===canonical(contribution))return null;
  const previous=old?[...(old.previous||[]),Object.fromEntries(Object.entries(old).filter(([k])=>k!=='previous'))]:[];
  return {key:JSON.stringify([context,String(report.id)]),context,contribution,format:2,
    revision:(old?.revision||0)+1,state:'pending',capturedAt:now,attempts:0,nextAttemptAt:0,previous};
}
