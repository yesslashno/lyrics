import {relayUrl as configuredRelay} from './publish-config.js';
export function publishPayload(track,value) {
  if(!track?.name || !track.artists?.[0]?.name || !track.album?.name || !(track.duration_ms>0))throw new Error('This song is missing details needed to publish lyrics.');
  if(!value.plainLyrics?.trim() && !value.syncedLyrics?.trim())throw new Error('Paste lyrics before publishing.');
  return {trackName:track.name,artistName:track.artists[0].name,albumName:track.album.name,duration:track.duration_ms/1000,plainLyrics:value.plainLyrics || '',syncedLyrics:value.syncedLyrics || ''};
}
export function solveChallenge(challenge,signal) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./publish-worker.js',import.meta.url));
    let timer;
    const finish=(error,value)=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
    const cancel=()=>finish(new Error('Publishing cancelled.'));
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener('abort',cancel,{once:true});
    worker.onerror=()=>finish(new Error('Couldn’t prepare publishing in this browser. Your lyrics are still here.'));
    worker.onmessage=({data})=>{if(data.error)finish(new Error(data.error));else if(data.nonce!==undefined)finish(null,`${challenge.prefix}:${data.nonce}`);};
    timer=setTimeout(()=>finish(new Error('Publishing preparation timed out. Please try again.')),245000);
    worker.postMessage(challenge);
  });
}
export async function publishLyrics(track,value,{signal,status=()=>{},request=(...args)=>globalThis.fetch(...args),solve=solveChallenge,relayUrl=configuredRelay()}={}) {
  const payload=publishPayload(track,value);
  if(!relayUrl)throw new Error('Public publishing needs a relay. For now, open the companion on your Mac at http://127.0.0.1:5173 to contribute lyrics.');
  async function send(path,body,headers={}) {
    const controller=new AbortController(),cancel=()=>controller.abort();
    if(signal?.aborted)throw new Error('Publishing cancelled.');
    signal?.addEventListener('abort',cancel,{once:true});const timer=setTimeout(cancel,20000);
    try {
      const response=await request(`${relayUrl}/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:controller.signal});
      if(!response.ok){throw new Error(response.status===429?'LRCLIB is busy. Wait a little and try again.':`LRCLIB could not publish these lyrics (${response.status}). Please try again.`);}
      return path==='request-challenge'?await response.json():null;
    } catch(error){if(controller.signal.aborted)throw new Error(signal?.aborted?'Publishing cancelled.':'Request timed out. Your lyrics are still here; try again.');throw error;}
    finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  status('Preparing your contribution…');const challenge=await send('request-challenge',{});
  status('Preparing your contribution… this may take a few minutes. Keep this tab open.');const token=await solve(challenge,signal);
  if(signal?.aborted)throw new Error('Publishing cancelled.');
  status('Publishing lyrics to LRCLIB…');await send('publish',payload,{'X-Publish-Token':token});
}
