export function parseLrc(text='') {
  const lines=[];
  const offset=Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0);
  for(const row of text.split(/\r?\n/)) {
    const tags=[...row.matchAll(/\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    const words=row.replace(/\[[^\]]*\]/g,'').trim();
    for(const tag of tags) if(Number(tag[2])<60) lines.push({time:Math.max(0,Number(tag[1])*60000+Number(tag[2])*1000+Number((tag[3] || '').padEnd(3,'0'))+offset),text:words});
  }
  return lines.sort((a,b)=>a.time-b.time);
}
export function activeLine(lines,ms) { let low=0,high=lines.length; while(low<high){const mid=(low+high)>>1;if(lines[mid].time<=ms)low=mid+1;else high=mid;}return low-1; }
export function trackKey(track) {return track ? JSON.stringify([track.id || track.uri,track.name,track.artists?.[0]?.name,track.album?.name,track.duration_ms]) : '';}
export class Lyrics {
  constructor(request=(...args)=>globalThis.fetch(...args)) {this.request=request;this.cache=new Map();this.blockedUntil=0;}
  async get(track,signal) {
    const key=trackKey(track); if(this.cache.has(key))return this.cache.get(key);
    if(Date.now()<this.blockedUntil)throw new Error('Lyrics service is busy. Please try again shortly.');
    const params=new URLSearchParams({track_name:track.name,artist_name:track.artists?.[0]?.name || '',album_name:track.album?.name || '',duration:String(track.duration_ms/1000)});
    const response=await this.request(`https://lrclib.net/api/get?${params}`,{signal});
    if(response.status===429){this.blockedUntil=Date.now()+Math.max(1000,(Number(response.headers.get('Retry-After')) || 30)*1000);throw new Error('Lyrics service is busy. Please try again shortly.');}
    if(!response.ok && response.status!==404)throw new Error('Couldn’t load lyrics. Check your connection and try again.');
    const result=response.status===404 ? null : await response.json();
    this.cache.set(key,result);if(this.cache.size>50)this.cache.delete(this.cache.keys().next().value);
    return result;
  }
}
