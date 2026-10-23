"use strict";

// At most one render in flight. Edits during a render replace the queued request.
// Completed previews can be shown during a continuous drag, marked as updating.
// Serial requests ensure an older response can never overwrite a newer rendered result.
class LatestRenderQueue {
  constructor(render, accept, fail, delay = 75, idle = () => {}) {
    Object.assign(this, {render, accept, fail, delay, idle, version: 0, busy: false, pending: null, timer: null});
  }
  update(value) {
    this.pending = {value, version: ++this.version};
    if (!this.timer && !this.busy) this.timer = setTimeout(() => this.run(), this.delay);
  }
  cancel() {
    ++this.version;
    this.pending = null;
    clearTimeout(this.timer);
    this.timer = null;
  }
  async run() {
    this.timer = null;
    if (this.busy || !this.pending) return;
    const request = this.pending;
    this.pending = null;
    this.busy = true;
    try {
      const result = await this.render(request.value);
      // A completed older preview is useful while dragging, but not after cancellation.
      if (request.version === this.version || this.pending) {
        this.accept(result, request.value, request.version === this.version);
      }
    } catch (error) {
      if (request.version === this.version) this.fail(error, request.value);
    } finally {
      this.busy = false;
      if (this.pending) this.timer = setTimeout(() => this.run(), 0);
      else this.idle();
    }
  }
}
if (typeof module !== "undefined") module.exports = {LatestRenderQueue};
