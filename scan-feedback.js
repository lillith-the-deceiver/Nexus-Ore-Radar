// Personal pollBeltRefresh outcomes; browser authentication replaces Steam only.
export function scanOutcome(state){
 if(!state||state.running)return null;
 if(state.needsGameAuth)return {message:'Reconnect to the selected Nexus season, then try again.',error:true};
 if(state.contextChanged)return {message:state.error||'Account or season changed; scan stopped.',error:true};
 if(state.cancelled)return {message:'',toast:'Update cancelled'};
 if(state.failedCount)return {message:`${state.failedCount} system request${state.failedCount===1?'':'s'} could not be updated.`,error:true};
 if(state.error)return {message:state.error,error:true};
 return {message:'',toast:state.total===0?'No supported belt systems in range':'Belt data updated'};
}
export function progressRetry(failures,error){
 const seconds=Math.min(30,2**Math.min(failures,4));
 return {delay:seconds*1000,message:`Progress connection paused (${error.message}). Retrying automatically in ${seconds}s…`};
}
