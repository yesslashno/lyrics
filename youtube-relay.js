const SITE='https://yesslashno.github.io';
const MAX_AGE=30*24*60*60*1000;
const json=(status,value,headers)=>new Response(JSON.stringify(value),{status,headers});
export async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function secret(){return [...crypto.getRandomValues(new Uint8Array(24))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function validatePlayback(value){
  if(!value || !/^[\w-]{11}$/.test(value.videoId || '') || typeof value.title!=='string' || !value.title.trim() || value.title.length>500 || typeof value.channel!=='string' || value.channel.length>300 || !Number.isFinite(value.position) || value.position<0 || !Number.isFinite(value.duration) || value.duration<=0 || value.duration>86400 || value.position>value.duration+1 || typeof value.paused!=='boolean' || typeof value.ad!=='boolean')throw new Error('Invalid playback');
  return {videoId:value.videoId,title:value.title.trim(),channel:value.channel,position:value.position,duration:value.duration,paused:value.paused,ad:value.ad};
}
export async function handleYouTube(request,env,now=Date.now()){
 const origin=request.headers.get('Origin') || '',path=new URL(request.url).pathname;
 const allowed=origin===SITE || /^moz-extension:\/\/[a-f0-9-]+$/.test(origin) || !origin;
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed?(origin || SITE):SITE,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Max-Age':'600','X-Content-Type-Options':'nosniff'};
 const reply=(status,value)=>json(status,value,headers);
 if(!allowed)return reply(403,{error:'Origin not allowed.'});
 if(!['/api/session','/api/playback'].includes(path))return reply(404,{error:'Not found.'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!env.DB)return reply(503,{error:'YouTube pairing is unavailable. Please try again later.'});
 try{
  if(path==='/api/session'){
   if(request.method!=='POST' || origin!==SITE)return reply(403,{error:'Create pairing from the companion site.'});
   const creator=await hash(request.headers.get('CF-Connecting-IP') || 'unknown');
   const recent=await env.DB.prepare('SELECT COUNT(*) AS count FROM youtube_sessions WHERE creator_hash=? AND created_at>?').bind(creator,now-600000).first();
   if(recent.count>=10)return reply(429,{error:'Too many pairing requests. Try again in a few minutes.'});
   await env.DB.prepare('DELETE FROM youtube_sessions WHERE expires_at<=?').bind(now).run();
   const readToken=secret(),writeToken=secret(),expiresAt=now+MAX_AGE;
   await env.DB.prepare('INSERT INTO youtube_sessions(read_hash,write_hash,expires_at,created_at,creator_hash) VALUES(?,?,?,?,?)').bind(await hash(readToken),await hash(writeToken),expiresAt,now,creator).run();
   return reply(201,{readToken,writeToken,expiresAt});
  }
  const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{48})$/)?.[1];
  if(!token)return reply(401,{error:'Pair YouTube again.'});
  const tokenHash=await hash(token);
  if(request.method==='GET'){
   const row=await env.DB.prepare('SELECT payload,updated_at FROM youtube_sessions WHERE read_hash=? AND expires_at>?').bind(tokenHash,now).first();
   if(!row)return reply(401,{error:'Pairing expired. Pair YouTube again.'});
   return reply(200,{playback:row.payload?JSON.parse(row.payload):null,ageMs:row.updated_at?Math.max(0,now-row.updated_at):null});
  }
  if(request.method==='DELETE'){
   const result=await env.DB.prepare('DELETE FROM youtube_sessions WHERE read_hash=?').bind(tokenHash).run();
   return reply(result.meta.changes?200:401,{ok:!!result.meta.changes});
  }
  if(request.method!=='POST')return reply(405,{error:'Method not allowed.'});
  // Read a bounded stream rather than allocating an unbounded submission.
  let text='';const reader=request.body?.getReader();if(!reader)return reply(400,{error:'Missing playback.'});
  const decoder=new TextDecoder();let bytes=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>4096){await reader.cancel();return reply(413,{error:'Playback update too large.'});}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();
  let value;try{value=JSON.parse(text);if(value!==null)value=validatePlayback(value);}catch{return reply(400,{error:'Invalid playback update.'});}
  const result=await env.DB.prepare('UPDATE youtube_sessions SET payload=?,updated_at=? WHERE write_hash=? AND expires_at>?').bind(value===null?null:JSON.stringify(value),now,tokenHash,now).run();
  return reply(result.meta.changes?200:401,result.meta.changes?{ok:true}:{error:'Pairing expired. Copy a new code from the companion.'});
 }catch{return reply(503,{error:'YouTube connection is temporarily unavailable. Try again shortly.'});}
}
export default {fetch:(request,env)=>new URL(request.url).pathname.startsWith('/api/device/')?handleDevice(request,env):handleYouTube(request,env)};

const deviceDatabases=new WeakMap();
async function deviceTables(db){
 let ready=deviceDatabases.get(db);
 if(!ready){ready=(async()=>{for(const sql of [
 'CREATE TABLE IF NOT EXISTS youtube_devices (poll_hash TEXT PRIMARY KEY,code_hash TEXT UNIQUE NOT NULL,read_token TEXT,pair_expires_at INTEGER,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,creator_hash TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS youtube_device_creators ON youtube_devices(creator_hash,created_at)',
 'CREATE TABLE IF NOT EXISTS youtube_device_attempts (creator_hash TEXT PRIMARY KEY,window_start INTEGER NOT NULL,attempts INTEGER NOT NULL)'
 ])await db.prepare(sql).bind().run();})();deviceDatabases.set(db,ready);}
 try{await ready;}catch(error){deviceDatabases.delete(db);throw error;}
}
export async function handleDevice(request,env,now=Date.now()){
 const origin=request.headers.get('Origin') || '',path=new URL(request.url).pathname;
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':SITE,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','X-Content-Type-Options':'nosniff'};
 const reply=(status,value)=>json(status,value,headers);
 if(origin!==SITE)return reply(403,{error:'Connect screens from the companion site.'});
 if(!['/api/device/start','/api/device/status','/api/device/approve'].includes(path))return reply(404,{error:'Not found.'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!env.DB)return reply(503,{error:'Screen pairing is temporarily unavailable.'});
 try{
  await deviceTables(env.DB);
  const creator=await hash(request.headers.get('CF-Connecting-IP') || 'unknown');
  if(path==='/api/device/start' && request.method==='POST'){
   const recent=await env.DB.prepare('SELECT COUNT(*) AS count FROM youtube_devices WHERE creator_hash=? AND created_at>?').bind(creator,now-600000).first();
   if(recent.count>=10)return reply(429,{error:'Too many new codes. Wait a few minutes.'});
   // Retain expired rows briefly to enforce the creation limit, but erase delivered keys promptly.
   await env.DB.prepare('UPDATE youtube_devices SET read_token=NULL WHERE expires_at<=?').bind(now).run();
   await env.DB.prepare('DELETE FROM youtube_devices WHERE created_at<=?').bind(now-600000).run();
   await env.DB.prepare('DELETE FROM youtube_device_attempts WHERE window_start<=?').bind(now-600000).run();
   const pollToken=secret(),expiresAt=now+300000;
   for(let tries=0;tries<8;tries++){
    const code=String(100000+crypto.getRandomValues(new Uint32Array(1))[0]%900000),codeHash=await hash(code);
    const occupied=await env.DB.prepare('SELECT poll_hash FROM youtube_devices WHERE code_hash=?').bind(codeHash).first();if(occupied)continue;
    try{await env.DB.prepare('INSERT INTO youtube_devices(poll_hash,code_hash,expires_at,created_at,creator_hash) VALUES(?,?,?,?,?)').bind(await hash(pollToken),codeHash,expiresAt,now,creator).run();return reply(201,{pollToken,code,expiresAt});}catch{if(tries===7)throw new Error('Code creation failed');}
   }
   return reply(503,{error:'Couldn’t create a code. Try again.'});
  }
  const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{48})$/)?.[1];if(!token)return reply(401,{error:'Connect this screen again.'});
  const tokenHash=await hash(token);
  if(path==='/api/device/status'){
   if(request.method==='DELETE'){await env.DB.prepare('UPDATE youtube_devices SET read_token=NULL,expires_at=? WHERE poll_hash=?').bind(now,tokenHash).run();return reply(200,{ok:true});}
   if(request.method!=='GET')return reply(405,{error:'Method not allowed.'});
   const row=await env.DB.prepare('SELECT read_token,pair_expires_at FROM youtube_devices WHERE poll_hash=? AND expires_at>?').bind(tokenHash,now).first();
   if(!row)return reply(410,{error:'This code expired. Get a new code on the iPad.'});
   if(!row.read_token)return reply(200,{pending:true});
   const session=await env.DB.prepare('SELECT expires_at FROM youtube_sessions WHERE read_hash=? AND expires_at>?').bind(await hash(row.read_token),now).first();
   if(!session)return reply(410,{error:'The laptop pairing ended. Get a new code.'});
   return reply(200,{readToken:row.read_token,expiresAt:session.expires_at});
  }
  if(path!=='/api/device/approve' || request.method!=='POST')return reply(405,{error:'Method not allowed.'});
  const session=await env.DB.prepare('SELECT expires_at FROM youtube_sessions WHERE read_hash=? AND expires_at>?').bind(tokenHash,now).first();if(!session)return reply(401,{error:'Pair YouTube on your laptop first.'});
  await env.DB.prepare('INSERT INTO youtube_device_attempts(creator_hash,window_start,attempts) VALUES(?,?,1) ON CONFLICT(creator_hash) DO UPDATE SET attempts=CASE WHEN window_start<=? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END').bind(creator,now,now-600000,now-600000).run();
  const limit=await env.DB.prepare('SELECT attempts FROM youtube_device_attempts WHERE creator_hash=?').bind(creator).first();if(limit.attempts>10)return reply(429,{error:'Too many attempts. Wait a few minutes.'});
  const reader=request.body?.getReader();if(!reader)return reply(400,{error:'Enter the six-digit code.'});let text='',bytes=0;const decoder=new TextDecoder();
  while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>128){await reader.cancel();return reply(413,{error:'Enter only the six-digit code.'});}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();
  let code;try{code=JSON.parse(text).code;}catch{return reply(400,{error:'Enter the six-digit code.'});}if(typeof code!=='string' || !/^\d{6}$/.test(code))return reply(400,{error:'Enter the six-digit code.'});
  const result=await env.DB.prepare('UPDATE youtube_devices SET read_token=?,pair_expires_at=? WHERE code_hash=? AND expires_at>? AND read_token IS NULL').bind(token,session.expires_at,await hash(code),now).run();
  return result.meta.changes?reply(200,{ok:true}):reply(404,{error:'Code not found, already used, or expired. Check the iPad.'});
 }catch{return reply(503,{error:'Screen pairing is temporarily unavailable. Try again.'});}
}
