import test from 'node:test';import assert from 'node:assert/strict';import {Spotify,CONTROL_SCOPES} from './spotify.js';import {controlAvailability} from './spotify-controls.js';
function store(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
function client(request,scope=CONTROL_SCOPES,expired=false){const s=store();s.setItem('companion.spotify.tokens',JSON.stringify({scope,access_token:'access',refresh_token:'refresh',expires_at:Date.now()+(expired?-1000:3600000)}));return new Spotify(s,store(),request);}
test('player controls target explicit device with correct methods and bounded volume',async()=>{
 const calls=[];const c=client(async(url,options)=>{calls.push({url,options});return new Response(null,{status:204});});
 for(const action of ['play','pause','next','previous'])await c.control(action,'echo id');
 assert.deepEqual(calls.map(x=>x.options.method),['PUT','PUT','POST','POST']);assert.ok(calls.every(x=>new URL(x.url).searchParams.get('device_id')==='echo id'));
 await c.control('transfer','kitchen',false);assert.deepEqual(JSON.parse(calls.at(-1).options.body),{device_ids:['kitchen'],play:false});
 await c.control('volume','kitchen',42);assert.equal(new URL(calls.at(-1).url).searchParams.get('volume_percent'),'42');
 const count=calls.length;for(const value of [-1,101,1.5,NaN])await assert.rejects(c.control('volume','kitchen',value));await assert.rejects(c.control('play',''));await assert.rejects(c.control('bad','speaker'));assert.equal(calls.length,count);
});
test('read-only accounts keep Now Playing and cannot issue commands without approving scopes',async()=>{
 const calls=[];const c=client(async(url)=>{calls.push(url);return new Response(null,{status:204});},'user-read-currently-playing');assert.equal(await c.nowPlaying(),null);assert.ok(calls[0].endsWith('/currently-playing'));await assert.rejects(c.control('play','echo'));assert.equal(calls.length,1);
 const full=client(async(url)=>{assert.ok(url.endsWith('/me/player'));return Response.json({device:{id:'echo',supports_volume:true,volume_percent:50}});});assert.equal((await full.nowPlaying()).device.volume_percent,50);
});
test('device capabilities and stale playback disable unsupported controls',()=>{
 const data={device:{id:'echo',supports_volume:true,volume_percent:30},actions:{disallows:{skipping_prev:true}},is_playing:true};assert.equal(controlAvailability(data).volume,true);assert.equal(controlAvailability(data).previous,false);assert.equal(controlAvailability(data,false).ready,false);assert.equal(controlAvailability({...data,device:{...data.device,is_restricted:true}}).ready,false);assert.equal(controlAvailability({...data,device:{...data.device,supports_volume:false}}).volume,false);
});
test('command refresh preserves scopes; account change during refresh sends no command',async()=>{
 let finish,commands=0;const c=client((url)=>url.includes('/api/token')?new Promise(resolve=>{finish=resolve;}):(commands++,Promise.resolve(new Response(null,{status:204}))),CONTROL_SCOPES,true);
 const pending=c.control('next','echo');c.disconnect();finish(Response.json({access_token:'late',expires_in:3600}));await assert.rejects(pending);assert.equal(commands,0);
 const valid=client(async url=>url.includes('/api/token')?Response.json({access_token:'new',expires_in:3600}):new Response(null,{status:204}),CONTROL_SCOPES,true);await valid.control('pause','echo');assert.equal(valid.canControl(),true);
});
test('rate limits prevent repeated commands; errors preserve the saved account',async()=>{
 let calls=0;const c=client(async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'90'}});});await assert.rejects(c.control('next','echo'),e=>e.retryMs===90000);await assert.rejects(c.control('next','echo'));assert.equal(calls,1);assert.equal(c.tokens().refresh_token,'refresh');
 for(const status of [403,404,500]){const c=client(async()=>new Response(null,{status}));await assert.rejects(c.control('pause','echo'));assert.ok(c.tokens());}
});
test('uncertain network failures do not automatically retry next/previous commands',async()=>{let count=0;const c=client(async()=>{count++;throw new TypeError('network');});await assert.rejects(c.control('next','echo'));assert.equal(count,1);});
