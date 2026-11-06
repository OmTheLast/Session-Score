// An open socket is not evidence of work. A recent authoritative state is required.
export class LiveSession {
  constructor({audio, track, onState = () => {}, now = Date.now}) {
    Object.assign(this, {audio, track, onState, now});
    this.connected = false; this.state = "unknown"; this.lastSeen = 0;
  }
  connect(session) { this.disconnect(); this.session = session; this.connected = true; }
  receive(snapshot) {
    if (!this.connected || snapshot.session !== this.session) return false;
    if (Number.isFinite(snapshot.observedAt) && this.now() - snapshot.observedAt >= 2000) {
      this.interrupted(); return false;
    }
    this.lastSeen = this.now();
    this.state = snapshot.state;
    this.activeSessions = new Set(snapshot.activeSessions || (snapshot.state === "working" ? [this.session] : []));
    this.uncertainCount = snapshot.uncertainCount || 0;
    this.sync(snapshot.reason);
    return true;
  }
  sync(reason = "") {
    const audible = this.connected && this.state === "working" && this.audio.context?.state === "running";
    if (audible) this.track.start();
    else { this.track.stop(); this.audio.stop(); }
    this.onState({state: this.state, audible, reason, activeCount: this.activeSessions?.size || 0, uncertainCount: this.uncertainCount || 0,
      audioBlocked: this.connected && this.state === "working" && !audible});
  }
  action(event) {
    return this.connected && this.state === "working" && (this.session === "all" ? this.activeSessions?.has(event.session) : event.session === this.session) && this.now() - this.lastSeen < 2000
      && (!Number.isFinite(event.ts) || this.now() - event.ts < 2000);
  }
  check() {
    if (this.connected && this.now() - this.lastSeen >= 2000) this.interrupted();
  }
  interrupted() { this.state = "unknown"; this.sync("Live connection interrupted; sound paused."); }
  disconnect() {
    this.connected = false; this.state = "unknown"; this.session = null; this.activeSessions = new Set(); this.uncertainCount = 0;
    this.track.stop(); this.audio.stop();
  }
}
