export function validDisplayFilter(filter){
 return Number.isFinite(filter.richness)&&filter.richness>=0&&filter.richness<=10
  &&Number.isFinite(filter.remaining)&&filter.remaining>=0&&filter.remaining<=100
  &&['all','ore','gas','plasma','ice'].includes(filter.type)
  &&['all','sentinel','open','dead'].includes(filter.zone);
}
export function filterAction(action){
 const match=action?.match(/^(setRichness|setPct|setZone|setOreType)\(([^,)]+)/);
 if(!match)return null;
 const key={setRichness:'richness',setPct:'remaining',setZone:'zone',setOreType:'type'}[match[1]];
 const raw=match[2].replaceAll("'",'').trim();
 return {key,value:['richness','remaining'].includes(key)?Number(raw):raw};
}
export function updateSearchButtons(root,filter,customRichness=false){
 for(const b of root.querySelectorAll('.rich-btn,.pct-btn,.zone-btn,.ore-btn')){
  const action=filterAction(b.dataset.onclick);
  b.classList.toggle('desktop-selected',!!action&&!(customRichness&&action.key==='richness')&&filter[action.key]===action.value);
 }
}
