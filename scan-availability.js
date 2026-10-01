export async function retryUnavailable(read,{stopped=()=>false,onWaiting=async()=>{},onReady=async()=>{},pause=async()=>{}}={}){
 let waiting=false;
 try{
  for(;;){
   const result=await read();
   if(result?.status!==0)return result;
   if(stopped())return {...result,aborted:true};
   if(!waiting){waiting=true;await onWaiting();}
   await pause();
  }
 }finally{if(waiting)await onReady();}
}
