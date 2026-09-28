// Only the report is serialized, not transport headers/cookies or local context.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function jsonValue(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'&&Number.isFinite(value))return;
  if(Array.isArray(value)){for(const v of value)jsonValue(v);return;}
  if(object(value)){for(const v of Object.values(value))jsonValue(v);return;}
  throw Error('Report must contain JSON values');
}
export function validateEnvelope(value,{allowLegacy=false}={}){
  if(!object(value)||Object.keys(value).some(k=>!['version','season','report'].includes(k)))throw Error('Invalid envelope');
  if(value.season!=='season-0'||!(value.version===2||(allowLegacy&&value.version===1)))throw Error('Only Season 0 raids accepted');
  const report=value.report;
  if(!object(report)||!['string','number'].includes(typeof report.id)||String(report.id)==='')throw Error('Missing report identity');
  if(value.version===2&&report.reportType!=='pirate_raid')throw Error('Only mining pirate raids accepted');
  if(value.version===1&&!object(report.combatLog))throw Error('Invalid legacy report');
  jsonValue(report);
  return value;
}
export function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(object(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function encodeContribution(report){
  const text=canonical(validateEnvelope({version:2,season:'season-0',report}));
  return text;
}
