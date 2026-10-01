// Scan progress is small state, not a duplicate of retained belt inventories.
export function scanProgress(job){
 if(!job)return null;
 const {queue,results,...progress}=job;
 return {...progress,total:progress.total??queue?.length??0};
}
