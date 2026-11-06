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
    this.endReason = snapshot.endReason;
    this.activeSessions = new Set(snapshot.activeSessions || (snapshot.state === "working" ? [this.session] : []));
    this.uncertainCount = snapshot.uncertainCount || 0;
    this.sync(snapshot.reason);
    return true;
  }
  sync(reason = "") {
    const audible = this.connected && this.state === "working" && this.audio.context?.state === "running";
    if (audible) {
      if (this.releaseUntil) this.audio.stop();
      this.releaseUntil = 0;
      this.track.start();
    } else {
      this.track.stop();
      const normalEnd = this.connected && this.state === "idle" && this.endReason === "completed";
      if (normalEnd && this.wasAudible && this.audio.release) {
        this.audio.release(.8);
        this.releaseUntil = this.now() + 800;
      } else if (!normalEnd || !this.releaseUntil || this.now() >= this.releaseUntil) {
        this.audio.stop(); this.releaseUntil = 0;
      }
    }
    this.wasAudible = audible;
    this.onState({releasing: this.releaseUntil > this.now(), state: this.state, audible, reason, activeCount: this.activeSessions?.size || 0, uncertainCount: this.uncertainCount || 0,
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
    this.releaseUntil = 0; this.wasAudible = false; this.endReason = null;
    this.track.stop(); this.audio.stop();
  }
}
