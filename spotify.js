export const CLIENT_ID = '6f9f689a446f4afb8c9577beb830d3a8';
export const REDIRECT_URI = typeof location==='undefined' || location.hostname==='127.0.0.1' ? 'http://127.0.0.1:5173/callback' : new URL('./',import.meta.url).href;
const KEY = 'companion.spotify.tokens', ACCOUNTS='companion.spotify.accounts';
export class SpotifyError extends Error { constructor(message,status,retryMs=0) { super(message); this.status=status; this.retryMs=retryMs; } }
export function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export async function challenge(verifier) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))); }
export function position(data,receivedAt,now=performance.now()) { return Math.min(data?.item?.duration_ms || 0,Math.max(0,(data?.progress_ms || 0)+(data?.is_playing ? Math.min(now-receivedAt,6000) : 0))); }
export function formatTime(ms) { const s=Math.floor(Math.max(0,ms)/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
export class Spotify {
  constructor(storage=localStorage,session=sessionStorage,request=(...args)=>globalThis.fetch(...args)) { this.storage=storage; this.session=session; this.request=request; this.refreshing=null; this.generation=0;
    // Migrate the existing connection without requiring another authorization.
    if(!this.storage.getItem(ACCOUNTS)){
      let old;try{old=JSON.parse(this.storage.getItem(KEY));}catch{}
      if(old?.access_token)this.saveAccounts({activeId:'legacy',accounts:[{id:'legacy',name:'Spotify account',image:null,provisional:true,tokens:old}]});
    }
  }
  accountState(){try{const value=JSON.parse(this.storage.getItem(ACCOUNTS));if(Array.isArray(value?.accounts))return value;}catch{}return {activeId:null,accounts:[]};}
  saveAccounts(value){this.storage.setItem(ACCOUNTS,JSON.stringify(value));this.storage.removeItem(KEY);}
  accounts(){const {activeId,accounts}=this.accountState();return accounts.map(({id,name,image,tokens})=>({id,name,image,active:id===activeId,needsLogin:!tokens}));}
  tokens(){const state=this.accountState();return state.accounts.find(account=>account.id===state.activeId)?.tokens || null;}
  selectAccount(id){const state=this.accountState();if(!state.accounts.some(account=>account.id===id))throw new Error('This Spotify account is no longer saved.');this.generation++;this.refreshing=null;state.activeId=id;this.saveAccounts(state);this.session.removeItem('companion.pkce');}
  disconnect(){const state=this.accountState();this.generation++;this.refreshing=null;state.accounts=state.accounts.filter(account=>account.id!==state.activeId);state.activeId=null;this.saveAccounts(state);this.session.removeItem('companion.pkce');}
  removeAccount(id){const state=this.accountState();if(state.activeId===id){this.disconnect();return;}state.accounts=state.accounts.filter(account=>account.id!==id);this.saveAccounts(state);}
  expireAccount(){const state=this.accountState(),account=state.accounts.find(account=>account.id===state.activeId);this.generation++;this.refreshing=null;if(account)account.tokens=null;this.saveAccounts(state);}
  saveTokens(tokens,newAccount=false){const state=this.accountState();let account=state.accounts.find(account=>account.id===state.activeId);
    if(newAccount || !account){account={id:'pending:'+base64url(crypto.getRandomValues(new Uint8Array(16))),name:'Spotify account',image:null,provisional:true};state.accounts.push(account);state.activeId=account.id;}
    account.tokens=tokens;this.saveAccounts(state);
  }
  async login(switchAccount=false) {
    this.generation++;this.refreshing=null;
    const verifier=base64url(crypto.getRandomValues(new Uint8Array(64)));
    const state=base64url(crypto.getRandomValues(new Uint8Array(32)));
    this.session.setItem('companion.pkce',JSON.stringify({verifier,state,created:Date.now()}));
    const params=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:REDIRECT_URI,scope:'user-read-currently-playing',state,code_challenge_method:'S256',code_challenge:await challenge(verifier)});
    if(switchAccount)params.set('show_dialog','true');
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
    const version=this.generation,accountId=this.accountState().activeId;
    const response=await this.timedRequest('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,...fields})});
    if(version!==this.generation || accountId!==this.accountState().activeId) throw new SpotifyError('Signed out. Please connect again.',401);
    if (!response.ok) {
      let error;try{error=await response.json();}catch{}
      if(version!==this.generation || accountId!==this.accountState().activeId)throw new SpotifyError('Signed out. Please connect again.',401);
      // Only a rejected refresh grant proves the saved session is unusable.
      // API authorization errors, outages and rate limits must not delete it.
      if(fields.grant_type==='refresh_token' && error?.error==='invalid_grant'){
        this.expireAccount();
        throw new SpotifyError('Spotify rejected the saved sign-in. Please connect again.',401);
      }
      const retryMs=response.status===429?Math.max(5000,(Number(response.headers.get('Retry-After')) || 30)*1000):0;
      throw new SpotifyError('Spotify could not renew the connection yet. Your sign-in is saved; retrying automatically.',response.status,retryMs);
    }
    const data=await response.json();
    if(version!==this.generation || accountId!==this.accountState().activeId) throw new SpotifyError('Signed out. Please connect again.',401);
    if(!data.access_token || !Number.isFinite(data.expires_in))throw new SpotifyError('Spotify returned an incomplete sign-in response. Please retry.',502);
    this.saveTokens({access_token:data.access_token,refresh_token:data.refresh_token || (fields.grant_type==='refresh_token'?this.tokens()?.refresh_token:undefined),expires_at:Date.now()+data.expires_in*1000},fields.grant_type==='authorization_code');
    return data.access_token;
  }
  async refresh() {
    if (!this.refreshing) {
      const refresh_token=this.tokens()?.refresh_token;
      if (!refresh_token) { this.expireAccount(); throw new SpotifyError('Please connect with Spotify again.',401); }
      const pending=this.token({grant_type:'refresh_token',refresh_token}).finally(()=>{if(this.refreshing===pending)this.refreshing=null;});
      this.refreshing=pending;
    }
    return this.refreshing;
  }
  async profile(retry=true) {
    const version=this.generation,accountId=this.accountState().activeId,tokens=this.tokens();
    if(!tokens)throw new SpotifyError('Please connect with Spotify.',401);
    const access=tokens.expires_at<Date.now()+30000?await this.refresh():tokens.access_token;
    const response=await this.timedRequest('https://api.spotify.com/v1/me',{headers:{Authorization:`Bearer ${access}`}});
    if(version!==this.generation || accountId!==this.accountState().activeId)throw new SpotifyError('Signed out. Please connect again.',401);
    if(response.status===401 && retry){await this.refresh();return this.profile(false);}
    if(!response.ok)throw new SpotifyError('Couldn’t load your Spotify account name.',response.status);
    const data=await response.json();
    if(version!==this.generation || accountId!==this.accountState().activeId)throw new SpotifyError('Signed out. Please connect again.',401);
    const profile={name:data.display_name || data.id || 'Spotify listener',image:data.images?.find(image=>typeof image.url==='string' && image.url.startsWith('https://'))?.url || null};
    if(data.id){const state=this.accountState(),account=state.accounts.find(value=>value.id===state.activeId);if(account){
      // Signing in to an already saved account replaces its credentials rather
      // than creating duplicate entries. Never mix refresh tokens across users.
      state.accounts=state.accounts.filter(value=>value===account || value.id!==data.id);
      account.id=data.id;account.name=profile.name;account.image=profile.image;account.provisional=false;state.activeId=data.id;this.saveAccounts(state);
    }}
    return profile;
  }
  async nowPlaying(retry=true) {
    const version=this.generation,accountId=this.accountState().activeId;
    let tokens=this.tokens();
    if (!tokens) throw new SpotifyError('Please connect with Spotify.',401);
    const access=tokens.expires_at<Date.now()+30000 ? await this.refresh() : tokens.access_token;
    const response=await this.timedRequest('https://api.spotify.com/v1/me/player/currently-playing',{headers:{Authorization:`Bearer ${access}`}});
    if(version!==this.generation || accountId!==this.accountState().activeId) throw new SpotifyError('Signed out. Please connect again.',401);
    if (response.status===401 && retry) { await this.refresh(); return this.nowPlaying(false); }
    if (response.status===204) return null;
    if (response.status===429) throw new SpotifyError('Spotify asked us to wait. Reconnecting automatically…',429,Math.max(5000,(Number(response.headers.get('Retry-After')) || 30)*1000));
    if (response.status===403) throw new SpotifyError('Spotify denied access. Check that your account is allowed in this app’s Spotify developer settings.',403);
    if (!response.ok) throw new SpotifyError('Spotify is unavailable. Trying again automatically…',response.status);
    return response.json();
  }
}
