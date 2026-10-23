// Execute the unchanged Python API off the UI thread.
const root = new URL('.', import.meta.url);
let python, api, encoder, queue = Promise.resolve();
const ready = (async () => {
  const {loadPyodide} = await import('https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs');
  python = await loadPyodide();
  await python.loadPackage(['numpy', 'scipy', 'pillow', 'matplotlib']);
  const response = await fetch(new URL('nml.zip', root));
  if(!response.ok) throw new Error('Cannot download the preview engine.');
  python.unpackArchive(await response.arrayBuffer(), 'zip');
  api = python.pyimport('nml.explorer.browser');
  self.postMessage({type:'ready'});
})();
ready.catch(error=>self.postMessage({type:'failed',message:String(error)}));

async function encodeMP4(raw, metadata) {
  if(!encoder) {
    self.postMessage({type:'progress',message:'Loading video encoder…'});
    const {FFmpeg} = await import(new URL('ffmpeg/index.js', root));
    encoder = new FFmpeg();
    const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
    await encoder.load({coreURL:base+'/ffmpeg-core.js',wasmURL:base+'/ffmpeg-core.wasm'});
  }
  self.postMessage({type:'progress',message:'Encoding MP4 on your device…'});
  try {
    await encoder.writeFile('input.raw',raw);
    const code = await encoder.exec(['-f','rawvideo','-pix_fmt','gray','-s:v',`${metadata.width}x${metadata.height}`,
      '-r',String(metadata.fps),'-i','input.raw','-an','-c:v','libx264','-pix_fmt','yuv420p',
      '-crf','12','-preset','veryfast','-movflags','+faststart','output.mp4']);
    if(code!==0) throw new Error('The browser video encoder could not finish.');
    return await encoder.readFile('output.mp4');
  } catch(error) {
    encoder.terminate();encoder=null;throw error;
  } finally {
    if(encoder) for(const name of ['input.raw','output.mp4']) {
      try { await encoder.deleteFile(name); } catch(_) { /* May not exist after an encoding failure. */ }
    }
  }
}

self.onmessage = ({data}) => {
  queue = queue.catch(()=>{}).then(async()=>{
    try {
      await ready;
      const result = JSON.parse(api.dispatch(data.path,JSON.stringify(data.body)));
      if(result.file) {
        let bytes = python.FS.readFile(result.file);
        python.FS.unlink(result.file);delete result.file;
        if(result.raw_video) bytes = await encodeMP4(bytes,result);
        result.bytes=bytes;
        self.postMessage({id:data.id,result},[bytes.buffer]);
      } else self.postMessage({id:data.id,result});
    } catch(error) {
      self.postMessage({id:data.id,error:String(error)});
    }
  });
};
