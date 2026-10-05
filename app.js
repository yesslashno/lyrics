import {createSpotifyControls} from './spotify-controls.js?v=layout-3';
import {privateLyrics,webLyricsUrl} from './private-lyrics.js';
import {createScreensaver} from './screensaver.js';
import {createTimingEditor,savedTimings} from './lyrics-timing.js';
import {createLyricsEditor} from './lyrics-editor.js?v=layout-3';
import {Spotify,position,formatTime} from './spotify.js?v=playback-1';
import {Lyrics,parseLrc,activeLine,trackKey} from './lyrics.js';
const lyrics=new Lyrics(); let lyricsKey='',lyricLines=[],lineNodes=[],lastLine=-2,lyricAbort,followingLyrics=true;
const lyricSection=document.createElement('section'); lyricSection.id='lyrics'; lyricSection.hidden=true;
const lyricHeader=document.createElement('div'); lyricHeader.className='lyrics-header';
const lyricLabel=document.createElement('a'); lyricLabel.href='https://lrclib.net';lyricLabel.target='_blank';lyricLabel.rel='noopener noreferrer';lyricLabel.textContent='LYRICS · LRCLIB';
const lyricRetry=document.createElement('button');lyricRetry.className='quiet';lyricRetry.textContent='Retry lyrics';lyricRetry.hidden=true;
const lyricFollow=document.createElement('button');lyricFollow.className='quiet';lyricFollow.textContent='Follow lyrics';lyricFollow.hidden=true;
const lyricTime=document.createElement('button');lyricTime.className='quiet';lyricTime.textContent='Add timing';lyricTime.hidden=true;
let plainForTiming='';
const lyricAdd=document.createElement('button');lyricAdd.className='quiet';lyricAdd.textContent='Add missing lyrics';lyricAdd.hidden=true;
const editor=createLyricsEditor((track,value)=>{
  if(value)lyrics.cache.set(trackKey(track),value);
  if(trackKey(track)===lyricsKey)loadLyrics(track,true);
});
const timingEditor=createTimingEditor({readPlayback:()=>current?.item?{mediaKey:current.item.id,position:position(current,receivedAt),playing:current.is_playing,stale:current.is_playing && performance.now()-receivedAt>6000}:null,onSave:(track,value)=>{lyrics.cache.set(trackKey(track),value);if(trackKey(track)===lyricsKey)loadLyrics(track,true);},onPublish:(track,value)=>editor.open(track,value)});
lyricTime.onclick=()=>timingEditor.open(current?.item,plainForTiming);
lyricAdd.onclick=()=>editor.open(current?.item?.type==='track'?current.item:null,privateLyrics(current?.item)?.value || {});
const lyricStatus=document.createElement('p');lyricStatus.className='lyrics-status';lyricStatus.setAttribute('role','status');
const lyricScroll=document.createElement('div');lyricScroll.className='lyrics-scroll';lyricScroll.tabIndex=0;lyricScroll.setAttribute('aria-label','Song lyrics');
const lyricWeb=document.createElement('a');lyricWeb.className='quiet';lyricWeb.textContent='Search the web →';lyricWeb.target='_blank';lyricWeb.rel='noopener noreferrer';lyricWeb.hidden=true;
const lyricActions=document.createElement('div');lyricActions.className='lyrics-actions';lyricActions.append(lyricWeb,lyricFollow,lyricTime,lyricRetry,lyricAdd);lyricHeader.append(lyricLabel,lyricActions);lyricSection.append(lyricHeader,lyricStatus,lyricScroll);document.querySelector('main').append(lyricSection);
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
  lyricWeb.hidden=true;if(track)lyricWeb.href=webLyricsUrl(track.name,track.artists?.[0]?.name);
  lyricsKey=key;lyricAbort?.abort();lyricAbort=new AbortController();const controller=lyricAbort;
  lyricLines=[];lineNodes=[];lastLine=-2;followingLyrics=true;lyricFollow.hidden=true;lyricTime.hidden=true;plainForTiming='';lyricScroll.replaceChildren();lyricScroll.scrollTop=0;
  lyricSection.hidden=!track;document.body.classList.toggle('with-lyrics',!!track);lyricRetry.hidden=true;lyricAdd.hidden=true;if(!track)return;
  lyricStatus.textContent='Finding lyrics…';
  const timeout=setTimeout(()=>controller.abort('timeout'),20000);
  try {
    let result=privateLyrics(track)?.value || await lyrics.get(track,controller.signal);if(key!==lyricsKey || controller!==lyricAbort)return;
    const own=savedTimings(track,result?.plainLyrics || '');if(own)result={...result,...own};
    plainForTiming=result?.plainLyrics || '';lyricTime.hidden=!plainForTiming || !!result?.instrumental || (!!result?.syncedLyrics && !own);lyricTime.textContent=own?'Edit timing':'Add timing';
    lyricAdd.hidden=!result?.private && !!(result?.instrumental || result?.syncedLyrics || result?.plainLyrics);
    lyricWeb.hidden=!!(result?.instrumental || result?.syncedLyrics || result?.plainLyrics);
    lyricRetry.hidden=!!result?.private || lyricAdd.hidden;
    lyricAdd.textContent=result?.private?'Edit private lyrics':'Add missing lyrics';
    lyricLines=parseLrc(result?.syncedLyrics || '');
    lyricStatus.textContent=(result?.private?'Private lyrics · ':result?.published?'Published to LRCLIB · ':'')+(result?.instrumental?'Instrumental · no lyrics':lyricLines.length?'Synced lyrics · following the music':result?.plainLyrics?'Plain lyrics · timing unavailable':'No lyrics found for this recording.');
    const texts=lyricLines.length?lyricLines.map(line=>line.text):result?.plainLyrics?.split(/\r?\n/) || [];
    lineNodes=texts.map(text=>{const node=document.createElement('p');node.className='lyric-line';node.textContent=text || '♪';return node;});lyricScroll.append(...lineNodes);followLyrics(position(current,receivedAt));
  } catch(error) {
    if(key!==lyricsKey || controller!==lyricAbort)return;
    lyricStatus.textContent=error.message || 'Lyrics request timed out. Try again.';lyricWeb.hidden=false;lyricRetry.hidden=false;lyricAdd.hidden=false;lyricAdd.textContent='Add missing lyrics';
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
let current=null,receivedAt=0,timer,busy=null,generation=0,blockedUntil=0,failures=0,accountPending=null,accountName='';
const screensaver=createScreensaver({isPlaying:()=>!!spotify.tokens() && !!current?.is_playing && performance.now()-receivedAt<10000});
const playbackControls=createSpotifyControls({spotify,readPlayback:()=>({data:current,fresh:performance.now()-receivedAt<10000}),onEnable:()=>{notice('Approve playback access for this account on Spotify. Use “Not you?” if another account is shown.');connectSpotify(true);},onRefresh:poll});
function notice(message='') { $('notice').textContent=message; }
function connected() { const yes=!!spotify.tokens(); $('welcome').hidden=yes; $('player').hidden=!yes; $('account-controls').hidden=!yes && !spotify.accounts().length;$('disconnect').hidden=!yes; if(!yes){accountName='';setAccountPhoto();$('account-name').textContent=spotify.accounts().length?'Spotify accounts':'Spotify account';$('account-retry').hidden=true;} return yes; }
function setAccountPhoto(url=null,name='') {
  const photo=$('account-photo');photo.hidden=!url;
  $('account-initial').hidden=!!url;$('account-initial').textContent=name.trim().charAt(0).toUpperCase() || '♫';
  if(url)photo.src=url;else photo.removeAttribute('src');
}
$('account-photo').onerror=()=>setAccountPhoto(null,accountName);
async function loadAccount() {
  if(accountPending===generation || !spotify.tokens())return;
  const version=generation;accountPending=version;
  const cached=spotify.accounts().find(account=>account.active);accountName=cached?.name || '';setAccountPhoto(cached?.image,accountName);
  $('account-name').textContent=cached && !cached.id.startsWith('pending:') && cached.id!=='legacy'?`Spotify · ${cached.name}`:'Loading Spotify account…';$('account-retry').hidden=true;
  try {
    const profile=await spotify.profile();if(version!==generation)return;
    accountName=profile.name;$('account-name').textContent=`Spotify · ${accountName}`;
    $('account-name').title=accountName;setAccountPhoto(profile.image,accountName);
  }catch {
    if(version!==generation)return;
    $('account-name').textContent=accountName?`Spotify · ${accountName}`:'Spotify · name unavailable';$('account-retry').hidden=false;
  }finally {if(accountPending===version)accountPending=null;}
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
  tick();
}
function tick() { playbackControls.update();const ms=position(current,receivedAt); $('elapsed').textContent=formatTime(ms); $('progress').max=current?.item?.duration_ms || 1; $('progress').value=ms; followLyrics(ms); }
async function poll() {
  clearTimeout(timer);
  if(busy===generation || !connected()) return;
  if(Date.now()<blockedUntil) { timer=setTimeout(poll,blockedUntil-Date.now()); return; }
  const version=generation;busy=version; let delay=5000;
  try {
    const data=await spotify.nowPlaying();
    if(version!==generation) return;
    render(data); failures=0; notice(); $('connection').textContent='Connected · updates automatically';
  } catch(error) {
    if(version!==generation) return;
    notice(error.name==='TimeoutError' || error.name==='TypeError' ? 'Connection interrupted. Trying again automatically…' : error.message);
    $('connection').textContent='Waiting for connection';
    if(!spotify.tokens()) { connected(); return; }
    delay=error.retryMs || Math.min(60000,5000*2**Math.min(++failures,4)); blockedUntil=Date.now()+delay;
  } finally { if(busy===version)busy=null; if(version===generation && spotify.tokens()) timer=setTimeout(poll,document.hidden?Math.max(delay,15000):delay); }
}
async function connectSpotify(switchAccount=false) {
  if($('connect').disabled)return;
  $('connect').disabled=true;
  try {await spotify.login(switchAccount);}catch(error){notice(error.message);}
  finally {$('connect').disabled=false;}
}
function signOut(message='This account is signed out. Other saved accounts are available under Switch.') {
  generation++;clearTimeout(timer);blockedUntil=0;failures=0;
  spotify.disconnect();playbackControls.reset();editor.close();timingEditor.close();current=null;render(null);connected();
  $('account-name').removeAttribute('title');notice(message);$('connect').focus();$('connection').textContent='Made for listening.';
}
$('connect').onclick=()=>connectSpotify();
$('disconnect').onclick=()=>signOut();
$('switch-account').onclick=openAccounts;

const picker=document.createElement('div');picker.className='account-picker';picker.hidden=true;picker.setAttribute('role','dialog');picker.setAttribute('aria-modal','true');picker.setAttribute('aria-labelledby','picker-title');
const panel=document.createElement('section');panel.className='account-picker-panel';
const pickerTitle=document.createElement('h2');pickerTitle.id='picker-title';pickerTitle.textContent='Spotify accounts';
const pickerHelp=document.createElement('p');pickerHelp.textContent='Choose an account to follow. Connections are remembered on this device.';
const accountList=document.createElement('div');accountList.className='saved-accounts';
const addAccount=document.createElement('button');addAccount.textContent='Add account';
const closePicker=document.createElement('button');closePicker.className='quiet';closePicker.textContent='Close';
panel.append(pickerTitle,pickerHelp,accountList,addAccount,closePicker);picker.append(panel);document.body.append(picker);
function hideAccounts(){picker.hidden=true;$('switch-account').focus();}
function openAccounts(){
  accountList.replaceChildren();
  for(const account of spotify.accounts()){
    const row=document.createElement('div');row.className='saved-account';
    const choose=document.createElement('button');choose.className='account-choice';
    const avatar=document.createElement('span');avatar.className='account-avatar';avatar.setAttribute('aria-hidden','true');avatar.textContent=account.name.charAt(0).toUpperCase() || '♫';
    if(account.image){const initial=avatar.textContent;avatar.textContent='';const image=document.createElement('img');image.src=account.image;image.alt='';image.onerror=()=>{image.remove();avatar.textContent=initial;};avatar.append(image);}
    const label=document.createElement('span');label.textContent=account.name;
    const status=document.createElement('small');status.textContent=account.needsLogin?'Reconnect':account.active?'Selected':'Switch to account';
    choose.append(avatar,label,status);choose.setAttribute('aria-label',account.name+' · '+status.textContent);
    choose.onclick=()=>{hideAccounts();if(account.needsLogin){notice('Choose this account on Spotify; use “Not you?” if needed.');connectSpotify(true);}else chooseAccount(account.id);};
    const remove=document.createElement('button');remove.className='quiet';remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+account.name);
    remove.onclick=()=>{const active=account.active;spotify.removeAccount(account.id);if(active)resetAccountView();connected();openAccounts();};
    row.append(choose,remove);accountList.append(row);
  }
  picker.hidden=false;(accountList.querySelector('button') || addAccount).focus();
}
function resetAccountView(){playbackControls.reset();generation++;clearTimeout(timer);blockedUntil=0;failures=0;editor.close();timingEditor.close();current=null;render(null);accountPending=null;accountName='';setAccountPhoto();connected();}
function chooseAccount(id){spotify.selectAccount(id);resetAccountView();notice();loadAccount();poll();}
addAccount.onclick=()=>{hideAccounts();notice('Choose “Not you?” on Spotify to add a different account.');connectSpotify(true);};
closePicker.onclick=hideAccounts;
picker.addEventListener('click',event=>{if(event.target===picker)hideAccounts();});
picker.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();hideAccounts();}else if(event.key==='Tab'){const buttons=[...picker.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}}});

$('art').onerror=()=>{ $('art').hidden=true; $('art-placeholder').hidden=false; };
document.addEventListener('visibilitychange',()=>{if(!document.hidden) poll();});
window.addEventListener('online',()=>poll());
setInterval(tick,250);
async function init() {
  const params=new URLSearchParams(location.search);
  try{if(params.get('source')==='spotify'){localStorage.setItem('companion.last-source','spotify');history.replaceState({},'',location.pathname);}else if(!params.has('code') && !params.has('error') && location.pathname!=='/callback' && localStorage.getItem('companion.last-source')==='youtube'){location.replace(new URL('./youtube.html',import.meta.url).href);return;}}catch{}

  if(location.pathname==='/callback' || new URLSearchParams(location.search).has('code') || new URLSearchParams(location.search).has('error')) {
    $('connect').disabled=true; notice('Connecting to Spotify…');
    try { await spotify.callback(new URLSearchParams(location.search)); notice(); } catch(error) { notice(error.message); }
    finally { history.replaceState({},'',new URL('./',import.meta.url).pathname); $('connect').disabled=false; }
  }
  if(connected()){loadAccount();poll();}
}
init();
