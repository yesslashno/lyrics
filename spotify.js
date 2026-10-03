export const CLIENT_ID = '6f9f689a446f4afb8c9577beb830d3a8';
export const REDIRECT_URI = typeof location==='undefined' || location.hostname==='127.0.0.1' ? 'http://127.0.0.1:5173/callback' : new URL('./',import.meta.url).href;
const KEY = 'companion.spotify.tokens';
export class SpotifyError extends Error { constructor(message,status,retryMs=0) { super(message); this.status=status; this.retryMs=retryMs; } }
export function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export async function challenge(verifier) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))); }
export function position(data,receivedAt,now=performance.now()) { return Math.min(data?.item?.duration_ms || 0,Math.max(0,(data?.progress_ms || 0)+(data?.is_playing ? Math.min(now-receivedAt,6000) : 0))); }
export function formatTime(ms) { const s=Math.floor(Math.max(0,ms)/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
export class Spotify {
  constructor(storage=localStorage,session=sessionStorage,request=(...args)=>globalThis.fetch(...args)) { this.storage=storage; this.session=session; this.request=request; this.refreshing=null; this.generation=0; }
  tokens() { try { return JSON.parse(this.storage.getItem(KEY)); } catch { return null; } }
  disconnect() { this.generation++; this.refreshing=null; this.storage.removeItem(KEY); this.session.removeItem('companion.pkce'); }
  async login() {
    this.disconnect();
    const verifier=base64url(crypto.getRandomValues(new Uint8Array(64)));
    const state=base64url(crypto.getRandomValues(new Uint8Array(32)));
    this.session.setItem('companion.pkce',JSON.stringify({verifier,state,created:Date.now()}));
    const params=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:REDIRECT_URI,scope:'user-read-currently-playing',show_dialog:'true',state,code_challenge_method:'S256',code_challenge:await challenge(verifier)});
    location.assign(`https://accounts.spotify.com/authorize?${params}`);
  }
  async callback(params) {
    let pending; try { pending=JSON.parse(this.session.getItem('companion.pkce')); } catch {}
    if (!pending || params.get('state')!==pending.state || Date.now()-pending.created>600000) throw new Error('Sign-in expired or could not be verified. Please connect again.');
    if (params.has('error')) { this.session.removeItem('companion.pkce'); throw new Error('Spotify sign-in was cancelled. You can connect again whenever you’re ready.'); }
    if (!params.get('code')) throw new Error('Spotify did not return a sign-in code. Please connect again.');
    await this.token({grant_type:'authorization_code',code:params.get('code'),redirect_uri:REDIRECT_URI,code_verifier:pending.verifier});
    this.session.removeItem('companion.pkce');
  }
  async timedRequest(url,options,timeoutMs=15000) {
    // Older iPad Safari supports AbortController but not AbortSignal.timeout.
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try { return await this.request(url,{...options,signal:controller.signal}); }
    finally { clearTimeout(timer); }
  }
  async token(fields) {
    const version=this.generation;
    const response=await this.timedRequest('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,...fields})});
    if(version!==this.generation) throw new SpotifyError('Signed out. Please connect again.',401);
    if (!response.ok) { if(response.status===400 || response.status===401) this.disconnect(); throw new SpotifyError('Spotify could not renew your sign-in. Please reconnect.',response.status); }
    const data=await response.json();
    if(version!==this.generation) throw new SpotifyError('Signed out. Please connect again.',401);
    this.storage.setItem(KEY,JSON.stringify({access_token:data.access_token,refresh_token:data.refresh_token || this.tokens()?.refresh_token,expires_at:Date.now()+data.expires_in*1000}));
    return data.access_token;
  }
  async refresh() {
    if (!this.refreshing) {
      const refresh_token=this.tokens()?.refresh_token;
      if (!refresh_token) { this.disconnect(); throw new SpotifyError('Please connect with Spotify again.',401); }
      const pending=this.token({grant_type:'refresh_token',refresh_token}).finally(()=>{if(this.refreshing===pending)this.refreshing=null;});
      this.refreshing=pending;
    }
    return this.refreshing;
  }
  async nowPlaying(retry=true) {
    const version=this.generation;
    let tokens=this.tokens();
    if (!tokens) throw new SpotifyError('Please connect with Spotify.',401);
    const access=tokens.expires_at<Date.now()+30000 ? await this.refresh() : tokens.access_token;
    const response=await this.timedRequest('https://api.spotify.com/v1/me/player/currently-playing',{headers:{Authorization:`Bearer ${access}`}});
    if(version!==this.generation) throw new SpotifyError('Signed out. Please connect again.',401);
    if (response.status===401 && retry) { await this.refresh(); return this.nowPlaying(false); }
    if (response.status===204) return null;
    if (response.status===429) throw new SpotifyError('Spotify asked us to wait. Reconnecting automatically…',429,Math.max(5000,(Number(response.headers.get('Retry-After')) || 30)*1000));
    if (response.status===403) throw new SpotifyError('Spotify denied access. Check that your account is allowed in this app’s Spotify developer settings.',403);
    if (!response.ok) throw new SpotifyError('Spotify is unavailable. Trying again automatically…',response.status);
    return response.json();
  }
}
