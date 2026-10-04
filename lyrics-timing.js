export function timingKey(track){return JSON.stringify([track.name,track.artists?.[0]?.name,track.album?.name,track.duration_ms]);}
export function timingLines(plain){return plain.split(/\r?\n/).map(line=>line.trim()).filter(line=>line && !/^\[[^\]]+\]$/.test(line));}
export function lrcTimestamp(ms){const centiseconds=Math.round(ms/10),seconds=Math.floor(centiseconds/100);return `[${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}.${String(centiseconds%100).padStart(2,'0')}]`;}
export function timedLyrics(plain,times,duration){
 const lines=timingLines(plain);if(!Number.isFinite(duration) || duration<=0 || !lines.length || times.length!==lines.length || times.some(time=>!Number.isFinite(time) || time<0 || time>duration))throw new Error('Time every lyric line before saving. Keep each time within the song.');
 if(times.some((time,i)=>i>0 && time<times[i-1]))throw new Error('Times must move forward. Adjust a time or undo a tap.');
 return {plainLyrics:plain.trim(),syncedLyrics:lines.map((line,i)=>lrcTimestamp(times[i])+line).join('\n'),instrumental:false};
}
const STORAGE='companion.lyric-timings';
function drafts(){try{const value=JSON.parse(localStorage.getItem(STORAGE));return value && typeof value==='object' && !Array.isArray(value)?value:{};}catch{return {};}}
export function savedTimings(track,plain){const draft=drafts()[timingKey(track)];if(!draft?.complete || draft.plain?.trim()!==plain.trim())return null;try{return timedLyrics(plain,draft.times,track.duration_ms);}catch{return null;}}
export function createTimingEditor({readPlayback,onSave,onPublish}){
 const overlay=document.createElement('div');overlay.className='lyrics-editor-overlay';overlay.hidden=true;
 overlay.innerHTML=`<section class="lyrics-editor timing-editor" role="dialog" aria-modal="true" aria-labelledby="timing-title"><div class="editor-heading"><h2 id="timing-title">Add lyric timing</h2><button id="timing-close" class="quiet" aria-label="Close timing editor">Close</button></div><p id="timing-track"></p><p class="editor-help">Play the song. Tap Next line as each lyric starts, or press Space on a keyboard. Tap a line to retime it; you can also edit its time in seconds.</p><p id="timing-clock" role="status"></p><div class="timing-transport"><button id="timing-next" class="primary">Next line</button><button id="timing-undo" class="quiet">Undo</button><button id="timing-reset" class="quiet">Start again</button></div><ol id="timing-lines"></ol><p id="timing-error" role="alert"></p><p class="editor-help">Saved drafts stay on this device. Publish only when these times match the named song recording; video intros or edits can change the timing.</p><div class="editor-actions"><button id="timing-export" class="quiet">Download LRC</button><button id="timing-publish" class="quiet">Review & publish</button><button id="timing-save" class="primary">Use these timings</button></div></section>`;
 document.body.append(overlay);const find=id=>overlay.querySelector('#'+id);
 let track,plain,lines=[],times=[],history=[],mediaKey,previousFocus,complete=false,interval;
 function persist(){const all=drafts(),key=timingKey(track);delete all[key];all[key]={plain,times,complete};const entries=Object.entries(all).slice(-30);try{localStorage.setItem(STORAGE,JSON.stringify(Object.fromEntries(entries)));}catch{find('timing-error').textContent='Device storage is full. Download the LRC to keep your work.';}}
 function push(){history.push(times.slice());if(history.length>100)history.shift();complete=false;}
 function redraw(){
  const cursor=times.findIndex(time=>time===null);
  find('timing-next').disabled=cursor<0;
  find('timing-next').textContent=cursor<0?'All lines timed':`Next line (${cursor+1}/${lines.length})`;
  find('timing-undo').disabled=!history.length;
  for(const [i,row] of [...find('timing-lines').children].entries()){row.classList.toggle('timing-current',i===cursor);const input=row.querySelector('input');if(document.activeElement!==input)input.value=times[i]===null?'':(times[i]/1000).toFixed(2);row.querySelector('.timing-stamp').textContent=times[i]===null?'—':lrcTimestamp(times[i]);}
  for(const id of ['timing-save','timing-export','timing-publish'])find(id).disabled=cursor>=0;
 }
 function capture(index){
  const playback=readPlayback();if(!playback || playback.mediaKey!==mediaKey){find('timing-error').textContent='The song changed. Return to this recording before adding more times.';return;}
  if(playback.ad){find('timing-error').textContent='Wait for the advertisement to finish.';return;}
  if(playback.stale){find('timing-error').textContent='Playback is not updating. Check the connection before timing.';return;}
  const time=playback.position;if(!Number.isFinite(time) || time<0 || time>track.duration_ms){find('timing-error').textContent='This time is outside the named song recording.';return;}
  push();times[index]=Math.round(time/10)*10;find('timing-error').textContent='';persist();redraw();
  const next=times.findIndex(time=>time===null);const row=find('timing-lines').children[next];if(row)row.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 function value(){return timedLyrics(plain,times,track.duration_ms);}
 function close(){clearInterval(interval);overlay.hidden=true;document.body.classList.remove('editing-lyrics');previousFocus?.focus();}
 find('timing-close').onclick=close;
 find('timing-next').onclick=()=>{const index=times.findIndex(time=>time===null);if(index>=0)capture(index);};
 find('timing-undo').onclick=()=>{if(!history.length)return;times=history.pop();complete=false;persist();redraw();};
 find('timing-reset').onclick=()=>{push();times=lines.map(()=>null);persist();redraw();};
 find('timing-save').onclick=()=>{try{const result=value();complete=true;persist();onSave(track,result);close();}catch(error){find('timing-error').textContent=error.message;}};
 find('timing-publish').onclick=()=>{try{const result=value();close();onPublish(track,result);}catch(error){find('timing-error').textContent=error.message;}};
 find('timing-export').onclick=()=>{try{const result=value(),url=URL.createObjectURL(new Blob([result.syncedLyrics+'\n'],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download=(track.name.replace(/[^\w -]/g,'').trim() || 'lyrics')+'.lrc';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){find('timing-error').textContent=error.message;}};
 overlay.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close();return;}
  if(event.code==='Space' && !event.repeat && (event.target===find('timing-next') || !event.target.closest('input,button'))){event.preventDefault();find('timing-next').click();}
  if(event.key==='Tab'){const nodes=[...overlay.querySelectorAll('button,input')].filter(node=>node.getClientRects().length && !node.disabled);const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}}
 });
 return {close,open(target,text){
  if(!target || !text?.trim())return;
  track=JSON.parse(JSON.stringify(target));plain=text;lines=timingLines(plain);if(!lines.length)return;
  const draft=drafts()[timingKey(track)];times=draft?.plain===plain && draft.times?.length===lines.length?draft.times.map(t=>Number.isFinite(t) && t>=0 && t<=track.duration_ms?t:null):lines.map(()=>null);complete=!!draft?.complete;history=[];mediaKey=readPlayback()?.mediaKey;previousFocus=document.activeElement;
  find('timing-track').textContent=track.name+' · '+(track.artists?.[0]?.name || '')+' · '+(track.album?.name || '');find('timing-error').textContent='';
  find('timing-lines').replaceChildren(...lines.map((text,i)=>{const row=document.createElement('li'),tap=document.createElement('button'),input=document.createElement('input'),stamp=document.createElement('span');tap.type='button';tap.className='timing-line';tap.textContent=text;tap.setAttribute('aria-label',`Time line ${i+1}: ${text}`);tap.onclick=()=>capture(i);input.type='number';input.min='0';input.max=String(track.duration_ms/1000);input.step='0.01';input.placeholder='seconds';input.setAttribute('aria-label',`Seconds for line ${i+1}`);input.oninput=()=>{push();times[i]=input.value===''?null:Number(input.value)*1000;persist();redraw();};stamp.className='timing-stamp';row.append(tap,input,stamp);return row;}));
  function clock(){const state=readPlayback();find('timing-clock').textContent=state?.mediaKey===mediaKey?(state.ad?'Advertisement':state.stale?'Waiting for playback…':`${state.playing?'Playing':'Paused'} · ${lrcTimestamp(state.position)}`):'Song changed · return to this recording to continue.';}
  clearInterval(interval);clock();interval=setInterval(clock,250);redraw();overlay.hidden=false;document.body.classList.add('editing-lyrics');find('timing-next').focus();
 }};
}
