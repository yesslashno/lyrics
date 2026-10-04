import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import {createHash} from 'node:crypto';import {publishLyrics,publishPayload} from './publish.js';
const track={name:'Song',artists:[{name:'Artist'}],album:{name:'Album'},duration_ms:123000};
test('worker SHA256 matches trusted implementation for short, long and unicode inputs',()=>{
 const context={TextEncoder};vm.createContext(context);vm.runInContext(readFileSync(new URL('./sha256.js',import.meta.url),'utf8'),context);
 for(const text of ['', 'abc','prefix00000','üñî🎵','x'.repeat(200)])assert.equal(context.sha256(text),createHash('sha256').update(text).digest('hex'));
});
test('publishes exact recording metadata and token with no Spotify credentials',async()=>{
 const calls=[];await publishLyrics(track,{plainLyrics:'Hello',syncedLyrics:''},{solve:async challenge=>{assert.equal(challenge.prefix,'prefix');return 'prefix:123';},request:async(url,options)=>{calls.push({url,options});return url.endsWith('request-challenge')?Response.json({prefix:'prefix',target:'f'.repeat(64)}):new Response(null,{status:201});}});
 assert.equal(calls.length,2);assert.deepEqual(JSON.parse(calls[1].options.body),{trackName:'Song',artistName:'Artist',albumName:'Album',duration:123,plainLyrics:'Hello',syncedLyrics:''});
 assert.equal(calls[1].options.headers['X-Publish-Token'],'prefix:123');assert.equal(calls[1].options.headers.Authorization,undefined);
});
test('failed publishing retains error and cancellation never sends lyrics',async()=>{
 await assert.rejects(publishLyrics(track,{plainLyrics:'Hello'},{solve:async()=> 'p:1',request:async url=>url.endsWith('request-challenge')?Response.json({prefix:'p',target:'f'.repeat(64)}):new Response(null,{status:429})}),/busy/);
 const controller=new AbortController();let calls=0;
 await assert.rejects(publishLyrics(track,{plainLyrics:'Hello'},{signal:controller.signal,solve:async()=>{controller.abort();return 'p:1';},request:async()=>{calls++;return Response.json({prefix:'p',target:'f'.repeat(64)});}}),/cancelled/);assert.equal(calls,1);
 assert.throws(()=>publishPayload(track,{}),/Paste/);assert.throws(()=>publishPayload({...track,album:null},{plainLyrics:'Hello'}),/details/);
});
test('classic browser worker solves and rejects challenges without module-worker support',()=>{
 const messages=[];const context={TextEncoder,Date,postMessage:value=>messages.push(value)};vm.createContext(context);
 context.importScripts=()=>vm.runInContext(readFileSync(new URL('./sha256.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('./publish-worker.js',import.meta.url),'utf8'),context);
 context.onmessage({data:{prefix:'example',target:'f'.repeat(64)}});assert.equal(messages[0].nonce,'0');assert.ok(createHash('sha256').update('example0').digest('hex')<='f'.repeat(64));
 context.onmessage({data:{prefix:'example',target:'bad'}});assert.match(messages[1].error,/Invalid/);
});
