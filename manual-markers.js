// Browser storage adapter for desktop systems.sent_at. All mutations go through
// the worker so saving unrelated dashboard preferences cannot restore old marks.
export function manualMarkerStore(storage){
  let writes=Promise.resolve();
  const key=context=>'manual-sent:'+context;
  async function read(context){
    const k=key(context),saved=(await storage.get(k))[k];
    if(saved!==undefined)return saved;
    const legacy=(await storage.get('ui:'+context))['ui:'+context];
    return {...legacy?.sent};
  }
  return {
    async get(context){await writes;return read(context);},
    set(context,id,value){
      const operation=writes.then(async()=>{const sent=await read(context);if(value)sent[String(id)]=Date.now();else delete sent[String(id)];await storage.set({[key(context)]:sent});return sent;});
      writes=operation.catch(()=>{});return operation;
    }
  };
}
