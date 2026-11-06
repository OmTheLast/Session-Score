import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BASS_MELODIES, actionInventory, PART_VARIANTS, LIVE_ACTIONS} from './phrases.js';
import {preset, validateConfig, ACTIONS, PARTS} from './model.js';
import {DarkScore, DarkTrack} from './dark-track.js';

const phrase = (score,config) => Array.from({length:64},()=>score.next(config));
test('ten distinct bass melodies keep their harmony, grid, register and non-overlapping gates',()=>{
  assert.equal(BASS_MELODIES.length,10);
  assert.equal(new Set(BASS_MELODIES.map(p=>p.id)).size,10);
  const signatures=new Set();
  for(const melody of BASS_MELODIES){
    assert.equal(melody.bars.length,4);
    for(const [bar,notes] of melody.bars.entries()){
      assert.equal(notes[0][0],0);assert.equal(notes[0][1],[0,-4,5,-5][bar]);
      const scale=bar===3?[0,2,3,5,7,8,11]:[0,2,3,5,7,8,10];
      notes.forEach(([at,note,held],i)=>{
        assert.equal(at%2,0);assert.ok(at>=0 && at<16);
        assert.ok(note>=-5 && note<=12 && scale.includes((note%12+12)%12));
        assert.ok(held>0 && at+held<=(notes[i+1]?.[0]??16));
      });
    }
    const config=preset('electronic');Object.assign(config.engine,{bassMode:'hold',bassMelody:melody.id});
    const score=new DarkScore(), first=phrase(score,config);
    assert.deepEqual(phrase(score,config),first,'held phrase repeats exactly');
    signatures.add(JSON.stringify(first));
    assert.ok(first.flat().every(n=>n.bus==='bass'));
  }
  assert.equal(signatures.size,10);
});
test('rotation visits all ten in order and applies selection only at a four-bar boundary',()=>{
  const config=preset('electronic'),score=new DarkScore(),ids=[];
  for(let cycle=0;cycle<11;cycle++){phrase(score,config);ids.push(BASS_MELODIES[score.bassIndex].id);}
  assert.deepEqual(ids,[...BASS_MELODIES.map(p=>p.id),'original']);
  score.next(config);const current=score.bassIndex;
  Object.assign(config.engine,{bassMode:'hold',bassMelody:'undertow'});
  while(score.step%64){score.next(config);assert.equal(score.bassIndex,current);}
  score.next(config);assert.equal(BASS_MELODIES[score.bassIndex].id,'undertow');
  for(let i=0;i<200;i++)score.next(config);
  assert.equal(BASS_MELODIES[score.bassIndex].id,'undertow');
});
test('late scheduling skips bass cycles without replay and a new track starts with its selection',t=>{
  const config=preset('electronic');config.engine.bassMelody='heartbeat';
  const score=new DarkScore();score.next(config);score.step=3*64+5;score.next(config);
  assert.equal(BASS_MELODIES[score.bassIndex].id,'question-answer');
  const audio={context:{currentTime:0},hit(){},stop(){}};
  const track=new DarkTrack(audio,()=>config);t.after(()=>track.stop());
  assert.equal(track.bassStatus(),null);track.start();assert.equal(track.bassStatus().melody.id,'heartbeat');
  config.engine.bassMelody='wide-space';assert.equal(track.bassStatus().pending,true);
  track.stop();assert.equal(track.bassStatus(),null);track.start();assert.equal(track.bassStatus().melody.id,'wide-space');
});
test('action keys follow the currently selected bass and all layers remain in key',()=>{
  for(const melody of BASS_MELODIES){
    const config=preset('electronic');Object.assign(config.engine,{bassMode:'hold',bassMelody:melody.id});
    Object.assign(config.mappings.read,{variation:'steady',bars:4});
    const score=new DarkScore();score.event('read','A',config);score.event('search','B',config);score.event('edit','C',config);
    for(let step=0;step<64;step++){
      const notes=score.next(config),bar=Math.floor(step/16),position=step%16;
      const bassPitch=melody.bars[bar].filter(([at])=>at<=position).at(-1)[1];
      const scale=bar===3?[0,2,3,5,7,8,11]:[0,2,3,5,7,8,10];
      for(const note of notes){
        assert.ok(scale.includes((note.note%12+12)%12));
        if(note.bus==='keys')assert.equal(note.note,bassPitch+config.mappings.read.note);
      }
    }
  }
});
test('bass settings migrate, round-trip, and reject invalid selections',()=>{
  const config=preset('electronic');Object.assign(config.engine,{bassMode:'hold',bassMelody:'descent'});
  assert.deepEqual(validateConfig(JSON.parse(JSON.stringify(config))),config);
  delete config.engine.bassMode;delete config.engine.bassMelody;
  const migrated=validateConfig(config);assert.equal(migrated.engine.bassMode,'cycle');assert.equal(migrated.engine.bassMelody,'original');
  config.engine.bassMelody='missing';assert.throws(()=>validateConfig(config),/bass melody/);
  config.engine.bassMelody='original';config.engine.bassMode='shuffle';assert.throws(()=>validateConfig(config),/bass mode/);
});
test('one action inventory reflects current roles, enabled states and variation modes',()=>{
  const config=preset('electronic');
  Object.assign(config.mappings.read,{part:'chords',variation:'evolving'});
  Object.assign(config.mappings.search,{variation:'steady',level:0});
  const inventory=actionInventory(config,ACTIONS,PARTS);
  assert.deepEqual(inventory.map(p=>p.id),LIVE_ACTIONS);
  assert.equal(inventory.length,9);
  const read=inventory.find(p=>p.id==='read');assert.equal(read.role,PARTS.chords);assert.equal(read.count,3);assert.deepEqual(read.variants,PART_VARIANTS.chords);
  const search=inventory.find(p=>p.id==='search');assert.equal(search.count,1);assert.equal(search.enabled,false);
  assert.equal(inventory.find(p=>p.id==='return').enabled,false);
});
