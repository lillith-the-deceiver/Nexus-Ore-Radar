// API calendar ISO timestamps without a zone are UTC, as in _operation_epoch.
export function operationEpoch(value){
 if(typeof value==='number')return Number.isFinite(value)&&value>0?Math.trunc(value>10000000000?value/1000:value):null;
 if(typeof value!=='string'||!value.trim())return null;
 const text=value.trim();
 const match=/^(\d{4})-?(\d{2})-?(\d{2})(?:[Tt ](\d{2})(?::?(\d{2}))?(?::?(\d{2}))?(?:[.,](\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/.exec(text);
 if(!match)return null;
 const [,y,m,d,h='00',min='00',s='00',fraction='',zone='Z']=match;
 const year=Number(y),month=Number(m),day=Number(d);
 const leap=year%4===0&&(year%100!==0||year%400===0);
 if(year<1||month<1||month>12||day<1||day>[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1]||Number(h)>23||Number(min)>59||Number(s)>59)return null;
 const offset=zone==='Z'?'Z':zone.length===3?`${zone}:00`:zone.includes(':')?zone:`${zone.slice(0,3)}:${zone.slice(3)}`;
 const at=Date.parse(`${y}-${m}-${d}T${h}:${min}:${s}.${fraction.padEnd(3,'0').slice(0,3)}${offset}`);
 return Number.isFinite(at)?Math.trunc(at/1000)||0:null;
}
