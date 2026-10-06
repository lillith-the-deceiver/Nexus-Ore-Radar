export const ANALYTICS_DELAY_MS=60000;
export const ANALYTICS_PERIODS=['total','day','week'];

export function analyticsBoundary(period,now=Date.now()){
 if(period==='total')return 'total';const date=new Date(now),day=`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;return period==='day'?`${day}:${date.getHours()}`:day;
}

export function emptyAnalyticsState(){return {version:0,periods:{}};}
export function normalizeAnalyticsState(value){const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{},periods={};for(const period of ANALYTICS_PERIODS){const row=source.periods?.[period];if(row&&typeof row==='object'&&!Array.isArray(row))periods[period]={value:row.value??null,version:String(row.version??''),boundary:String(row.boundary??''),dirtyAt:row.dirtyAt!==null&&row.dirtyAt!==undefined&&Number.isFinite(Number(row.dirtyAt))?Number(row.dirtyAt):null,generation:Number.isSafeInteger(row.generation)?row.generation:0};}return {version:Number.isSafeInteger(source.version)?source.version:0,periods};}

export function markAnalyticsStateDirty(value,now=Date.now()){
 const state=normalizeAnalyticsState(value);for(const row of Object.values(state.periods)){row.generation++;if(row.dirtyAt===null)row.dirtyAt=now;}return state;
}

export function dueAnalyticsPeriods(value,now=Date.now(),delay=ANALYTICS_DELAY_MS){const state=normalizeAnalyticsState(value);return ANALYTICS_PERIODS.filter(period=>{const row=state.periods[period];return !!row&&row.value!==null&&(row.boundary!==analyticsBoundary(period,now)||(row.dirtyAt!==null&&now>=row.dirtyAt+delay));});}

export function shouldBuildAnalytics(value,period,{now=Date.now(),force=false,delay=ANALYTICS_DELAY_MS}={}){if(!ANALYTICS_PERIODS.includes(period))throw Error('Unknown analytics period.');const state=normalizeAnalyticsState(value),row=state.periods[period];return force||!row||row.value===null||row.boundary!==analyticsBoundary(period,now)||(row.dirtyAt!==null&&now>=row.dirtyAt+delay);}

export function committedAnalyticsState(value,period,analysis,{startedGeneration=0,now=Date.now()}={}){
 const state=normalizeAnalyticsState(value),current=state.periods[period]||{generation:0,dirtyAt:null};state.version++;state.periods[period]={value:analysis,version:String(state.version),boundary:analyticsBoundary(period,now),generation:current.generation,dirtyAt:current.generation===startedGeneration?null:current.dirtyAt};return state;
}
