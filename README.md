# Noisy moving letters explorer

[Open the explorer](https://hadivafaii.github.io/noisy-moving-letters/)

Open the link to use the explorer. No installation, account, or local Python
server is needed. The interface and initial preview load from GitHub Pages;
the original Python generator runs on your device through Pyodide in a web
worker. GIF and MP4 downloads also run locally. The video encoder loads only
when an MP4 is requested.

If browser execution is unavailable, the explorer automatically uses the Render
service, preserving your settings. That free backup server may need about a
minute to wake up. Large scenes remain subject to memory and workload limits.

This repository is the generated public site. Its `nml.zip` contains the exact
generator source shipped to browsers; the development repository stays private.
Pushes to the source repository's `main` branch publish a new browser build after
all tests pass and redeploy Render. Existing sessions offer a refresh and retain
settings and comparisons. The deployed source revision is in `version.json`.

Pyodide and its packages are loaded from the versioned official jsDelivr
distribution. MP4 encoding uses ffmpeg.wasm, loaded on demand from jsDelivr.
The FFmpeg JavaScript wrapper is distributed under the MIT license included
with its files; FFmpeg's WebAssembly core has its own upstream license.
