import {Spotify,position,formatTime} from './spotify.js';
import {Lyrics,parseLrc,activeLine,trackKey} from './lyrics.js';
const lyrics=new Lyrics(); let lyricsKey='',lyricLines=[],lineNodes=[],lastLine=-2,lyricAbort;
const lyricSection=document.createElement('section'); lyricSection.id='lyrics'; lyricSection.hidden=true;
const lyricHeader=document.createElement('div'); lyricHeader.className='lyrics-header';
const lyricLabel=document.createElement('a'); lyricLabel.href='https://lrclib.net';lyricLabel.target='_blank';lyricLabel.rel='noopener noreferrer';lyricLabel.textContent='LYRICS · LRCLIB';
const lyricRetry=document.createElement('button');lyricRetry.className='quiet';lyricRetry.textContent='Retry lyrics';lyricRetry.hidden=true;
const lyricStatus=document.createElement('p');lyricStatus.className='lyrics-status';lyricStatus.setAttribute('role','status');
const lyricScroll=document.createElement('div');lyricScroll.className='lyrics-scroll';lyricScroll.tabIndex=0;lyricScroll.setAttribute('aria-label','Song lyrics');
lyricHeader.append(lyricLabel,lyricRetry);lyricSection.append(lyricHeader,lyricStatus,lyricScroll);document.querySelector('main').append(lyricSection);
lyricRetry.onclick=()=>loadLyrics(current?.item,true);
async function loadLyrics(track,force=false) {
  const key=trackKey(track);if(key===lyricsKey && !force)return;
  lyricsKey=key;lyricAbort?.abort();lyricAbort=new AbortController();const controller=lyricAbort;
  lyricLines=[];lineNodes=[];lastLine=-2;lyricScroll.replaceChildren();lyricScroll.scrollTop=0;
  lyricSection.hidden=!track;document.body.classList.toggle('with-lyrics',!!track);lyricRetry.hidden=true;if(!track)return;
  lyricStatus.textContent='Finding lyrics…';
  const timeout=setTimeout(()=>controller.abort('timeout'),20000);
  try {
    const result=await lyrics.get(track,controller.signal);if(key!==lyricsKey)return;
    lyricLines=parseLrc(result?.syncedLyrics || '');
    lyricStatus.textContent=result?.instrumental?'Instrumental · no lyrics':lyricLines.length?'Synced lyrics · following the music':result?.plainLyrics?'Plain lyrics · timing unavailable':'No lyrics found for this recording.';
    const texts=lyricLines.length?lyricLines.map(line=>line.text):result?.plainLyrics?.split(/\r?\n/) || [];
    lineNodes=texts.map(text=>{const node=document.createElement('p');node.className='lyric-line';node.textContent=text || '♪';return node;});lyricScroll.append(...lineNodes);followLyrics(position(current,receivedAt));
  } catch(error) {
    if(key!==lyricsKey || controller!==lyricAbort)return;
    lyricStatus.textContent=error.message || 'Lyrics request timed out. Try again.';lyricRetry.hidden=false;
  } finally {clearTimeout(timeout);}
}
function followLyrics(ms) {
  if(!lyricLines.length)return;const index=activeLine(lyricLines,ms);if(index===lastLine)return;
  lineNodes.forEach((node,i)=>{node.classList.toggle('active',i===index);if(i===index)node.setAttribute('aria-current','true');else node.removeAttribute('aria-current');});
  lastLine=index;const node=lineNodes[index];if(node)lyricScroll.scrollTo({top:Math.max(0,node.offsetTop-lyricScroll.offsetTop-lyricScroll.clientHeight/2+node.clientHeight/2),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
const $=id=>document.getElementById(id), spotify=new Spotify();
let current=null,receivedAt=0,timer,busy=false,generation=0,blockedUntil=0,failures=0;
function notice(message='') { $('notice').textContent=message; }
function connected() { const yes=!!spotify.tokens(); $('welcome').hidden=yes; $('player').hidden=!yes; $('disconnect').hidden=!yes; return yes; }
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
$('connect').onclick=()=>spotify.login().catch(error=>notice(error.message));
$('disconnect').onclick=()=>{generation++; clearTimeout(timer); spotify.disconnect(); current=null; render(null); connected(); notice(); $('connection').textContent='Made for listening.';};
$('art').onerror=()=>{ $('art').hidden=true; $('art-placeholder').hidden=false; };
$('fullscreen').onclick=async()=>{try { if(document.fullscreenElement) await document.exitFullscreen(); else if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else notice('On iPad, use Safari’s Add to Home Screen for a full-screen view.'); } catch { notice('Full screen is unavailable in this browser.'); }};
document.addEventListener('visibilitychange',()=>{if(!document.hidden) poll();});
window.addEventListener('online',()=>poll());
setInterval(tick,250);
async function init() {
  if(location.pathname==='/callback' || new URLSearchParams(location.search).has('code') || new URLSearchParams(location.search).has('error')) {
    $('connect').disabled=true; notice('Connecting to Spotify…');
    try { await spotify.callback(new URLSearchParams(location.search)); notice(); } catch(error) { notice(error.message); }
    finally { history.replaceState({},'',new URL('./',import.meta.url).pathname); $('connect').disabled=false; }
  }
  if(connected()) poll();
}
init();
