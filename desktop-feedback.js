let localToastTimer=null;
export function showToast(message,isError=false){
 const toast=document.getElementById('local-toast');if(!toast)return;
 if(localToastTimer)clearTimeout(localToastTimer);
 toast.textContent=message;
 toast.className=`pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 translate-y-0 rounded-lg border px-4 py-2 text-sm font-bold opacity-100 shadow-2xl transition duration-200 ${isError?'border-rose-400/60 bg-rose-950/95 text-rose-100':'border-sky-400/50 bg-slate-950/95 text-sky-100'}`;
 localToastTimer=setTimeout(()=>{toast.className='pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 translate-y-4 rounded-lg border border-sky-400/50 bg-slate-950/95 px-4 py-2 text-sm font-bold text-sky-100 opacity-0 shadow-2xl transition duration-200';},2200);
}
export async function copySystemName(name){
 try{await navigator.clipboard.writeText(name);showToast(`${name} copied`);}
 catch{showToast('Could not copy system',true);}
}
export function analyticsSyncLabel(status){
 if(status?.state==='error')return 'Sync delayed · saved data';
 return status?.state==='connected'&&status.at?`Updated ${new Date(status.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:'Awaiting sync';
}
