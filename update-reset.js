const MARKER='clean-reset-completed-v1';

export async function resetExtensionDataForUpdate(chromeApi,details,clearDatabase){
  if(details?.reason==='install'){
    await chromeApi.storage.local.set({[MARKER]:true});
    return false;
  }
  if(details?.reason!=='update'||(await chromeApi.storage.local.get(MARKER))[MARKER]===true)return false;
  await clearDatabase();
  await chromeApi.storage.session.clear();
  await chromeApi.storage.local.clear();
  await chromeApi.storage.local.set({[MARKER]:true});
  return true;
}
