import {hasConsent,contributesRaids} from './core.js';
import {leaseContribution,finishContribution} from './db.js';
import {uploadContribution,retryAt} from './uploads.js';
import {RECEIVER_URL} from './upload-config.js';
let uploading=false;
async function allowed(context){
  const [origin]=JSON.parse(context);
  const {settings}=await chrome.storage.local.get('settings');
  const {connection}=await chrome.storage.session.get('connection');
  return contributesRaids(origin)&&hasConsent(settings)&&settings.enabled&&settings.origin===origin&&connection?.context===context&&(await chrome.tabs.query({url:origin+'/*'})).length>0;
}
export async function pumpContributions(context){
  if(uploading||!RECEIVER_URL)return;
  uploading=true;
  let row;
  try{
    if(!await allowed(context))return;
    row=await leaseContribution(context);if(!row)return;
    if(!await allowed(context))return;
    const id=await uploadContribution(RECEIVER_URL,row.contribution);
    await finishContribution(row,{state:'acknowledged',receipt:id,acknowledgedAt:Date.now(),lastError:null});
  }catch{
    if(row)await finishContribution(row,{nextAttemptAt:retryAt(row.attempts),lastError:'Upload not acknowledged; retained for retry.'}).catch(()=>{});
  }finally{uploading=false;}
}
