export function openTabSidePanel(chromeApi,tabId,sourceTabId){
  return new Promise((resolve,reject)=>{
    const id=Number(tabId);
    const source=Number(sourceTabId);
    if(!Number.isSafeInteger(id)||id<0){reject(Error('The associated Nexus tab is unavailable.'));return;}
    chromeApi.tabs.update(id,{active:true},()=>{
      const lastError=chromeApi.runtime.lastError;
      if(lastError){reject(Error(lastError.message));return;}
      let opening;
      try{
        // Chrome preserves the button's user gesture through this callback.
        // Do not replace this callback chain with an awaited lookup.
        opening=chromeApi.sidePanel.open({tabId:id});
      }catch(error){reject(error);return;}
      const closing=Number.isSafeInteger(source)&&source>=0&&source!==id
        ?chromeApi.tabs.remove(source)
        :undefined;
      Promise.all([opening,closing]).then(()=>resolve(),reject);
    });
  });
}
