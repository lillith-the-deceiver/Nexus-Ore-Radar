// Kept as a lifecycle hook so existing callers do not need to special-case
// updates. Extension updates must never erase saved analytics or preferences.
export async function resetExtensionDataForUpdate(){
  return false;
}
