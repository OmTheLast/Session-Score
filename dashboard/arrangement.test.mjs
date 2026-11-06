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
  assert.equal([...score.parts.values()].find(p=>p.action==="edit").nextVariant,1);
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


test("off-grid activity waits for the bar and uses shared even subdivisions",()=>{
  const config=preset("electronic"),score=new DarkScore();
  for(let i=0;i<5;i++)score.next(config);
  for(const action of ["read","search","edit","command"])score.event(action,"A",config);
  assert.ok(score.summary(config).every(p=>p.waiting));
  for(let step=5;step<16;step++)assert.ok(score.next(config).every(n=>n.bus==="bass"));
  const first=score.next(config);
  assert.ok(first.some(n=>n.bus==="chords"));
  for(let step=17;step<32;step++) {
    const notes=score.next(config);
    if(step%2)assert.equal(notes.length,0,"No late-sixteenth accents");
  }
});
test("renewal smooths intensity and repeat variations wait for the next bar",()=>{
  const config=preset("electronic"),score=new DarkScore();
  config.mappings.read.bars=1;score.event("read","A",config);
  for(let i=0;i<13;i++)score.next(config);
  const part=score.parts.get("A:read"),gain=part.gain;
  score.event("read","A",config);score.event("repeat","A",config);
  assert.equal(part.variant,0);
  const renewed=score.parts.get("A:read");
  score.next(config);assert.ok(renewed.gain-gain <= .150001);
  while(score.step<16)score.next(config);
  assert.equal(renewed.variant,0);
  score.next(config);assert.equal(renewed.variant,1);
});
test("late callbacks preserve the musical grid; tempo changes on the next bar",t=>{
  const config=preset("electronic"),calls=[];
  const audio={context:{currentTime:1},hit(...args){calls.push(args);},stop(){}};
  const track=new DarkTrack(audio,()=>config);t.after(()=>track.stop());track.start();
  for(let tick=1;tick<180;tick++) {
    audio.context.currentTime=1+tick*.025;
    if(tick===24)config.bpm=90;
    // Deliberately miss callbacks; every actual note must remain on the original grid.
    if(tick>10 && tick<19 || tick>70 && tick<80)continue;
    track.schedule();
  }
  assert.ok(calls.length>5);
  for(const call of calls) {
    const at=call[3], beat=at<3.06-1e-8 ? .125 : 60/90/4;
    const origin=at<3.06-1e-8 ? 1.06 : 3.06;
    assert.ok(Math.abs((at-origin)/beat-Math.round((at-origin)/beat))<1e-7,`off grid: ${at}`);
  }
});
test("tonal envelopes ramp in and out while preserving the scheduled onset",()=>{
  const engine=new AudioEngine(),automation=[],starts=[],stops=[];
  const param={value:0,setValueAtTime(v,t){automation.push(["set",v,t]);},linearRampToValueAtTime(v,t){automation.push(["ramp",v,t]);}};
  engine.context={createBufferSource(){return{playbackRate:{value:1},connect(n){return n;},start(t){starts.push(t);},stop(t){stops.push(t);}};},
    createGain(){return{gain:param,connect(){},disconnect(){}};}};
  engine.buffer=()=>({});engine.master={};
  engine.hit("strings",0,50,10,1,2,"chords",{attack:.25,release:.5});
  assert.deepEqual(starts,[10]);assert.deepEqual(stops,[12.01]);
  assert.deepEqual(automation,[["set",0,10],["ramp",.325,10.25],["set",.325,11.5],["ramp",0,12]]);
});

test("completion cancels future notes and fades sounding notes without extending their gate",()=>{
  const audio=new AudioEngine(), gains=[],sources=[];
  audio.context={currentTime:10,createGain(){const calls=[];const node={gain:{value:1,setValueAtTime(...v){calls.push(["set",...v]);},linearRampToValueAtTime(...v){calls.push(["ramp",...v]);}},connect(){},disconnect(){},calls};gains.push(node);return node;},
    createBufferSource(){const source={playbackRate:{value:1},connect(){},disconnect(){},start(){},stops:[],stop(t){this.stops.push(t);}};sources.push(source);return source;}};
  audio.buffer=()=>({});audio.master={};
  audio.hit("strings",0,50,9,1,5);audio.hit("bass",0,50,9.8,1,.4);audio.hit("piano",0,50,10.1,1,2);
  const original=gains[0].calls.slice();audio.release(.8);
  assert.deepEqual(gains[0].calls,original,"original attack and release stay intact");
  assert.deepEqual(gains[1].calls,[["set",1,10],["ramp",0,10.8]]);
  assert.equal(sources[0].stops.at(-1),10.8);
  assert.ok(Math.abs(sources[1].stops.at(-1)-10.21)<1e-9);
  assert.equal(sources[2].stops.at(-1),undefined,"future note cancelled immediately");
  assert.equal(audio.sources.has(sources[2]),false);
});

test("each action has related audible variants, while steady remains unchanged",()=>{
  for(const action of ["read","search","edit","command","test","other","repeat"]) {
    for(const [variation,expected] of [["steady",1],["subtle",2],["evolving",3]]) {
      const config=preset("electronic"),score=new DarkScore(),phrases=new Set();
      config.engine.intensity=0;config.engine.bassMode="hold";Object.assign(config.mappings[action],{variation,bars:1});
      for(let pass=0;pass<3;pass++) {
        score.event(action,"A",config);const notes=[];
        for(let i=0;i<16;i++)for(const n of score.next(config).filter(n=>n.bus!=="bass"))notes.push([i,n.note,n.level,n.steps,n.sound]);
        phrases.add(JSON.stringify(notes));
        while(score.step%64)score.next(config); // Same harmonic bar for each comparison.
      }
      assert.equal(phrases.size,expected,`${action} ${variation}`);
    }
  }
});

test("variation stays fixed within a bar and bursts queue only one change",()=>{
  const config=preset("electronic"),score=new DarkScore();config.mappings.read.variation="evolving";
  score.event("read","A",config);score.next(config);
  for(let i=0;i<50;i++)score.event("read","A",config);
  assert.equal(score.parts.get("A:read").nextVariant,1);
  while(score.step<16){score.next(config);assert.equal(score.parts.get("A:read").variant,0);}
  score.next(config);assert.equal(score.parts.get("A:read").variant,1);
  config.mappings.read.variation="steady";
  while(score.step<32)score.next(config);
  score.next(config);assert.equal(score.parts.get("A:read").variant,0);
  score.retainSessions(new Set());assert.equal(score.variants.size,0);
});

test("variation settings round-trip and older version-two files gain subtle defaults",()=>{
  const config=preset("electronic");config.mappings.read.variation="evolving";config.mappings.edit.variation="steady";
  assert.deepEqual(validateConfig(JSON.parse(JSON.stringify(config))),config);
  delete config.mappings.read.variation;assert.equal(validateConfig(config).mappings.read.variation,"subtle");
  config.mappings.read.variation="random";assert.throws(()=>validateConfig(config),/variation/);
});
