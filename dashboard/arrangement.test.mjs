import {test} from "node:test";
import assert from "node:assert/strict";
import {DarkScore, DarkTrack} from "./dark-track.js";
import {preset, validateConfig, Classifier} from "./model.js";
import {AudioEngine} from "./audio.js";

const bars = (score,config,count=2) => Array.from({length:count*16},()=>score.next(config)).flat();
test("real actions create distinct sustained musical parts and expire without fresh work",()=>{
  const config=preset("electronic"), signatures=new Set();
  for(const action of ["read","search","edit","command","test"]) {
    const score=new DarkScore();score.event(action,"A",config);
    const notes=bars(score,config).filter(n=>n.bus!=="bass");
    assert.ok(notes.length>=4,action);
    signatures.add(JSON.stringify(notes.map(n=>[n.sound,n.note,n.steps,n.bus])));
    assert.ok(notes.every(n=>Number.isFinite(n.level) && n.level>0 && n.steps>0));
    bars(score,config,4);
    assert.ok(bars(score,config,1).every(n=>n.bus==="bass"));
  }
  assert.equal(signatures.size,5);
  const command=new DarkScore();command.event("command","A",config);
  const notes=bars(command,config);
  assert.ok(notes.some(n=>n.bus==="synth"));
  assert.ok(notes.some(n=>n.bus==="drums"));
});
test("session contributions persist independently, mute works, and repeat varies the source part",()=>{
  const config=preset("electronic"),score=new DarkScore();
  score.event("read","A",config);score.event("edit","B",config);
  score.retainSessions(new Set(["B"]));
  assert.deepEqual([...score.parts.values()].map(p=>p.session),["B"]);
  score.event("repeat","B",config);
  assert.equal([...score.parts.values()].find(p=>p.action==="edit").variant,1);
  config.mappings.edit.enabled=false;
  assert.ok(!bars(score,config).some(n=>n.bus==="chords"));
  config.engine.mix.bass=0;config.engine.mix.drums=0;
  assert.equal(bars(score,config).length,0);
});
test("busy overlapping sessions keep voices bounded and notes harmonically aligned",()=>{
  const config=preset("electronic"), score=new DarkScore();
  for(let i=0;i<300;i++) for(const action of ["read","search","edit","command","test","repeat"]) score.event(action,String(i),config);
  assert.ok(score.parts.size<=128);
  for(let step=0;step<64;step++) {
    const notes=score.next(config);assert.ok(notes.length<=12);
    const scale=Math.floor(step/16)===3 ? [0,2,3,5,7,8,11] : [0,2,3,5,7,8,10];
    for(const n of notes.filter(n=>["keys","synth","chords"].includes(n.bus))) assert.ok(scale.includes((n.note%12+12)%12));
  }
});
test("intensity builds over beats rather than from same-tick event spam",()=>{
  const config=preset("electronic"),score=new DarkScore();
  score.event("command","A",config);
  for(let i=0;i<100;i++)score.event("command","A",config);
  assert.equal([...score.parts.values()][0].energy,1);
  for(let i=0;i<4;i++)score.next(config);
  score.event("command","A",config);
  assert.equal([...score.parts.values()][0].energy,2);
  for(let i=0;i<4;i++)score.next(config);
  score.event("command","A",config);
  assert.equal([...score.parts.values()][0].energy,3);
});
test("legacy default mappings upgrade while customized settings survive",()=>{
  const old=preset("electronic");old.version=1;delete old.engine;delete old.mappings.test;
  // Defaults from the previously shipped version.
  Object.assign(old.mappings.read,{sound:"hat",pattern:"double",level:35,note:0,enabled:true});
  Object.assign(old.mappings.edit,{sound:"sub",pattern:"double",level:75,note:0,enabled:true});
  old.mappings.search.sound="piano";old.mappings.search.level=21;old.mappings.command.enabled=false;
  const migrated=validateConfig(old);
  assert.equal(migrated.version,2);
  assert.equal(migrated.mappings.read.sound,"piano");
  assert.equal(migrated.mappings.edit.sound,"strings");
  assert.equal(migrated.mappings.search.sound,"piano");
  assert.equal(migrated.mappings.search.level,21);
  assert.equal(migrated.mappings.command.enabled,false);
  assert.ok(migrated.mappings.test);
  migrated.engine.mix.keys=101;assert.throws(()=>validateConfig(migrated));
});
test("named tests are distinct but shell wrappers are not guessed to be tests",()=>{
  const classifier=new Classifier();
  assert.equal(classifier.classify({kind:"tool",status:"waiting",tool:"run_tests"}),"test");
  assert.equal(classifier.classify({kind:"tool",status:"waiting",tool:"exec"}),"command");
});
test("track stop clears musical memory and audio gate cancels every queued source",t=>{
  const audio={context:{currentTime:1},hit(){}};
  const track=new DarkTrack(audio,()=>preset("electronic"));
  t.after(()=>track.stop());
  track.start();track.event("edit","A");track.score.next(preset("electronic"));assert.ok(track.summary().length>0);
  track.stop();assert.deepEqual(track.summary(),[]);
  assert.equal(track.timer,null);
  const engine=new AudioEngine();let stopped=0;
  engine.sources.add({scoreBus:"keys",stop(){stopped++;}});
  engine.sources.add({scoreBus:"bass",stop(){stopped++;}});
  engine.stopBus("keys");assert.equal(stopped,1);assert.equal(engine.sources.size,1);
  engine.stop();assert.equal(stopped,2);assert.equal(engine.sources.size,0);
});
