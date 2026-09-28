// Isolated content script: no page-global token access or fetch interception.
(()=>{
const allowed = new Set(['/api/auth/me','/api/fleet/reports','/api/fleet/mining-reports','/api/fleet/missions','/api/galaxy/map','/api/galaxy/field-index','/api/planets']);
if (/^(s0|nf|beta)\.nexuslegacy\.space$/.test(location.hostname)) {
  const marker='__nexusRadarBridge023';
  if(globalThis[marker])return;
  globalThis[marker]=true;
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id)return;
    const quote=message?.type==='NEXUS_FUEL_QUOTE'&&message.path==='/api/fleet/fuel-estimate';
    if(!quote&&(message?.type!=='NEXUS_READ'||!(allowed.has(message.path)||/^\/api\/galaxy\/systems\/[1-9][0-9]*\/planets\?include=fields$/.test(message.path))))return;
    if(quote){const b=message.body,positive=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;if(!b||Object.keys(b).some(k=>!['sourcePlanetId','targetFieldId','ships','missionType','attachLeader'].includes(k))||b.missionType!=='mine'||!positive(b.sourcePlanetId)||!positive(b.targetFieldId)||!Array.isArray(b.ships)||!b.ships.length||b.ships.some(s=>!s||Object.keys(s).some(k=>!['shipDefId','quantity'].includes(k))||!positive(s.shipDefId)||!positive(s.quantity))||(b.attachLeader!==undefined&&b.attachLeader!==true)){respond({ok:false,status:400});return;}}
    if(message.origin!==location.origin){respond({ok:false,status:409});return;}
    (async()=>{
      const detail=/^\/api\/galaxy\/systems\/[1-9][0-9]*\/planets\?include=fields$/.test(message.path);
      const response=await fetch(message.path,{credentials:'include',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(quote||detail?8000:12000),...(quote?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message.body)}:{})});
      if(!response.ok) return {ok:false,status:response.status};
      return {ok:true,status:response.status,data:await response.json()};
    })().then(respond,()=>respond({ok:false,status:0}));
    return true;
  });
  let timer;
  const pulse=()=>{try{chrome.runtime.sendMessage({type:'GAME_PULSE'}).catch(()=>{clearInterval(timer);});}catch{clearInterval(timer);}};
  timer=setInterval(pulse,2500);pulse();
}
})();
