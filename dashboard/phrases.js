// Every bass phrase follows the same four-bar harmony: A minor, F, D minor, E.
// Rhythm tuples are [sixteenth-note onset, held steps]; pitches are above A1.
const phrase = (rhythm, pitches) => pitches.map(bar => rhythm.map(([at, held], i) => [at, bar[i], held]));
export const BASS_MELODIES = [
  {id:"original", name:"Original", description:"The current climbing hook with a short falling answer.", bars:[
    [[0,0,5],[6,3,2],[8,7,3],[12,5,2],[14,3,2]],
    [[0,-4,5],[6,0,2],[8,3,3],[12,7,2],[14,3,2]],
    [[0,5,5],[6,3,2],[8,0,3],[12,-2,4]],
    [[0,-5,5],[6,-1,2],[8,2,3],[12,-1,2],[14,0,2]]]},
  {id:"low-tide", name:"Low tide", description:"Long low roots with a quiet answering note.", bars:phrase([[0,7],[8,7]],
    [[0,3],[-4,0],[5,0],[-5,-1]])},
  {id:"descent", name:"Descent", description:"A root, a small lift, then a descending line.", bars:phrase([[0,3],[4,3],[8,3],[12,4]],
    [[0,7,3,0],[-4,3,0,-4],[5,8,5,0],[-5,7,2,-1]])},
  {id:"slow-climb", name:"Slow climb", description:"Four measured notes rising through each chord.", bars:phrase([[0,3],[4,3],[8,3],[12,4]],
    [[0,3,7,12],[-4,0,3,8],[5,5,8,12],[-5,-1,2,7]])},
  {id:"heartbeat", name:"Heartbeat", description:"Paired root pulses with a melodic answer.", bars:phrase([[0,2],[2,3],[8,2],[10,3],[14,2]],
    [[0,0,3,7,3],[-4,-4,0,3,0],[5,5,0,8,5],[-5,-5,-1,2,0]])},
  {id:"broken-steps", name:"Broken steps", description:"Short offbeat steps around firm downbeats.", bars:phrase([[0,3],[6,2],[8,3],[14,2]],
    [[0,7,3,0],[-4,3,0,-4],[5,0,8,5],[-5,2,-1,0]])},
  {id:"wide-space", name:"Wide space", description:"A held root, a breath, and two late notes.", bars:phrase([[0,6],[10,2],[14,2]],
    [[0,7,3],[-4,3,0],[5,8,0],[-5,2,-1]])},
  {id:"question-answer", name:"Question and answer", description:"Two balanced halves with a different closing note.", bars:phrase([[0,3],[4,3],[8,3],[12,4]],
    [[0,3,0,7],[-4,0,-4,3],[5,8,5,0],[-5,-1,-5,0]])},
  {id:"undertow", name:"Undertow", description:"A low pedal note between moving chord tones.", bars:phrase([[0,2],[4,2],[6,2],[8,2],[12,2],[14,2]],
    [[0,7,0,3,0,7],[-4,3,-4,0,-4,3],[5,0,5,8,5,0],[-5,2,-5,-1,-5,0]])},
  {id:"homecoming", name:"Homecoming", description:"Long opening notes and a gentle return toward A.", bars:phrase([[0,5],[6,2],[8,5],[14,2]],
    [[0,3,7,0],[-4,0,3,0],[5,8,0,-2],[-5,-1,2,0]])}
];
export const BASS_MODES = {cycle:"Rotate all 10 · every 4 bars", hold:"Hold selected melody"};
// These describe the engine's three related variants for each configurable role.
export const PART_VARIANTS = {
  keys:["Bass-following melody", "Chord-tone answer in the second half", "Alternate chord-tone answer"],
  arpeggio:["Nearest chord tones", "First chord-tone sequence", "Second chord-tone sequence"],
  chords:["Three-note chord", "Root and upper tone", "Root and middle tone"],
  groove:["Base kick pattern", "Later kick answer and softer hat accent", "Extra kick steps and softer hat accent"],
  fill:["Two closing hits", "Soft first hit, stronger closing hit", "Three-hit closing fill"]
};
export const LIVE_ACTIONS = ["start","read","search","edit","command","test","other","repeat","return"];
export function actionInventory(config, actions, parts) {
  return LIVE_ACTIONS.map(id => {
    const rule = config.mappings[id];
    return {id, label:actions.find(([key])=>key===id)[1], role:parts[rule.part],
      enabled:rule.enabled && rule.level>0, mode:rule.variation || "subtle",
      count:rule.variation === "steady" ? 1 : rule.variation === "evolving" ? 3 : 2,
      variants:PART_VARIANTS[rule.part]};
  });
}
