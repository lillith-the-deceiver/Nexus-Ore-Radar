import {encodeContribution} from './contribution-wire.js';
export function receiverUrl(input){
  if(!input)return null;
  const url=new URL(input);
  if(url.origin!=='https://script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)||url.search||url.hash||url.username||url.password)throw Error('Invalid receiver URL');
  return url.href;
}
export async function uploadContribution(endpoint,report,fetcher=fetch){
  const url=receiverUrl(endpoint);if(!url)throw Error('Receiver not configured');
  const body=encodeContribution(report);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
  const id=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body,credentials:'omit',cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Receiver unavailable');
  const result=await response.json();
  if(result?.ok!==true||result.id!==id)throw Error('Report was not acknowledged');
  return id;
}
export function retryAt(attempt,now=Date.now()){
  return now+Math.min(3600000,5000*2**Math.min(10,Math.max(0,attempt-1)));
}
