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
export default {fetch:(request,env)=>handleYouTube(request,env)};
