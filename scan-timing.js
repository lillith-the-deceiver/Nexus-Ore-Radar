import {desktopRound} from './detail-parsing.js';
// Personal update_scan_progress: completed checks / total elapsed time.
export function scanTiming(done,total,elapsedSeconds,delayMs,recovering=false){
 const remaining=Math.max(0,total-done);
 const rate=done>=3&&elapsedSeconds>=2?done/elapsedSeconds*60:null;
 return {observed_requests_per_minute:rate?desktopRound(rate,1):null,
  estimated_remaining_seconds:rate&&remaining?Math.ceil(remaining/rate*60):done>=total?0:null,
  pacing_delay_ms:Math.round(delayMs),pacing_requests_per_minute:desktopRound(60000/delayMs,1),pacing_recovering:recovering};
}
export function formatRemainingTime(seconds){
 const totalSeconds=Math.max(0,Math.round(Number(seconds)||0));
 if(totalSeconds<60)return 'under 1 min';
 const minutes=Math.floor(totalSeconds/60);if(minutes<60)return `about ${minutes} min`;
 const hours=Math.floor(minutes/60),remainingMinutes=minutes%60;
 return `about ${hours}h${remainingMinutes?` ${remainingMinutes}m`:''}`;
}
export function formatScanThroughput(state){
 const observed=Number(state?.observed_requests_per_minute),configured=Number(state?.pacing_requests_per_minute);
 return Number.isFinite(observed)&&observed>0?`${observed.toFixed(1)} systems/min`:configured>0?`up to ${configured.toFixed(0)} systems/min`:'Measuring pace…';
}
export function scanStatus(state){
 if(!state)return 'Choose an origin to search for exact belt data.';
 const estimate=state.estimated_remaining_seconds==null?'estimating remaining time…':`${formatRemainingTime(state.estimated_remaining_seconds)} remaining`;
 return `${state.running?(state.phase==='priority'?'Priority belts':state.phase==='remaining'?'Remaining systems':'Updating'):state.cancelled?'Stopped':'Checked'} ${state.done}/${state.total}${state.running?` · ${estimate} · ${formatScanThroughput(state)}`:''}${state.error?' · '+state.error:''}`;
}
