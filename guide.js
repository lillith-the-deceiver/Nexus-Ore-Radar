export function bindGuide(doc=document){
 const dialog=doc.getElementById('radar-guide');
 if(!dialog)return;
 for(const id of ['open-guide','agreement-guide']){
  doc.getElementById(id).addEventListener('click',()=>{if(!dialog.open)dialog.showModal();});
 }
 doc.getElementById('close-guide').addEventListener('click',()=>dialog.close());
}
