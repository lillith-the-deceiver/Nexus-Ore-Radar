export const CONSENT_VERSION = 1;
export const SEASONS = [
  {name:'Season 0',origin:'https://s0.nexuslegacy.space'},
  {name:'New Frontier',origin:'https://nf.nexuslegacy.space'},
  {name:'Beta',origin:'https://beta.nexuslegacy.space'}
];
export const contributesRaids = origin => origin === SEASONS[0].origin;
export function contributionForContext(context, report) {
  // Enforce at the storage boundary too, not just the selected-season UI.
  try {
    const parts=JSON.parse(context);
    if(!Array.isArray(parts)||parts.length!==2||!contributesRaids(parts[0])||
       contextKey(parts[0],parts[1])!==context)return null;
    return raidContribution(report);
  }catch{return null;}
}
export function seasonOrigin(input) {
  const u = new URL(input);
  if (u.protocol !== 'https:' || u.port || u.username || u.password ||
      !SEASONS.some(s=>s.origin===u.origin)) throw Error('Choose Season 0, New Frontier or Beta.');
  return u.origin;
}
export function contextKey(origin, userId) {
  if (userId === undefined || userId === null || String(userId).length === 0) throw Error('Account identity missing.');
  return JSON.stringify([seasonOrigin(origin), String(userId)]);
}
export function hasConsent(settings) {
  return settings?.consent?.accepted === true && settings.consent.version === CONSENT_VERSION;
}
export function raidContribution(report) {
  // This function is called ONLY for Nexus's mining-report feed.
  // Keep ordinary mining outcomes local, even when they contain shipsLost.
  if (report?.reportType !== 'pirate_raid' || report.id === undefined || report.id === null) return null;
  if(report.id==='')return null;
  // Match desktop payload_json: preserve the complete API report.
  return structuredClone(report);
}
export function decodeReports(data) {
  const reports = Array.isArray(data) ? data : data?.reports;
  if (!Array.isArray(reports)) throw Error('Unexpected mining-report response; nothing was marked captured.');
  return reports;
}
