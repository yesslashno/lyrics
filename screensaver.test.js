import test from 'node:test';
import assert from 'node:assert/strict';
import {createIdleClock,IDLE_MS} from './screensaver.js';
test('idle starts after twenty minutes and activity resets the full interval',()=>{
 let now=0;const clock=createIdleClock(()=>now);
 now=IDLE_MS-1;assert.equal(clock.idle(),false);
 now=IDLE_MS;assert.equal(clock.idle(),true);
 clock.activity();assert.equal(clock.idle(),false);
 now+=IDLE_MS-1;assert.equal(clock.idle(),false);
 now++;assert.equal(clock.idle(),true);
});
test('fresh playback keeps idle clock awake; background wall time counts',()=>{
 let now=0;const clock=createIdleClock(()=>now);
 for(let i=0;i<60;i++){now+=5000;clock.activity();}
 now+=IDLE_MS-1;assert.equal(clock.idle(),false);
 now+=60*60*1000;assert.equal(clock.idle(),true);
});
