// Port of desktop fuel_capture.py: forward-only full-fleet estimates.
export const MAX_ATTEMPTS=3,CAPTURE_WINDOW_MS=300000,RETRY_MS=30000;
const number=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
export function newFuelQuote(mission,cutoff,now){
 const created=Date.parse(mission.createdAt);
 if(mission.missionType!=='mine'||mission.status!=='outbound'||!Number.isFinite(created)||created<cutoff)return null;
 const row={missionId:String(mission.id),dispatch:mission,firstSeenAt:now,status:'pending',attempts:0,nextAttemptAt:now};
 const unsupported=message=>({...row,status:'unsupported',error:message});
 if(!mission.sourcePlanetId||!mission.targetFieldId||!Array.isArray(mission.fleetComposition)||!mission.fleetComposition.length)return unsupported('Incomplete outbound fleet or route.');
 if(['sourceMoonId','sourceOutpostId','sourceStationId','hangarAssignments'].some(k=>mission[k]))return unsupported('Special origin or hangar assignment needs a dedicated quote contract.');
 if(number(mission.distance)===null)return unsupported('Missing dispatch distance.');
 const ships=[];
 for(const ship of mission.fleetComposition){if(!ship)return unsupported('Invalid fleet entry.');const quantity=number(ship.quantity),damaged=number(ship.damagedQuantity??0);if(quantity===null||damaged===null||!Number.isSafeInteger(quantity+damaged))return unsupported('Incomplete fleet quantities.');const total=quantity+damaged;if(!total)continue;if(!ship.shipKey||!Number.isSafeInteger(Number(ship.shipDefId))||Number(ship.shipDefId)<=0)return unsupported('Missing ship definition; refusing a partial-fleet quote.');ships.push({shipDefId:Number(ship.shipDefId),quantity:total});}
 if(!ships.length)return unsupported('Empty fleet.');
 row.request={sourcePlanetId:mission.sourcePlanetId,targetFieldId:mission.targetFieldId,ships,missionType:'mine'};if(mission.leadershipVessel)row.request.attachLeader=true;
 return row;
}
export function quoteResult(row,result,now){
 const fuel=number(result?.data?.fuelCost),distance=number(result?.data?.distance),dispatched=number(row.dispatch.distance);
 const valid=result?.status===200&&fuel!==null&&distance!==null&&dispatched!==null&&Math.abs(distance-dispatched)<=Math.max(.01,1e-5*Math.max(distance,dispatched));
 if(valid)return {...row,status:'quoted',fuelCost:fuel,distance,quotedAt:now,error:null};
 return {...row,status:[0,401,403,429,500,502,503,504].includes(result?.status??0)&&row.attempts<MAX_ATTEMPTS?'pending':'failed',error:'Fuel quote unavailable or route distance changed.'};
}
export function expiredQuote(row,active,now){return now-row.firstSeenAt>CAPTURE_WINDOW_MS||!active.has(row.missionId);}
