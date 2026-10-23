"use strict";

// This file is included only in the generated GitHub Pages build.
globalThis.NMLBrowser = (() => {
  const config = globalThis.NML_BROWSER_CONFIG;
  const root = new URL('.',document.baseURI);
  const site = new URL('../../',root);
  const pending = new Map();
  let worker, nextId=0, unavailable=false, latest=config.revision, lastActive=Date.now();
  let serverPromise, firstPreview, schema, bootTimer, defaultKey;
  const label=document.querySelector('#runtimeStatus');
  const setLabel=text=>{label.textContent=text;};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

  function stopWorker(error) {
    unavailable=true;clearTimeout(bootTimer);worker?.terminate();worker=null;
    for(const {reject,timer} of pending.values()) {clearTimeout(timer);reject(error);}
    pending.clear();setLabel('Using shared server');
  }
  try {
    worker=new Worker(new URL('browser-worker.mjs',root),{type:'module'});
    bootTimer=setTimeout(()=>stopWorker(new Error('Browser Python took too long to start.')),45000);
    worker.onerror=event=>{event.preventDefault();stopWorker(new Error('Browser Python could not start.'));};
    worker.onmessage=({data})=>{
      if(data.type==='ready') {clearTimeout(bootTimer);setLabel('Running on your device');return;}
      if(data.type==='failed') {stopWorker(new Error(data.message));return;}
      if(data.type==='progress') {document.querySelector('#exportStatus').textContent=data.message;return;}
      const item=pending.get(data.id);if(!item)return;
      clearTimeout(item.timer);pending.delete(data.id);
      data.error ? item.reject(new Error(data.error)) : item.resolve(data.result);
    };
  } catch(error) {stopWorker(error);}

  function local(path,body) {
    return new Promise((resolve,reject)=>{
      const id=++nextId;
      const timer=setTimeout(()=>stopWorker(new Error('This device could not finish the request.')),path==='/api/export'?120000:60000);
      pending.set(id,{resolve,reject,timer});worker.postMessage({id,path,body});
    });
  }
  async function getSchema() {
    if(!schema) {
      const response=await fetch(new URL('schema.json',root));
      if(!response.ok)throw new Error('Cannot load the explorer settings. Refresh to retry.');
      schema=await response.json();
    }
    return schema;
  }
  async function initialPreview(body) {
    const defaults=(await getSchema()).default;
    const key=JSON.stringify(body.config);
    if(body.seed!==0 || (key!==defaultKey && key!==JSON.stringify(defaults)))return null;
    if(!firstPreview) firstPreview=(async()=>{
      const response=await fetch(new URL('default-preview.json.gz',root));
      if(!response.ok)throw new Error('No initial preview');
      return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    })();
    return firstPreview;
  }
  async function connectServer() {
    if(serverPromise)return serverPromise;
    serverPromise=(async()=>{
      setLabel('Starting shared server…');
      const deadline=Date.now()+150000;
      while(Date.now()<deadline) {
        try {
          const response=await fetch(config.server+'/api/health',{cache:'no-store',signal:AbortSignal.timeout(15000)});
          if(response.ok) {
            const health=await response.json();
            if(health.revision===config.revision) {setLabel(unavailable?'Using shared server':'Running on your device · server download');return health;}
            // A deployment may still be starting. An older open tab needs a refresh.
            const version=await (await fetch(new URL('version.json?time='+Date.now(),site),{cache:'no-store'})).json();
            if(version.revision!==config.revision) {
              latest=version.revision;NMLHosting.showUpdate();
              throw Object.assign(new Error('A new explorer is available. Refresh to use the shared server.'),{code:'update_available'});
            }
          }
        } catch(error) {if(error.code==='update_available')throw error;}
        await delay(2000);
      }
      throw new Error('The shared server is unavailable. Your settings are kept; try again shortly.');
    })().catch(error=>{serverPromise=null;throw error;});
    return serverPromise;
  }
  async function remote(path,body) {
    try {
      const health=await connectServer();
      const response=await NMLHosting.networkRequest(config.server+path,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...body,revision:health.revision})});
      if(response.status===409)serverPromise=null;
      return response;
    } catch(error) {return json({error:error.message,code:error.code},error.code==='update_available'?409:503);}
  }
  async function request(path,options={}) {
    if(path==='/api/schema')return json(await getSchema());
    const body=JSON.parse(options.body || '{}');
    if(path==='/api/render') {
      try {const preview=await initialPreview(body);if(preview)return json(preview);}catch(_) { /* Normal generation remains available. */ }
    }
    if(unavailable)return remote(path,body);
    try {
      const result=await local(path,body);
      const headers={'Content-Type':result.content_type || 'application/json'};
      if(result.filename)headers['Content-Disposition']=`attachment; filename="${result.filename}"`;
      return new Response(result.bytes || JSON.stringify(result.body),{status:result.status,headers});
    } catch(error) {
      // An unsupported encoder can use the server while previews stay local.
      if(path!=='/api/export')stopWorker(error);
      return remote(path,body);
    }
  }
  function setup(remember) {
    document.querySelector('#refreshVersion').onclick=()=>{remember();location.replace(new URL('?v='+latest,site));};
    for(const name of ['pointerdown','keydown','input'])document.addEventListener(name,()=>{lastActive=Date.now();},{passive:true});
    let checking=false;
    setInterval(async()=>{
      if(checking || document.hidden || Date.now()-lastActive>600000)return;
      checking=true;
      try {
        const response=await fetch(new URL('version.json?time='+Date.now(),site),{cache:'no-store',signal:AbortSignal.timeout(10000)});
        if(response.ok) {latest=(await response.json()).revision;if(latest!==config.revision)NMLHosting.showUpdate();}
      } catch(_) { /* Cached previews and edits continue to work. */ }
      finally {checking=false;}
    },60000);
  }
  return {request,setup,setDefaultConfig:value=>{defaultKey=JSON.stringify(value);}};
})();
