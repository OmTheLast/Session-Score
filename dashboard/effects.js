// Space and movement for the mix: a reverb, a dotted-eighth delay, a low-pass filter
// that follows activity, and a duck on every kick (sidechain). It sits between the
// notes and AudioEngine's master, so volume, the compressor, fades and stop still
// cover everything, and audio.js is unchanged.

// Which input a note goes to. Drums stay dry and are not ducked. The bass is ducked
// by the kick but stays dry so the low end is clear. Keys, synth and chords are
// ducked and feed the filter, the delay and the reverb.
export function routeFor(sound, bus) {
  if (bus === "drums" || ["kick", "snare", "clap", "hat", "openhat", "rim"].includes(sound)) return "drums";
  if (bus === "bass" || sound === "bass" || sound === "sub") return "low";
  return "wet";
}

// The filter opens as work gets busier (actions in the last 30 seconds) and rings
// more when actions repeat, so a session stuck in a loop sounds tense.
export const ACTIVITY_MS = 30_000;
export function filterTarget({recent = 0, repeats = 0} = {}) {
  const busy = Math.min(1, Math.max(0, recent) / 25);
  const tension = Math.min(1, Math.max(0, repeats) / 6);
  return {cutoff: Math.round(900 * 10 ** busy), q: Math.round((.7 + tension * 8.3) * 100) / 100};
}

// A dotted eighth note in seconds: the tempo-synced delay.
export const delaySeconds = bpm => 60 / bpm * .75;

// Call once after audio.ready(). Returns {action(name), steer(bpm), state()}.
export function addEffects(audio, {now = Date.now} = {}) {
  const ctx = audio.context, master = audio.master;
  const drums = ctx.createGain(), duck = ctx.createGain(), low = ctx.createGain(), wet = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = 900; filter.Q.value = .7;
  const delay = ctx.createDelay(2), feedback = ctx.createGain(), damp = ctx.createBiquadFilter(), delaySend = ctx.createGain();
  feedback.gain.value = .38; damp.type = "lowpass"; damp.frequency.value = 2500; delaySend.gain.value = .25;
  const reverb = ctx.createConvolver(), reverbSend = ctx.createGain();
  reverbSend.gain.value = .22;
  // A 2.8 second decaying-noise room, different in each ear for width.
  const length = Math.floor(ctx.sampleRate * 2.8), room = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 20261123;
  for (let channel = 0; channel < 2; channel++) {
    const data = room.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      data[i] = (seed / 4294967296 * 2 - 1) * Math.exp(-3.2 * i / length) * (i < 400 ? i / 400 : 1);
    }
  }
  reverb.buffer = room;
  drums.connect(master);
  duck.connect(master);
  low.connect(duck);
  wet.connect(filter); filter.connect(duck);
  filter.connect(delaySend); delaySend.connect(delay); delay.connect(damp); damp.connect(feedback); feedback.connect(delay); delay.connect(duck);
  filter.connect(reverbSend); reverbSend.connect(reverb); reverb.connect(duck);
  const inputs = {drums, low, wet};
  let ducks = 0;
  // hit() connects each note to audio.master. Point that at the right input for the
  // length of the call, then duck the rest of the mix under each kick.
  const hit = audio.hit.bind(audio);
  audio.hit = (sound, note, level, when, speed, gate, bus, envelope) => {
    audio.master = inputs[routeFor(sound, bus)];
    try { hit(sound, note, level, when, speed, gate, bus, envelope); } finally { audio.master = master; }
    if (sound === "kick" && level > 0) {
      duck.gain.setValueAtTime(1, when);
      duck.gain.linearRampToValueAtTime(.45, when + .012);
      duck.gain.linearRampToValueAtTime(1, when + .19);
      ducks++;
    }
  };
  const recent = [], repeats = [];
  const trim = list => { while (list.length && now() - list[0] > ACTIVITY_MS) list.shift(); };
  return {
    action(name) { recent.push(now()); if (name === "repeat") repeats.push(now()); },
    steer(bpm) {
      trim(recent); trim(repeats);
      const {cutoff, q} = filterTarget({recent: recent.length, repeats: repeats.length});
      const at = ctx.currentTime;
      filter.frequency.setTargetAtTime(cutoff, at, 1.5);
      filter.Q.setTargetAtTime(q, at, 1.5);
      delay.delayTime.setTargetAtTime(delaySeconds(bpm), at, .05);
    },
    state: () => ({cutoff: Math.round(filter.frequency.value), q: filter.Q.value, delay: delay.delayTime.value, ducks})
  };
}
