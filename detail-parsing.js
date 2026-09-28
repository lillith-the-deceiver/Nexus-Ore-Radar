// Ports of the desktop's field-inventory and percentage helpers.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const firstPresent=(v,...keys)=>{for(const k of keys)if(v[k]!==null&&v[k]!==undefined)return v[k];return null;};
export function asFloat(v,fallback=0){if(v===null||v===undefined||typeof v==='object'||(typeof v==='string'&&!v.trim()))return fallback;const n=Number(v);return Number.isNaN(n)?fallback:n;}
// Python rounds the exact binary float with ties to even. Avoid JavaScript's
// different tie rule and multiplication-induced rounding at decimal halves.
export function desktopRound(value,digits){
 if(!Number.isFinite(value)||value===0)return value;
 const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,Math.abs(value));
 const bits=view.getBigUint64(0),exponent=Number((bits>>52n)&2047n),fraction=bits&((1n<<52n)-1n);
 let numerator=(exponent?fraction+(1n<<52n):fraction)*10n**BigInt(digits),denominator=1n;
 const shift=(exponent?exponent-1023:-1022)-52;
 if(shift>=0)numerator<<=BigInt(shift);else denominator<<=BigInt(-shift);
 let rounded=numerator/denominator;const remainder=numerator%denominator;
 if(remainder*2n>denominator||(remainder*2n===denominator&&rounded%2n))rounded++;
 return Math.sign(value)*Number(rounded)/10**digits;
}
export function remainingPct(field){
 const total=Math.max(0,asFloat(firstPresent(field,'totalResources','total_resources'))),units=firstPresent(field,'remainingResources','remaining_resources'),pct=firstPresent(field,'remainingPct','remaining_pct');
 const bounded=v=>desktopRound(Math.min(100,Math.max(0,v)),1);
 if(total>0&&units!==null)return bounded(asFloat(units)/total*100);
 if(pct!==null){const reported=asFloat(pct,100);return bounded(total>0&&reported>100?reported/total*100:reported);}
 return 100;
}
export function explicitInventory(payload){
 if(Array.isArray(payload))return !payload.length||payload.every(explicitInventory);
 if(!object(payload))return false;
 if(['fields','asteroidFields'].some(k=>Array.isArray(payload[k])))return true;
 return ['system','systems','planets'].some(k=>Object.hasOwn(payload,k)&&explicitInventory(payload[k]));
}
export function systemDetailFields(payload){
 const sources=[];
 if(object(payload)){sources.push(payload);for(const k of ['planets','systems'])if(Array.isArray(payload[k]))sources.push(...payload[k].filter(object));if(object(payload.system))sources.push(payload.system);}
 else if(Array.isArray(payload))sources.push(...payload.filter(object));
 const seen=new Set(),fields=[];
 for(const source of sources){const first=source.asteroidFields;const entries=first&&(!Array.isArray(first)||first.length)?first:source.fields||[];if(!Array.isArray(entries))continue;
  for(const field of entries){if(!object(field))continue;const id=field.id;if(id!==null&&id!==undefined){if(seen.has(id))continue;seen.add(id);}fields.push(field);}
 }
 return fields;
}
