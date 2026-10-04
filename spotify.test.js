import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Spotify,challenge,position,formatTime} from './spotify.js';
const store=()=>{const map=new Map(); return {getItem:k=>map.get(k) ?? null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const key='companion.spotify.tokens';
test('default fetch is called with its native global receiver',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=function(){assert.equal(this,globalThis);return Promise.resolve(new Response(null,{status:204}));};
  try {const storage=store();storage.setItem(key,JSON.stringify({access_token:'token',expires_at:Date.now()+3600000}));const client=new Spotify(storage,store());assert.equal(await client.nowPlaying(),null);} finally {globalThis.fetch=original;}
});
function setup(request,expired=false) {const storage=store(); storage.setItem(key,JSON.stringify({access_token:'old',refresh_token:'refresh',expires_at:Date.now()+(expired?-1000:3600000)}));return new Spotify(storage,store(),request);}
test('PKCE uses the RFC 7636 S256 example',async()=>{assert.equal(await challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');});
test('callback rejects wrong state without exchanging code',async()=>{let calls=0;const client=setup(async()=>{calls++;});client.session.setItem('companion.pkce',JSON.stringify({state:'expected',verifier:'abc',created:Date.now()}));await assert.rejects(client.callback(new URLSearchParams('code=x&state=wrong')),/verified/);assert.equal(calls,0);});
test('valid callback exchanges PKCE code without a secret',async()=>{const client=new Spotify(store(),store(),async(url,options)=>{assert.equal(options.body.get('code_verifier'),'verifier');assert.equal(options.body.has('client_secret'),false);return Response.json({access_token:'new',refresh_token:'refresh',expires_in:3600});});client.session.setItem('companion.pkce',JSON.stringify({state:'valid',verifier:'verifier',created:Date.now()}));await client.callback(new URLSearchParams('code=code&state=valid'));assert.equal(client.tokens().access_token,'new');assert.equal(client.session.getItem('companion.pkce'),null);});
test('expired token refreshes and retains refresh token',async()=>{let calls=0;const client=setup(async(url,options)=>{calls++;if(url.includes('/api/token')){assert.equal(options.body.get('grant_type'),'refresh_token');return Response.json({access_token:'new',expires_in:3600});}assert.equal(options.headers.Authorization,'Bearer new');return new Response(null,{status:204});},true);assert.equal(await client.nowPlaying(),null);assert.equal(client.tokens().refresh_token,'refresh');assert.equal(calls,2);});
test('401 refreshes once then returns new track',async()=>{let calls=0;const client=setup(async url=>{calls++;if(url.includes('/api/token'))return Response.json({access_token:'new',expires_in:3600});return calls===1?new Response(null,{status:401}):Response.json({item:{name:'Next song'}});});assert.equal((await client.nowPlaying()).item.name,'Next song');assert.equal(calls,3);});
test('rate limiting respects Spotify retry delay',async()=>{const client=setup(async()=>new Response(null,{status:429,headers:{'Retry-After':'120'}}));await assert.rejects(client.nowPlaying(),error=>error.status===429 && error.retryMs===120000);});
test('invalid refresh clears the saved session',async()=>{const client=setup(async()=>Response.json({error:'invalid_grant'},{status:400}),true);await assert.rejects(client.nowPlaying());assert.equal(client.tokens(),null);});
test('playback clock follows playing, pauses, duration and stale responses',()=>{const data={progress_ms:1000,is_playing:true,item:{duration_ms:10000}};assert.equal(position(data,0,2000),3000);assert.equal(position({...data,is_playing:false},0,2000),1000);assert.equal(position(data,0,20000),7000);assert.equal(position({...data,progress_ms:9000},0,2000),10000);assert.equal(formatTime(65000),'1:05');});
test('older Safari without AbortSignal.timeout can sign in and fetch playback',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(AbortSignal,'timeout');
  Object.defineProperty(AbortSignal,'timeout',{value:undefined,configurable:true});
  try {
    const client=new Spotify(store(),store(),async(url,options)=>{
      assert.ok(options.signal instanceof AbortSignal);
      if(url.includes('/api/token')) return Response.json({access_token:'ipad',refresh_token:'refresh',expires_in:3600});
      return Response.json({item:{name:'iPad song'}});
    });
    client.session.setItem('companion.pkce',JSON.stringify({state:'valid',verifier:'verifier',created:Date.now()}));
    await client.callback(new URLSearchParams('code=code&state=valid'));
    assert.equal((await client.nowPlaying()).item.name,'iPad song');
  } finally {Object.defineProperty(AbortSignal,'timeout',descriptor);}
});
test('compatible request timeout aborts a hung request',async()=>{
  const client=new Spotify(store(),store(),(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))));
  await assert.rejects(client.timedRequest('test',{},5),/aborted/);
});
test('logout removes tokens and PKCE and pending refresh cannot restore them',async()=>{
  let finish;const client=setup(()=>new Promise(resolve=>{finish=resolve;}),true);
  client.session.setItem('companion.pkce','pending');
  const pending=client.refresh();client.disconnect();
  assert.equal(client.tokens(),null);assert.equal(client.session.getItem('companion.pkce'),null);
  finish(Response.json({access_token:'late',expires_in:3600}));
  await assert.rejects(pending,/Signed out/);assert.equal(client.tokens(),null);
});
test('reconnecting requests Spotify authorization dialog with PKCE',async()=>{
  const original=globalThis.location;let target;
  globalThis.location={assign:url=>{target=new URL(url);}};
  try {const client=new Spotify(store(),store());await client.login(true);assert.equal(target.searchParams.get('show_dialog'),'true');assert.equal(target.searchParams.get('code_challenge_method'),'S256');assert.ok(client.session.getItem('companion.pkce'));}
  finally {if(original===undefined)delete globalThis.location;else globalThis.location=original;}
});
test('account name uses the authorized profile and falls back to ID',async()=>{
 const client=setup(async(url,options)=>{assert.equal(url,'https://api.spotify.com/v1/me');assert.equal(options.headers.Authorization,'Bearer old');return Response.json({display_name:'House account',id:'house',images:[{url:'https://example.com/avatar.jpg'}]});});assert.deepEqual(await client.profile(),{name:'House account',image:'https://example.com/avatar.jpg'});
 const fallback=setup(async()=>Response.json({display_name:null,id:'listener'}));assert.equal((await fallback.profile()).name,'listener');
});
test('profile refreshes expired tokens and retries unauthorized once',async()=>{
 let calls=0;const client=setup(async url=>{calls++;if(url.includes('/api/token'))return Response.json({access_token:'new',expires_in:3600});return calls===1?new Response(null,{status:401}):Response.json({display_name:'New account'});});assert.equal((await client.profile()).name,'New account');assert.equal(calls,3);
});
test('a late profile response cannot restore the old account after switching',async()=>{
 let finish;const client=setup(()=>new Promise(resolve=>{finish=resolve;}));const pending=client.profile();client.disconnect();finish(Response.json({display_name:'Old account'}));await assert.rejects(pending,/Signed out/);assert.equal(client.tokens(),null);
});

 test('renewal failures preserve saved session and a later retry succeeds',async()=>{
  for(const status of [400,401,429,500,503]){
   let fail=true;const client=setup(async url=>{
    if(url.includes('/api/token'))return fail?Response.json({error:'temporarily_unavailable'},{status,headers:{'Retry-After':'120'}}):Response.json({access_token:'renewed',refresh_token:'rotated',expires_in:3600});
    return new Response(null,{status:204});
   },true);
   await assert.rejects(client.nowPlaying(),e=>e.status===status && (status!==429 || e.retryMs===120000));assert.equal(client.tokens().refresh_token,'refresh');
   fail=false;assert.equal(await client.nowPlaying(),null);assert.equal(client.tokens().refresh_token,'rotated');
  }
 });
 test('next-day reopen refreshes saved tokens without interactive login',async()=>{
  const storage=store();storage.setItem(key,JSON.stringify({access_token:'yesterday',refresh_token:'saved',expires_at:Date.now()-86400000}));
  const client=new Spotify(storage,store(),async url=>url.includes('/api/token')?Response.json({access_token:'today',expires_in:3600}):new Response(null,{status:204}));
  assert.equal(await client.nowPlaying(),null);assert.equal(client.tokens().refresh_token,'saved');
 });
 test('ordinary connect permits existing Spotify session without forcing the account dialog',async()=>{
  const original=globalThis.location;let target;globalThis.location={assign:url=>{target=new URL(url);}};
  try{await new Spotify(store(),store()).login();assert.equal(target.searchParams.has('show_dialog'),false);}finally{if(original===undefined)delete globalThis.location;else globalThis.location=original;}
 });

const accountsKey='companion.spotify.accounts';
function multiple(request=async()=>new Response(null,{status:204})){
 const storage=store();storage.setItem(accountsKey,JSON.stringify({activeId:'house',accounts:[{id:'house',name:'House',image:'https://example.com/house.jpg',tokens:{access_token:'house-access',refresh_token:'house-refresh',expires_at:Date.now()+3600000}},{id:'personal',name:'Personal',image:null,tokens:{access_token:'personal-access',refresh_token:'personal-refresh',expires_at:Date.now()-1000}}]}));return new Spotify(storage,store(),request);
}
test('existing single connection migrates without losing credentials and gains profile identity',async()=>{
 const client=setup(async()=>Response.json({id:'house',display_name:'House',images:[{url:'https://example.com/photo.jpg'}]}));
 assert.equal(client.tokens().refresh_token,'refresh');assert.equal(client.storage.getItem(key),null);await client.profile();
 assert.deepEqual(client.accounts(),[{id:'house',name:'House',image:'https://example.com/photo.jpg',active:true,needsLogin:false}]);
 assert.equal(new Spotify(client.storage,store()).tokens().refresh_token,'refresh');
});
test('account selection refreshes only the selected account and survives reopening',async()=>{
 const calls=[];const client=multiple(async(url,options)=>{calls.push([url,options]);if(url.includes('/api/token')){assert.equal(options.body.get('refresh_token'),'personal-refresh');return Response.json({access_token:'personal-new',refresh_token:'personal-rotated',expires_in:3600});}assert.equal(options.headers.Authorization,'Bearer personal-new');return new Response(null,{status:204});});
 client.selectAccount('personal');assert.equal(await client.nowPlaying(),null);assert.equal(calls.length,2);
 const reopen=new Spotify(client.storage,store());assert.equal(reopen.tokens().refresh_token,'personal-rotated');reopen.selectAccount('house');assert.equal(reopen.tokens().refresh_token,'house-refresh');
 assert.equal(client.accounts()[0].needsLogin,false);assert.equal('tokens' in client.accounts()[0],false);
});
test('late refresh and profile responses cannot alter a newly selected account',async()=>{
 let finish;const client=multiple(()=>new Promise(resolve=>{finish=resolve;}));client.selectAccount('personal');const refresh=client.refresh();client.selectAccount('house');finish(Response.json({access_token:'late',refresh_token:'late-refresh',expires_in:3600}));await assert.rejects(refresh,/Signed out/);assert.equal(client.tokens().access_token,'house-access');client.selectAccount('personal');assert.equal(client.tokens().refresh_token,'personal-refresh');
 client.selectAccount('house');const profile=client.profile();client.selectAccount('personal');finish(Response.json({id:'house',display_name:'Wrong late name'}));await assert.rejects(profile,/Signed out/);assert.equal(client.accounts()[0].name,'House');
});
test('rejected refresh marks only that account for reconnect and leaves others usable',async()=>{
 const client=multiple(async()=>Response.json({error:'invalid_grant'},{status:400}));client.selectAccount('personal');await assert.rejects(client.refresh());assert.equal(client.tokens(),null);assert.equal(client.accounts().find(a=>a.id==='personal').needsLogin,true);client.selectAccount('house');assert.equal(client.tokens().access_token,'house-access');
});
test('adding an account preserves previous connections; duplicate identity replaces only that account',async()=>{
 const client=multiple(async url=>url.includes('/api/token')?Response.json({access_token:'added',refresh_token:'added-refresh',expires_in:3600}):Response.json({id:'personal',display_name:'Personal',images:[]}));
 await client.token({grant_type:'authorization_code',code:'fake'});assert.equal(client.accounts().length,3);await client.profile();assert.equal(client.accounts().length,2);assert.equal(client.tokens().refresh_token,'added-refresh');client.selectAccount('house');assert.equal(client.tokens().refresh_token,'house-refresh');
});
test('cancelled add-account authorization retains selected account and saved connections',async()=>{
 const client=multiple();const original=globalThis.location;globalThis.location={assign:()=>{}};
 try{await client.login(true);assert.equal(client.tokens().access_token,'house-access');const pending=JSON.parse(client.session.getItem('companion.pkce'));await assert.rejects(client.callback(new URLSearchParams({state:pending.state,error:'access_denied'})),/cancelled/);assert.equal(client.accounts().length,2);assert.equal(client.tokens().access_token,'house-access');}finally{if(original===undefined)delete globalThis.location;else globalThis.location=original;}
});
test('logout and remove forget only the chosen account and reject pending responses',async()=>{
 const client=multiple();client.removeAccount('personal');assert.equal(client.tokens().access_token,'house-access');assert.equal(client.accounts().length,1);client.disconnect();assert.equal(client.tokens(),null);assert.deepEqual(client.accounts(),[]);
 const other=multiple();other.disconnect();assert.equal(other.accounts().length,1);other.selectAccount('personal');assert.equal(other.tokens().refresh_token,'personal-refresh');
});
test('a selection from another tab cannot receive a late token belonging to the former account',async()=>{
 let finish;const client=multiple(()=>new Promise(resolve=>{finish=resolve;}));client.selectAccount('personal');const pending=client.refresh();const other=new Spotify(client.storage,store());other.selectAccount('house');finish(Response.json({access_token:'late-personal',expires_in:3600}));await assert.rejects(pending,/Signed out/);assert.equal(client.tokens().access_token,'house-access');
});
