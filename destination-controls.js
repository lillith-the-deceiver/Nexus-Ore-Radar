import {RESOURCE_TYPES,validateFleet,optimizeDestinations} from './destination-estimates.js';

const normalizePresets=value=>{
 if(!Array.isArray(value))throw Error('Could not read saved fleet presets.');
 return value.map(row=>{if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.name!=='string'||!row.name.trim())throw Error('Could not read saved fleet presets.');return {name:row.name.trim(),fleet:validateFleet(row.fleet)};});
};

export function createDestinationControls({request,reload,resource='all'}){
 const el=name=>document.getElementById('destination-'+name),validResource=()=>RESOURCE_TYPES.includes(resource);
 let context='',catalog=null,snapshot=null,presets=[],lastPreset='',remembered=false,fleet=[],pending=null;
 const preference=()=>({remembered,applicable:validResource(),enabled:remembered&&validResource()});
 const allShips=()=>[...(catalog?.mining||[]),...(catalog?.escorts||[])];
 const popup=message=>{el('dialog-message').textContent=message;if(!el('dialog').open)el('dialog').showModal();};
 const selectedCount=key=>fleet.find(row=>row.key===key)?.count||0;
 const status=message=>{el('status').textContent=message||'';};
 async function persist(){await request({type:'SAVE_DESTINATION_STATE',state:{presets,lastPreset,remembered}});}
 function presetsUI(){
  const select=el('presets');select.replaceChildren(new Option('Load preset…',''),...presets.map(row=>new Option(row.name,row.name)));select.value=presets.some(row=>row.name===lastPreset)?lastPreset:'';
 }
 function drawFleet(){
  const draw=(container,ships)=>{container.replaceChildren();for(const ship of ships){const tile=document.createElement('label');tile.className='destination-ship-tile';const copy=document.createElement('span');copy.className='destination-ship-copy';const name=document.createElement('strong');name.textContent=ship.name;copy.append(name);const input=document.createElement('input');input.type='number';input.min='0';input.step='1';input.inputMode='numeric';input.value=String(selectedCount(ship.key));input.className='destination-ship-count';input.dataset.shipKey=ship.key;input.setAttribute('aria-label',`${ship.name} quantity`);input.addEventListener('change',()=>{const count=Number(input.value);if(!Number.isSafeInteger(count)||count<0){popup('Use whole, non-negative ship quantities.');drawFleet();return;}const others=fleet.filter(row=>row.key!==ship.key);if(count)others.push({key:ship.key,count});fleet=others;drawFleet();if(preference().enabled)reload();});tile.append(copy,input);container.append(tile);}};
  draw(el('mining-ships'),catalog?.mining||[]);draw(el('escort-ships'),catalog?.escorts||[]);
 }
 function sync(){const state=preference();el('on').setAttribute('aria-pressed',String(state.remembered));el('off').setAttribute('aria-pressed',String(!state.remembered));}
 function selectionProblem(){
  if(!catalog)return 'Open Fleet & Presets and choose a fleet.';
  const allowed=new Set(allShips().map(ship=>ship.key));if(!fleet.length)return 'Select or enter your fleet before enabling optimized sorting.';
  if(fleet.some(row=>!allowed.has(row.key)))return 'This fleet contains a ship that is not available for the optimizer.';
  try{validateFleet(fleet);}catch(error){return error.message;}
  const mining=new Set((catalog.mining||[]).map(ship=>ship.key));if(!fleet.some(row=>mining.has(row.key)))return 'Select at least one mining ship.';
  return '';
 }
 async function applyPreset(name,remember=true){
  if(!name)return false;const preset=presets.find(row=>row.name===name);if(!preset)return false;
  const allowed=new Set(allShips().map(ship=>ship.key));if(preset.fleet.some(row=>!allowed.has(row.key)))throw Error('This preset contains a ship that is not available for the optimizer.');
  fleet=validateFleet(preset.fleet);lastPreset=preset.name;el('preset-name').value=preset.name;el('presets').value=preset.name;if(remember)await persist();drawFleet();return true;
 }
 async function restoreLastPreset(){
  if(!lastPreset)return false;
  try{if(!await applyPreset(lastPreset,false)){lastPreset='';await persist();return false;}return true;}
  catch(error){lastPreset='';try{await persist();}catch{}status(error.message);return false;}
 }
 async function load(){
  if(catalog)return true;if(pending)return pending;const own=context;
  pending=(async()=>{try{const data=await request({type:'DESTINATION_DATA'});if(own!==context)return false;catalog=data.catalog;snapshot=data.snapshot;presets=normalizePresets(data.state?.presets||[]);lastPreset=String(data.state?.lastPreset||'').trim();remembered=data.state?.remembered===true;presetsUI();sync();if(!await restoreLastPreset())drawFleet();return true;}catch(error){status(error.message);return false;}finally{pending=null;}})();return pending;
 }
 async function setRemembered(value){remembered=Boolean(value);await persist();sync();}
 async function toggleSorting(enabled){
  if(!enabled){await setRemembered(false);reload();return;}
  if(resource==='all'){await setRemembered(true);return;}
  if(!validResource()){popup('Select a resource type to use optimized sorting. It does not work with All Belts.');sync();return;}
  await load();const problem=selectionProblem();if(problem){popup(problem);sync();return;}await setRemembered(true);reload();
 }
 el('fleet-toggle').addEventListener('click',()=>{el('fleet-panel').open=!el('fleet-panel').open;if(el('fleet-panel').open)void load();});
 document.addEventListener('click',event=>{const panel=el('fleet-panel'),toggle=el('fleet-toggle');if(panel.open&&!panel.contains(event.target)&&!toggle.contains(event.target))panel.open=false;});
 el('on').addEventListener('click',()=>void toggleSorting(true));el('off').addEventListener('click',()=>void toggleSorting(false));
 el('save').addEventListener('click',async()=>{await load();try{const problem=selectionProblem();if(problem)throw Error(problem);const name=el('preset-name').value.trim();if(!name)throw Error('Enter a preset name.');if(presets.some(row=>row.name===name))throw Error('A preset with that name already exists. Choose another name.');const saved={name,fleet:validateFleet(fleet)},oldLast=lastPreset;presets.push(saved);lastPreset=name;try{await persist();}catch(error){presets=presets.filter(row=>row!==saved);lastPreset=oldLast;throw error;}presetsUI();el('presets').value=name;status('Fleet preset saved.');}catch(error){popup(error.message);}});
 el('remove').addEventListener('click',async()=>{try{const name=el('presets').value;if(!name||!presets.some(row=>row.name===name))throw Error('Choose a saved preset to remove.');const old=presets,oldLast=lastPreset;presets=presets.filter(row=>row.name!==name);if(lastPreset===name)lastPreset='';try{await persist();}catch(error){presets=old;lastPreset=oldLast;throw error;}presetsUI();if(el('preset-name').value===name)el('preset-name').value='';status('Fleet preset removed.');}catch(error){popup(error.message);}});
 el('presets').addEventListener('change',async()=>{try{await load();if(!await applyPreset(el('presets').value))return;if(preference().enabled)reload();}catch(error){popup(error.message);}});
 presetsUI();sync();
 return {
  async setContext(next){if(context===next)return;context=next;catalog=null;snapshot=null;presets=[];lastPreset='';remembered=false;fleet=[];status('');presetsUI();sync();await load();if(preference().enabled)reload();},
  selectResource(next){resource=next;sync();if(catalog)drawFleet();},
  wantsOptimization(){return preference().enabled;},
  async prepare(){return load();},
  isEnabled(){return preference().enabled&&!selectionProblem();},
  optimize(systems,breakdownRates){return optimizeDestinations(systems,resource,validateFleet(fleet),snapshot,breakdownRates);},
  showResult(result){status(result?.message||(preference().enabled?selectionProblem():'')||'');}
 };
}
