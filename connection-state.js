// A refreshed dashboard can outlive an older unpacked-extension worker.
export const STATE_PROTOCOL=10;
export const RELOAD_MESSAGE='Radar was updated, but Chrome is still running its older background version. Reload Nexus Ore Radar in Chrome’s Extensions page, then refresh this Radar tab.';
export function compatibleState(state){return state?.protocol===STATE_PROTOCOL;}
export function connectedState(settings,connection,accepted){
  return !!(accepted&&settings?.enabled&&connection?.context&&settings.origin===connection.origin);
}
