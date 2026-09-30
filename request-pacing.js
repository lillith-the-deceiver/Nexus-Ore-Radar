// Port of server.py's adaptive request pacing. Times are milliseconds here.
export class RequestPacing {
  constructor({now=()=>performance.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),delayMs=500}={}){
    this.now=now;this.sleep=sleep;this.configured=Math.max(250,Math.min(Number(delayMs)||500,3000));
    this.backoffUntil=0;this.normal=[];this.priority=[];this.reset();
  }
  reset(){this.last=0;this.delay=this.configured;this.streak=0;this.holdUntil=0;}
  success(){if(this.now()<this.holdUntil)return;if(++this.streak>=10){this.delay=Math.max(250,this.delay-25);this.streak=0;}}
  backoff(attempt,rateLimited=false){
    const pause=Math.min(60000,5000*2**Math.max(0,Math.trunc(attempt))),now=this.now();
    this.backoffUntil=Math.max(this.backoffUntil,now+pause);this.streak=0;
    if(rateLimited){this.delay=Math.min(3000,Math.max(this.configured,this.delay*1.35));this.holdUntil=Math.max(this.holdUntil,now+Math.min(120000,pause*3));}
  }
  async wait(priority=false,validate=()=>{}){
    const ticket={},queue=priority?this.priority:this.normal;queue.push(ticket);
    try{for(;;){
      validate();const now=this.now(),scheduled=Math.max(now,this.last+this.delay,this.backoffUntil);
      if(!priority&&(this.priority.length||this.normal[0]!==ticket)){await this.sleep(100);continue;}
      if(scheduled>now){await this.sleep(scheduled-now);continue;}
      this.last=now;return;
    }}finally{queue.splice(queue.indexOf(ticket),1);}
  }
}
export async function detailWithRetries(read,pacing){
  let result;
  for(let attempt=0;attempt<5;attempt++){
    result=await read();
    if(result.status===200)pacing.success();
    if(![429,500,502,503,504].includes(result.status))break;
    pacing.backoff(attempt,result.status===429);
  }
  return result;
}
