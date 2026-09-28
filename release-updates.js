// Chrome owns update downloads. Apply a notified update only between operations.
export function deferredUpdate(isBusy,reload){
 let pending=false,applying=false;
 const check=()=>{if(!pending||applying||isBusy())return false;applying=true;reload();return true;};
 return {available(){pending=true;return check();},check};
}
export async function refreshUpdatedDashboards(chrome,details){
 if(details?.reason!=='update')return;
 const url=chrome.runtime.getURL('dashboard.html');
 const contexts=await chrome.runtime.getContexts({contextTypes:['TAB']});
 for(const context of contexts)if(context.tabId>=0&&context.documentUrl?.split(/[?#]/,1)[0]===url)await chrome.tabs.reload(context.tabId).catch(()=>{});
}
export function dashboardUpdateNeeded(state,loadedVersion){
 return !!(loadedVersion&&state?.appVersion&&loadedVersion!==state.appVersion&&!state.scan?.running&&!state.updateBusy);
}
