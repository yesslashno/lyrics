import {test} from 'node:test';import assert from 'node:assert/strict';import {handleRelay} from './publish-relay.js';
const base='https://relay.test/api/lrclib/';
const req=(path,body={},origin='https://yesslashno.github.io',extra={})=>new Request(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
test('relay forwards only LRCLIB publishing operations and no Spotify credentials',async()=>{
 let count=0;const request=req('request-challenge',{},undefined,{Authorization:'Bearer do-not-forward'});
 const response=await handleRelay(request,async(url,options)=>{count++;assert.equal(url,'https://lrclib.net/api/request-challenge');assert.equal(options.headers.Authorization,undefined);return Response.json({prefix:'test',target:'f'.repeat(64)});});
 assert.equal(response.status,200);assert.equal(count,1);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://yesslashno.github.io');
});
test('relay supports browser publish header and rejects unwanted origin and operation',async()=>{
 const response=await handleRelay(new Request(base+'publish',{method:'OPTIONS',headers:{Origin:'https://yesslashno.github.io'}}));assert.equal(response.status,204);assert.match(response.headers.get('Access-Control-Allow-Headers'),/X-Publish-Token/);
 let calls=0;const upstream=async()=>{calls++;};assert.equal((await handleRelay(req('publish',{},'https://unwanted.test'),upstream)).status,403);assert.equal((await handleRelay(req('unknown'),upstream)).status,404);assert.equal((await handleRelay(req('publish'),upstream)).status,400);assert.equal(calls,0);
});
test('valid contribution and proof token pass through with service errors preserved',async()=>{
 const payload={trackName:'Song',artistName:'Artist',albumName:'Album',duration:123,plainLyrics:'Original words',syncedLyrics:''};
 const response=await handleRelay(req('publish',payload,undefined,{'X-Publish-Token':'prefix:123'}),async(url,options)=>{assert.equal(url,'https://lrclib.net/api/publish');assert.equal(options.headers['X-Publish-Token'],'prefix:123');assert.deepEqual(JSON.parse(options.body),payload);return new Response('{}',{status:429,headers:{'Retry-After':'60'}});});
 assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
});
