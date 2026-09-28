// Port of _run_candidate_detail_scanner's active-slot scheduling, excluding
// the explicitly removed Gather Data and escort-study paths.
export async function runScanQueue(candidates,{check,rank,onResult=async()=>{},stopped=()=>false}){
  let pending=[...candidates],completions=24,activePass=null;
  const active=new Set();
  try{
  while(pending.length||active.size){
    if(stopped())pending=[];
    if(pending.length&&completions>=24){pending=await rank(pending);completions=0;}
    while(pending.length&&active.size<4&&!stopped()){
      const nextPass=pending[0]._scan_pass||0;
      if(active.size&&nextPass!==activePass)break;
      activePass=nextPass;const system=pending.shift();
      const task=Promise.resolve().then(()=>check(system)).then(result=>({system,result}),error=>({system,result:{ok:false,status:error.status||0,error:error.message}}));
      active.add(task);
    }
    if(!active.size)break;
    const {task,value}=await Promise.race([...active].map(task=>task.then(value=>({task,value}))));
    active.delete(task);completions++;await onResult(value.system,value.result);
  }
  }finally{
    // ThreadPoolExecutor also waits for already-submitted work when a callback
    // fails. Do not mark a scan finished while old requests are still running.
    await Promise.all(active);
  }
}
