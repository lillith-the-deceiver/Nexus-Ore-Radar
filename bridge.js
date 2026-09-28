export async function sendRead(tabId, origin, path, body) {
  const message=body===undefined?{type:'NEXUS_READ',origin,path}:{type:'NEXUS_FUEL_QUOTE',origin,path,body};
  try {return await chrome.tabs.sendMessage(tabId,message);}
  catch(error) {
    if(!/Receiving end does not exist|Could not establish connection/i.test(error.message || '')) throw error;
    // Existing tabs may predate installation/reload. Attach without reloading
    // the user's game; only the selected, already-authorized host is eligible.
    const tab=await chrome.tabs.get(tabId);
    if(new URL(tab.url).origin!==origin) throw Error('Nexus tab changed season. Connect again.');
    await chrome.scripting.executeScript({target:{tabId},files:['content.js']});
    return chrome.tabs.sendMessage(tabId,message);
  }
}
