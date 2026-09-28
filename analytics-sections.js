// Personal renderAnalyticsIfChanged: commit the signature only after rendering.
export function sectionRenderer(){
 const snapshots=new Map();
 return (key,value,render)=>{
  const signature=JSON.stringify(value);
  if(snapshots.get(key)===signature)return;
  render();snapshots.set(key,signature);
 };
}
