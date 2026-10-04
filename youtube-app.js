import {createScreensaver} from './screensaver.js';
import {parseLrc,activeLine} from './lyrics.js';
import {inferSong,defaultLyricsResult,lyricText,playbackPosition} from './youtube-model.js';
const $=id=>document.getElementById(id);
try{localStorage.setItem('companion.last-source','youtube');}catch{}
import {createLyricsEditor} from './lyrics-editor.js?v=youtube-2';
import {createTimingEditor,savedTimings,timingKey} from './lyrics-timing.js?v=youtube-1';
const API='https://lyrics-youtube.hunkyard-dog.workers.dev/api',STORAGE='companion.youtube.pair';
const valid=value=>/^[a-f0-9]{48}$/.test(value || '');
let pair;try{pair=JSON.parse(localStorage.getItem(STORAGE)) || {};}catch{pair={};}
if(!valid(pair.readToken))pair={};
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('pair')){const readToken=fragment.get('pair');pair=valid(readToken)?(pair.readToken===readToken?pair:{readToken}):{};history.replaceState({},'',location.pathname);savePair();}
let token=pair.readToken || '',playback=null,age=0,receivedAt=performance.now(),videoId='',videoKey='',searchAbort,results=[],selected=null,fetching=false,lines=[],nodes=[],lastLine=-2,followingLyrics=true;
const screensaver=createScreensaver({isPlaying:()=>!!token && !!playback && !playback.paused && age+performance.now()-receivedAt<8000});
const remembered=new Map();
function savePair(){try{localStorage.setItem(STORAGE,JSON.stringify(pair));}catch{$('pair-status').textContent='This browser cannot remember pairing. Keep this page open.';}}
function pairing(){const paired=!!token;$('pairing').hidden=paired;$('screen').hidden=!paired;$('pair-details').hidden=!paired;const writer=valid(pair.writeToken);$('writer-setup').hidden=!writer;$('read-only-setup').hidden=writer;if(writer)$('write-code').value=pair.writeToken;if(paired)$('viewer-link').value=location.origin+location.pathname+'#pair='+token;}
async function api(path,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);try{return await fetch(API+path,{...options,signal:controller.signal});}finally{clearTimeout(timer);}}
$('create-pair').onclick=async()=>{const button=$('create-pair');button.disabled=true;$('pair-status').textContent='Creating pairing…';try{const response=await api('/session',{method:'POST'}),data=await response.json();if(!response.ok)throw new Error(data.error || 'Couldn’t create pairing.');stopDevice();pair=data;token=pair.readToken;savePair();pairing();$('pair-details').open=true;$('writer-setup').open=true;$('pair-status').textContent='';poll();}catch(error){$('pair-status').textContent=error.name==='AbortError'?'Connection timed out. Try again.':error.message;}finally{button.disabled=false;}};
$('pair-form').onsubmit=event=>{event.preventDefault();const value=$('pair-code').value.trim();let readToken=value;try{readToken=new URL(value).hash.slice(6);}catch{}if(!valid(readToken)){$('pair-code').setCustomValidity('Paste the complete screen link from the laptop.');$('pair-code').reportValidity();return;}stopDevice();pair={readToken};token=readToken;savePair();$('pair-code').value='';pairing();poll();};
let deviceTicket=null,deviceTimer,deviceBusy=null,deviceVersion=0;
try{const saved=JSON.parse(localStorage.getItem('companion.youtube.device'));if(saved?.expiresAt>Date.now() && valid(saved.pollToken))deviceTicket=saved;}catch{}
function stopDevice(){deviceVersion++;clearTimeout(deviceTimer);const previous=deviceTicket;deviceTicket=null;try{localStorage.removeItem('companion.youtube.device');}catch{}$('device-screen').hidden=true;if(previous)api('/device/status',{method:'DELETE',headers:{Authorization:'Bearer '+previous.pollToken}}).catch(()=>{});}
function displayDevice(){if(!deviceTicket)return;$('device-screen').hidden=false;$('device-code').textContent=deviceTicket.code.slice(0,3)+' '+deviceTicket.code.slice(3);$('device-status').textContent='On the laptop’s YouTube companion page, open Connect an iPad and enter this code. It expires in five minutes.';}
async function waitForDevice(){
 if(!deviceTicket || deviceBusy===deviceTicket || token)return;
 const ticket=deviceTicket,version=deviceVersion;deviceBusy=ticket;
 try{if(Date.now()>=ticket.expiresAt)throw new Error('Code expired. Tap Connect this iPad for a new code.');
  const response=await api('/device/status',{headers:{Authorization:'Bearer '+ticket.pollToken}}),data=await response.json();if(version!==deviceVersion)return;
  if(!response.ok)throw new Error(data.error || 'Couldn’t connect this screen.');
  if(valid(data.readToken)){pair={readToken:data.readToken,expiresAt:data.expiresAt};token=pair.readToken;savePair();stopDevice();pairing();$('pair-status').textContent='';poll();return;}
  $('device-status').textContent='Waiting for the laptop… '+Math.ceil((ticket.expiresAt-Date.now())/60000)+' min remaining.';
 }catch(error){if(version!==deviceVersion)return;$('device-status').textContent=error.message;}
 finally{if(deviceBusy===ticket)deviceBusy=null;if(deviceTicket===ticket && version===deviceVersion && Date.now()<ticket.expiresAt)deviceTimer=setTimeout(waitForDevice,2000);}
}
$('start-device').onclick=async()=>{stopDevice();const version=deviceVersion,button=$('start-device');button.disabled=true;$('pair-status').textContent='Creating iPad code…';
 try{const response=await api('/device/start',{method:'POST'}),data=await response.json();if(version!==deviceVersion)return;if(!response.ok)throw new Error(data.error || 'Couldn’t create a code.');deviceTicket=data;try{localStorage.setItem('companion.youtube.device',JSON.stringify(data));}catch{}$('pair-status').textContent='';displayDevice();waitForDevice();}catch(error){if(version===deviceVersion)$('pair-status').textContent=error.message;}finally{button.disabled=false;}
};
$('cancel-device').onclick=stopDevice;
$('approve-device').onsubmit=async event=>{event.preventDefault();const code=$('approve-code').value.trim(),pairToken=token,button=$('approve-submit');button.disabled=true;$('approve-status').textContent='Connecting iPad…';try{const response=await api('/device/approve',{method:'POST',headers:{Authorization:'Bearer '+pairToken,'Content-Type':'application/json'},body:JSON.stringify({code})}),data=await response.json();if(pairToken!==token)return;if(!response.ok)throw new Error(data.error || 'Couldn’t connect.');$('approve-status').textContent='iPad connected. Its screen will open automatically.';$('approve-code').value='';}catch(error){$('approve-status').textContent=error.message;}finally{button.disabled=false;}};
if(deviceTicket && !token){displayDevice();waitForDevice();}
$('pair-code').oninput=()=>$('pair-code').setCustomValidity('');
for(const [button,input] of [['copy-code','write-code'],['copy-link','viewer-link']])$(button).onclick=async()=>{try{await navigator.clipboard.writeText($(input).value);$(button).textContent='Copied';}catch{$(input).select();$(button).textContent='Select and copy';}};
$('unpair').onclick=async()=>{const old=token;$('unpair').disabled=true;try{const response=await api('/playback',{method:'DELETE',headers:{Authorization:'Bearer '+old}});if(!response.ok && response.status!==401)throw new Error();if(token!==old)return;resetPair();}catch{$('connection').textContent='Couldn’t disconnect. Check the connection and try again.';}finally{$('unpair').disabled=false;}};
function resetPair(){stopDevice();pair={};token='';savePair();searchAbort?.abort();timingEditor.close();publisher.close();playback=null;videoId='';videoKey='';remembered.clear();clearLyrics();pairing();}
function trackFor(result){return {id:'lrclib:'+result.id,type:'track',name:result.trackName,artists:[{name:result.artistName}],album:{name:result.albumName || ''},duration_ms:Math.round(result.duration*1000)};}
function applyTiming(track,value){if(track.id==='youtube:'+videoKey){chooseSong({id:'contribution:'+videoKey,trackName:track.name,artistName:track.artists[0].name,albumName:track.album.name,duration:track.duration_ms/1000,...value});return;}if(selected && timingKey(trackFor(selected))===timingKey(track)){selected={...selected,...value};chooseSong(selected);}}
const publisher=createLyricsEditor(applyTiming);
const timingEditor=createTimingEditor({readPlayback:()=>playback && selected?{mediaKey:videoKey+':'+selected.id,position:playbackPosition(playback,age,performance.now()-receivedAt),playing:!playback.paused,ad:playback.ad,stale:age+performance.now()-receivedAt>8000}:null,onSave:applyTiming,onPublish:(track,value)=>publisher.open(track,value)});
$('add-timing').onclick=()=>{if(selected)timingEditor.open(trackFor(selected),selected.plainLyrics);};
$('add-missing').onclick=()=>{if(!playback || playback.ad)return;const name=$('song-title').value.trim(),artist=$('song-artist').value.trim();publisher.open({id:'youtube:'+videoKey,type:'track',name,artists:[{name:artist}],album:{name:''},duration_ms:Math.round(playback.duration*1000)});};
pairing();
function time(seconds){const value=Math.max(0,Math.floor(seconds));return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');}
function clearLyrics(){selected=null;lines=[];nodes=[];lastLine=-2;followingLyrics=true;$('follow-lyrics').hidden=true;$('add-timing').hidden=true;$('add-missing').hidden=true;document.body.classList.remove('is-synced');$('lyrics-scroll').replaceChildren();$('lyrics-status').textContent='Lyrics appear once a song is matched.';}
function chooseSong(result){
  const own=savedTimings(trackFor(result),result.plainLyrics || '');if(own)result={...result,...own};
  $('add-timing').hidden=!(Number.isFinite(result.duration) && result.duration>0) || !result.plainLyrics || result.instrumental || (!!result.syncedLyrics && !own);$('add-timing').textContent=own?'Edit timing':'Add timing';
  $('add-missing').hidden=true;
  selected=result;remembered.set(videoKey,result);if(remembered.size>50)remembered.delete(remembered.keys().next().value);
  lines=parseLrc(result.syncedLyrics || '');lastLine=-2;followingLyrics=true;$('follow-lyrics').hidden=true;document.body.classList.toggle('is-synced',!!lines.length);
  $('lyrics-status').textContent=result.artistName+' · '+result.trackName+' — '+(result.instrumental?'Instrumental':lines.length?'Synced lyrics · following the video':'Plain lyrics · scroll at your own pace');
  const texts=lines.length?lines.map(line=>line.text):lyricText(result).split(/\r?\n/);
  nodes=texts.map(text=>{const node=document.createElement('p');node.className='lyric-line';node.textContent=text || ' ';return node;});$('lyrics-scroll').replaceChildren(...nodes);$('lyrics-scroll').scrollTop=0;
  for(const [i,button] of [...$('results').children].entries())button.setAttribute('aria-pressed',String(results[i].id===result.id));
  $('matching').open=false;tick();
}
async function searchLyrics(){
  searchAbort?.abort();const controller=new AbortController();searchAbort=controller;const target=videoKey;const song={title:$('song-title').value.trim(),artist:$('song-artist').value.trim()};
  if(!song.title)return;clearLyrics();
  $('search-status').textContent='Finding lyrics…';$('results').replaceChildren();$('search').disabled=true;
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch('https://lrclib.net/api/search?'+new URLSearchParams({q:[song.artist,song.title].filter(Boolean).join(' ')}),{signal:controller.signal});
    if(!response.ok)throw new Error(response.status===429?'Lyrics service is busy. Wait a little before retrying.':'Couldn’t search lyrics. Try again.');
    const data=await response.json();if(target!==videoKey || controller!==searchAbort)return;
    results=Array.isArray(data)?data.slice(0,20):[];
    const available=results.filter(value=>value.syncedLyrics || value.plainLyrics || value.instrumental);results=available;
    for(const result of results){const button=document.createElement('button');button.type='button';button.className='result';button.textContent=result.artistName+' · '+result.trackName;button.setAttribute('aria-pressed',String(selected?.id===result.id));button.onclick=()=>chooseSong(result);$('results').append(button);}
    const found=defaultLyricsResult(results,song);
    $('search-status').textContent=found?'Lyrics loaded. Choose another result if the song is wrong.':'No lyrics found. Try correcting the song title and artist.';
    if(found)chooseSong(found);else {$('matching').open=true;$('add-missing').hidden=false;$('lyrics-status').textContent='No lyrics found. You can add them for this recording.';}
  }catch(error){if(controller!==searchAbort || target!==videoKey)return;$('search-status').textContent=error.name==='AbortError'?'Search timed out. Try again.':error.message;}
  finally{clearTimeout(timer);if(controller===searchAbort){$('search').disabled=false;if(playback && !selected)$('add-missing').hidden=false;}} 
}
function pauseFollowing(){if(!lines.length)return;followingLyrics=false;$('follow-lyrics').hidden=false;scroll.scrollTo({top:scroll.scrollTop,behavior:'auto'});}
const scroll=$('lyrics-scroll');
for(const event of ['wheel','touchstart','pointerdown'])scroll.addEventListener(event,pauseFollowing,{passive:true});
scroll.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))pauseFollowing();});
$('follow-lyrics').onclick=()=>{followingLyrics=true;$('follow-lyrics').hidden=true;lastLine=-2;tick();};
window.addEventListener('resize',()=>{lastLine=-2;tick();});
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{lastLine=-2;tick();}).observe(scroll);
$('search-form').onsubmit=event=>{event.preventDefault();searchLyrics();};
async function poll(){
  if(!token || fetching)return;fetching=true;const pairingToken=token;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetch(API+'/playback',{headers:{Authorization:'Bearer '+pairingToken},signal:controller.signal});
    if(pairingToken!==token)return;
    if(response.status===401){resetPair();$('pair-status').textContent='Pairing expired or disconnected. Create a new pairing on your laptop.';return;}
    if(!response.ok)throw new Error('YouTube connection unavailable.');
    const data=await response.json();if(pairingToken!==token)return;
    age=data.ageMs || 0;receivedAt=performance.now();
    if(data.playback && !data.playback.paused && age<8000)screensaver.activity();
    if(!data.playback){playback=null;searchAbort?.abort();videoId='';videoKey='';clearLyrics();$('results').replaceChildren();$('video-title').textContent='Open a music video.';$('channel').textContent='Use “Follow this tab” in the Firefox extension.';$('state').textContent='WAITING FOR YOUTUBE';$('connection').textContent='Paired · waiting for your chosen tab';$('video-link').hidden=true;return;}
    // Advertisements can replace the video element's clock. Hold the last song and lyrics.
    if(data.playback.ad){if(playback)playback={...playback,ad:true};$('state').textContent='ADVERTISEMENT';$('connection').textContent='YouTube ad · keeping the song lyrics open';return;}
    playback=data.playback;
    $('video-title').textContent=playback.title;$('channel').textContent=playback.channel;
    $('video-link').hidden=false;$('video-link').href='https://www.youtube.com/watch?v='+playback.videoId;
    $('state').textContent=age>8000?'CONNECTION PAUSED':playback.paused?'PAUSED':'NOW PLAYING · YOUTUBE';
    $('connection').textContent=age>8000?'Waiting for Firefox. Keep the laptop awake and the video tab open.':'Paired · follows play, pause and seeking';
    const nextKey=JSON.stringify([playback.videoId,playback.title,playback.channel]);
    if(videoKey!==nextKey){
      videoId=playback.videoId;videoKey=nextKey;clearLyrics();$('results').replaceChildren();$('search-status').textContent='';
      const song=inferSong(playback.title,playback.channel);$('song-title').value=song.title;$('song-artist').value=song.artist;
      const stored=remembered.get(videoKey);if(stored){searchAbort?.abort();chooseSong(stored);}else searchLyrics();
    }
    tick();
  }catch{$('connection').textContent='Can’t reach YouTube pairing. Check the internet connection; retrying automatically.';}
  finally{clearTimeout(timer);fetching=false;}
}
function tick(){
  if(!playback)return;
  const elapsed=performance.now()-receivedAt;
  if(playback.ad)return;
  $('position').textContent=time(playbackPosition(playback,age,elapsed)/1000);$('duration').textContent=time(playback.duration);
  if(age+elapsed>8000){$('state').textContent='CONNECTION PAUSED';$('connection').textContent='Waiting for Firefox. Keep the laptop awake and the video tab open.';}

  if(!lines.length)return;const index=activeLine(lines,playbackPosition(playback,age,elapsed));if(index===lastLine)return;lastLine=index;
  nodes.forEach((node,i)=>{node.classList.toggle('active',i===index);if(i===index)node.setAttribute('aria-current','true');else node.removeAttribute('aria-current');});
  const node=nodes[index];
  if(node && followingLyrics){
    const lineBox=node.getBoundingClientRect(),scrollBox=scroll.getBoundingClientRect();
    const top=scroll.scrollTop+lineBox.top-scrollBox.top-scroll.clientTop-scroll.clientHeight/2+lineBox.height/2;
    scroll.scrollTo({top:Math.max(0,top),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }

}
setInterval(poll,2000);setInterval(tick,250);poll();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
