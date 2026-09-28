// Status timestamps and marker polls are not analytics data changes.
export function analyticsStamp(context,state){
 return context+':'+(state.analyticsRevision?.context===context?state.analyticsRevision.value:'initial')+':'+String(state.fuelUpdatedAt);
}
export function calendarStamp(period,now=Date.now()){
 const d=new Date(now),offset=d.getTimezoneOffset();d.setHours(0,0,0,0);
 return `${+d}:${offset}:${period==='day'?Math.floor(now/3600000):period}`;
}
