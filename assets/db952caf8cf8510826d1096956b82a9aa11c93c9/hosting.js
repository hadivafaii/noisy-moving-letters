"use strict";

// Hosting changes transport and deployment status only; all controls/rendering
// continue to use the same app.js and Python API as the local explorer.
const NMLHosting = (() => {
  let info = null, save = () => {}, lastActive = Date.now(), polling = false;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const showUpdate = () => { document.querySelector('#versionNotice').hidden = false; };
  async function networkRequest(url, options = {}) {
    for(let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(url, {...options, signal:AbortSignal.timeout(120000)});
        const transient = response.status === 429 ||
          ([502,503,504].includes(response.status) && !response.headers.get('content-type')?.includes('application/json'));
        if(!transient || attempt >= 7) return response;
      } catch(error) {
        if(attempt >= 2) throw new Error('Unable to reach the server. Your settings are kept; check your connection and try again.');
      }
      const status = document.querySelector('#status');
      if(status) status.textContent = 'Waiting for server…';
      await delay(Math.min(2000 * (attempt + 1), 10000));
    }
  }
  function request(url, options = {}) {
    return globalThis.NMLBrowser ? NMLBrowser.request(url, options) : networkRequest(url, options);
  }
  function setup(hosted, remember) {
    if(globalThis.NMLBrowser) { NMLBrowser.setup(remember); return; }
    info = hosted;save = remember;
    if(!info) return;
    document.querySelector('#refreshVersion').onclick = () => { save(); location.reload(); };
    for(const event of ['pointerdown','keydown','input']) document.addEventListener(event,()=>{lastActive=Date.now();},{passive:true});
    // An unattended tab must not keep a free server awake indefinitely.
    setInterval(async()=>{
      if(polling || document.hidden || Date.now()-lastActive>10*60*1000) return;
      polling = true;
      try {
        const response=await fetch('/api/health',{cache:'no-store',signal:AbortSignal.timeout(10000)});
        if(response.ok && (await response.json()).revision!==info.revision) showUpdate();
      } catch(_) { /* Keep the current preview; the next interaction can wake the server. */ }
      finally { polling=false; }
    },60000);
  }
  function ready() {
    if(info && window.parent!==window) window.parent.postMessage({type:'nml-ready'},info.pages_origin);
  }
  return {request,networkRequest,setup,showUpdate,ready};
})();
