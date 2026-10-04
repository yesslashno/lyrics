// Deployable Cloudflare Worker; also used by the local Node server.
// The relay accepts only the two LRCLIB publishing operations. No Spotify tokens.
const SITE='https://yesslashno.github.io';
export async function handleRelay(request,upstream=fetch) {
  const origin=request.headers.get('Origin') || '';
  const allowed=origin===SITE || ['http://127.0.0.1:5173','http://localhost:5173'].includes(origin);
  const headers={'Access-Control-Allow-Origin':allowed?origin:SITE,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Publish-Token','Access-Control-Expose-Headers':'Retry-After','Content-Type':'application/json','Cache-Control':'no-store'};
  const reply=(status,message)=>new Response(JSON.stringify({message}),{status,headers});
  const path=new URL(request.url).pathname.split('/').pop();
  if(!['request-challenge','publish'].includes(path))return reply(404,'Unknown operation.');
  if(!allowed)return reply(403,'Origin not allowed.');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply(405,'Use POST.');
  const text=await request.text();if(text.length>150000)return reply(413,'Lyrics submission is too large.');
  let body;try{body=JSON.parse(text);}catch{return reply(400,'Invalid submission.');}
  const upstreamHeaders={'Content-Type':'application/json'};
  if(path==='publish'){
    if(!body || ['trackName','artistName','albumName'].some(key=>typeof body[key]!=='string' || !body[key].trim() || body[key].length>1000) || typeof body.duration!=='number' || !Number.isFinite(body.duration) || body.duration<=0 || body.duration>3600 || typeof body.plainLyrics!=='string' || typeof body.syncedLyrics!=='string' || !(body.plainLyrics.trim() || body.syncedLyrics.trim()))return reply(400,'Invalid lyrics or recording details.');
    const token=request.headers.get('X-Publish-Token');if(!token || !/^[A-Za-z0-9_-]{1,128}:\d{1,20}$/.test(token))return reply(400,'Invalid publish token.');
    upstreamHeaders['X-Publish-Token']=token;
    body={trackName:body.trackName,artistName:body.artistName,albumName:body.albumName,duration:body.duration,plainLyrics:body.plainLyrics,syncedLyrics:body.syncedLyrics};
  }else body={};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await upstream('https://lrclib.net/api/'+path,{method:'POST',headers:upstreamHeaders,body:JSON.stringify(body),signal:controller.signal});
    const result=await response.text();const retry=response.headers.get('Retry-After');if(retry)headers['Retry-After']=retry;
    return new Response(result || null,{status:response.status,headers});
  }catch{return reply(502,'LRCLIB is unavailable. Try again shortly.');}
  finally{clearTimeout(timer);}
}
export default {fetch:request=>handleRelay(request)};
