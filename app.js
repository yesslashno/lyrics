import {createLyricsEditor} from './lyrics-editor.js';
import {Spotify,position,formatTime} from './spotify.js?v=account-photo-2';
import {Lyrics,parseLrc,activeLine,trackKey} from './lyrics.js';
const lyrics=new Lyrics(); let lyricsKey='',lyricLines=[],lineNodes=[],lastLine=-2,lyricAbort,followingLyrics=true;
const lyricSection=document.createElement('section'); lyricSection.id='lyrics'; lyricSection.hidden=true;
const lyricHeader=document.createElement('div'); lyricHeader.className='lyrics-header';
const lyricLabel=document.createElement('a'); lyricLabel.href='https://lrclib.net';lyricLabel.target='_blank';lyricLabel.rel='noopener noreferrer';lyricLabel.textContent='LYRICS · LRCLIB';
const lyricRetry=document.createElement('button');lyricRetry.className='quiet';lyricRetry.textContent='Retry lyrics';lyricRetry.hidden=true;
const lyricFollow=document.createElement('button');lyricFollow.className='quiet';lyricFollow.textContent='Follow lyrics';lyricFollow.hidden=true;
const lyricAdd=document.createElement('button');lyricAdd.className='quiet';lyricAdd.textContent='Add missing lyrics';lyricAdd.hidden=true;
const editor=createLyricsEditor((track,value)=>{
  if(value)lyrics.cache.set(trackKey(track),{...value,published:true});
  if(trackKey(track)===lyricsKey)loadLyrics(track,true);
});
lyricAdd.onclick=()=>editor.open(current?.item?.type==='track'?current.item:null);
const lyricStatus=document.createElement('p');lyricStatus.className='lyrics-status';lyricStatus.setAttribute('role','status');
const lyricScroll=document.createElement('div');lyricScroll.className='lyrics-scroll';lyricScroll.tabIndex=0;lyricScroll.setAttribute('aria-label','Song lyrics');
const lyricActions=document.createElement('div');lyricActions.className='lyrics-actions';lyricActions.append(lyricFollow,lyricRetry,lyricAdd);lyricHeader.append(lyricLabel,lyricActions);lyricSection.append(lyricHeader,lyricStatus,lyricScroll);document.querySelector('main').append(lyricSection);
function pauseFollowing(){if(!lyricLines.length)return;followingLyrics=false;lyricFollow.hidden=false;lyricScroll.scrollTo({top:lyricScroll.scrollTop,behavior:'auto'});}
lyricScroll.addEventListener('wheel',pauseFollowing,{passive:true});
lyricScroll.addEventListener('touchstart',pauseFollowing,{passive:true});
lyricScroll.addEventListener('pointerdown',pauseFollowing,{passive:true});
lyricScroll.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))pauseFollowing();});
lyricFollow.onclick=()=>{followingLyrics=true;lyricFollow.hidden=true;lastLine=-2;followLyrics(position(current,receivedAt));};
window.addEventListener('resize',()=>{lastLine=-2;followLyrics(position(current,receivedAt));});
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{lastLine=-2;followLyrics(position(current,receivedAt));}).observe(lyricScroll);
lyricRetry.onclick=()=>{lyrics.cache.delete(trackKey(current?.item));loadLyrics(current?.item,true);};
async function loadLyrics(track,force=false) {
  const key=trackKey(track);if(key===lyricsKey && !force)return;
  lyricsKey=key;lyricAbort?.abort();lyricAbort=new AbortController();const controller=lyricAbort;
  lyricLines=[];lineNodes=[];lastLine=-2;followingLyrics=true;lyricFollow.hidden=true;lyricScroll.replaceChildren();lyricScroll.scrollTop=0;
  lyricSection.hidden=!track;document.body.classList.toggle('with-lyrics',!!track);lyricRetry.hidden=true;lyricAdd.hidden=true;if(!track)return;
  lyricStatus.textContent='Finding lyrics…';
  const timeout=setTimeout(()=>controller.abort('timeout'),20000);
  try {
    const result=await lyrics.get(track,controller.signal);if(key!==lyricsKey || controller!==lyricAbort)return;
    lyricAdd.hidden=!!(result?.instrumental || result?.syncedLyrics || result?.plainLyrics);
    lyricRetry.hidden=lyricAdd.hidden;
    lyricAdd.textContent='Add missing lyrics';
    lyricLines=parseLrc(result?.syncedLyrics || '');
    lyricStatus.textContent=(result?.published?'Published to LRCLIB · ':'')+(result?.instrumental?'Instrumental · no lyrics':lyricLines.length?'Synced lyrics · following the music':result?.plainLyrics?'Plain lyrics · timing unavailable':'No lyrics found for this recording.');
    const texts=lyricLines.length?lyricLines.map(line=>line.text):result?.plainLyrics?.split(/\r?\n/) || [];
    lineNodes=texts.map(text=>{const node=document.createElement('p');node.className='lyric-line';node.textContent=text || '♪';return node;});lyricScroll.append(...lineNodes);followLyrics(position(current,receivedAt));
  } catch(error) {
    if(key!==lyricsKey || controller!==lyricAbort)return;
    lyricStatus.textContent=error.message || 'Lyrics request timed out. Try again.';lyricRetry.hidden=false;lyricAdd.hidden=false;lyricAdd.textContent='Add missing lyrics';
  } finally {clearTimeout(timeout);}
}
function followLyrics(ms) {
  if(!lyricLines.length)return;const index=activeLine(lyricLines,ms);if(index===lastLine)return;
  lineNodes.forEach((node,i)=>{node.classList.toggle('active',i===index);if(i===index)node.setAttribute('aria-current','true');else node.removeAttribute('aria-current');});
  lastLine=index;const node=lineNodes[index];
  if(node && followingLyrics){
    // Use one coordinate system: offsetTop can refer to different offset parents on iPad.
    const lineBox=node.getBoundingClientRect(),scrollBox=lyricScroll.getBoundingClientRect();
    const top=lyricScroll.scrollTop+lineBox.top-scrollBox.top-lyricScroll.clientTop-lyricScroll.clientHeight/2+lineBox.height/2;
    lyricScroll.scrollTo({top:Math.max(0,top),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
}
const $=id=>document.getElementById(id), spotify=new Spotify();
let current=null,receivedAt=0,timer,busy=false,generation=0,blockedUntil=0,failures=0,accountPending=false,accountName='';
function notice(message='') { $('notice').textContent=message; }
function connected() { const yes=!!spotify.tokens(); $('welcome').hidden=yes; $('player').hidden=!yes; $('account-controls').hidden=!yes; if(!yes){accountName='';setAccountPhoto();$('account-name').textContent='Spotify account';$('account-retry').hidden=true;} return yes; }
function setAccountPhoto(url=null,name='') {
  const photo=$('account-photo');photo.hidden=!url;
  $('account-initial').hidden=!!url;$('account-initial').textContent=name.trim().charAt(0).toUpperCase() || '♫';
  if(url)photo.src=url;else photo.removeAttribute('src');
}
$('account-photo').onerror=()=>setAccountPhoto(null,accountName);
async function loadAccount() {
  if(accountPending || !spotify.tokens())return;
  accountPending=true;const version=generation;
  $('account-name').textContent='Loading Spotify account…';$('account-retry').hidden=true;
  try {
    const profile=await spotify.profile();if(version!==generation)return;
    accountName=profile.name;$('account-name').textContent=`Spotify · ${accountName}`;
    $('account-name').title=accountName;setAccountPhoto(profile.image,accountName);
  }catch {
    if(version!==generation)return;
    $('account-name').textContent='Spotify · name unavailable';$('account-retry').hidden=false;
  }finally {accountPending=false;}
}
$('account-retry').onclick=loadAccount;
function render(data) {
  current=data; receivedAt=performance.now();
  const track=data?.item?.type==='track' ? data.item : null;
  loadLyrics(track);
  $('title').textContent=track?.name || (data?.currently_playing_type==='episode'?'You’re listening to a podcast.':'Ready when you are.');
  $('artist').textContent=track?.artists?.map(a=>a.name).join(', ') || 'Play a song on Spotify to see it here.';
  $('album').textContent=track?.album?.name || '';
  $('play-state').textContent=track ? (data.is_playing?'NOW PLAYING':'PAUSED') : 'CONNECTED TO SPOTIFY';
  const image=track?.album?.images?.[0]?.url;
  $('art').hidden=!image; $('art-placeholder').hidden=!!image;
  if(image && $('art').getAttribute('src')!==image) { $('art').src=image; $('art').alt=`Album artwork for ${track.album.name}`; }
  if(!image) $('art').removeAttribute('src');
  $('timeline').hidden=!track; $('duration').textContent=formatTime(track?.duration_ms || 0);
  const link=track?.external_urls?.spotify;
  $('spotify-link').hidden=!link; if(link) $('spotify-link').href=link;
  tick();
}
function tick() { const ms=position(current,receivedAt); $('elapsed').textContent=formatTime(ms); $('progress').max=current?.item?.duration_ms || 1; $('progress').value=ms; followLyrics(ms); }
async function poll() {
  clearTimeout(timer);
  if(busy || !connected()) return;
  if(Date.now()<blockedUntil) { timer=setTimeout(poll,blockedUntil-Date.now()); return; }
  busy=true; const version=generation; let delay=5000;
  try {
    const data=await spotify.nowPlaying();
    if(version!==generation) return;
    render(data); failures=0; notice(); $('connection').textContent='Connected · updates automatically';
  } catch(error) {
    if(version!==generation) return;
    notice(error.name==='TimeoutError' || error.name==='TypeError' ? 'Connection interrupted. Trying again automatically…' : error.message);
    $('connection').textContent='Waiting for connection';
    if(error.status===401 || !spotify.tokens()) { spotify.disconnect(); connected(); return; }
    delay=error.retryMs || Math.min(60000,5000*2**Math.min(++failures,4)); blockedUntil=Date.now()+delay;
  } finally { busy=false; if(version===generation && spotify.tokens()) timer=setTimeout(poll,document.hidden?Math.max(delay,15000):delay); }
}
async function connectSpotify() {
  if($('connect').disabled)return;
  $('connect').disabled=true;
  try {await spotify.login();}catch(error){notice(error.message);}
  finally {$('connect').disabled=false;}
}
function signOut(message='Signed out. Connect again, then choose “Not you?” on Spotify to use a different account.') {
  generation++;clearTimeout(timer);blockedUntil=0;failures=0;
  spotify.disconnect();editor.close();current=null;render(null);connected();
  $('account-name').removeAttribute('title');notice(message);$('connect').focus();$('connection').textContent='Made for listening.';
}
$('connect').onclick=connectSpotify;
$('disconnect').onclick=()=>signOut();
$('switch-account').onclick=()=>{signOut('Choose “Not you?” on Spotify to switch accounts.');connectSpotify();};
$('art').onerror=()=>{ $('art').hidden=true; $('art-placeholder').hidden=false; };
document.addEventListener('visibilitychange',()=>{if(!document.hidden) poll();});
window.addEventListener('online',()=>poll());
setInterval(tick,250);
async function init() {
  if(location.pathname==='/callback' || new URLSearchParams(location.search).has('code') || new URLSearchParams(location.search).has('error')) {
    $('connect').disabled=true; notice('Connecting to Spotify…');
    try { await spotify.callback(new URLSearchParams(location.search)); notice(); } catch(error) { notice(error.message); }
    finally { history.replaceState({},'',new URL('./',import.meta.url).pathname); $('connect').disabled=false; }
  }
  if(connected()){loadAccount();poll();}
}
init();
