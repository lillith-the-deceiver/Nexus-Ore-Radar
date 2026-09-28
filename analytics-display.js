// Personal index.html formatDuration, unchanged apart from the export.
export function formatDuration(seconds){
 const total=Math.max(0,Math.round(Number(seconds)||0));
 if(!total)return '—';
 const hours=Math.floor(total/3600);
 const minutes=Math.round((total%3600)/60);
 return hours?`${hours}h ${minutes}m`:`${minutes}m`;
}
