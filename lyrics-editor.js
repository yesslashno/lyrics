import {validateLyrics} from './validate-lyrics.js';
import {publishLyrics} from './publish.js';
export function createLyricsEditor(onSave) {
  const overlay=document.createElement('div');overlay.className='lyrics-editor-overlay';overlay.hidden=true;
  overlay.innerHTML=`<section class="lyrics-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title"><div class="editor-heading"><h2 id="editor-title">Add missing lyrics</h2><button type="button" class="quiet" id="editor-close" aria-label="Close lyrics editor">Close</button></div><p id="editor-track"></p><p class="editor-help">Publish these lyrics to LRCLIB’s public database so other listeners and your other devices can find them. Check the song and recording above before publishing.</p><form><div id="editor-metadata" hidden><label for="editor-song">Song title</label><input id="editor-song" required><label for="editor-artist">Artist</label><input id="editor-artist" required><label for="editor-duration">Recording length in seconds</label><input id="editor-duration" type="number" min="1" max="86400" step="0.01" required><p class="editor-help">Use the song recording’s length, excluding video intros, outros or edits.</p></div><label for="editor-album">Album / recording</label><input id="editor-album" required placeholder="Album this recording belongs to"><label for="editor-plain">Lyrics</label><textarea id="editor-plain" rows="8" placeholder="Paste the lyrics here, one line at a time."></textarea><details><summary>Optional: synchronized lyrics</summary><label for="editor-synced">Lyrics with timestamps (LRC format)</label><p class="editor-help">Use the timing for this recording, for example [00:12.50]First line. Without timestamps, lyrics display without highlighting.</p><textarea id="editor-synced" rows="6" placeholder="[00:12.50]First line&#10;[00:17.20]Next line"></textarea></details><p id="editor-error" role="alert"></p><div class="editor-actions"><button type="submit" class="primary">Publish to LRCLIB</button></div></form></section>`;
  document.body.append(overlay);
  const find=id=>overlay.querySelector('#'+id);
  let editingTrack,previousFocus,publishing,controller;
  function close() {controller?.abort();overlay.hidden=true;document.body.classList.remove('editing-lyrics');previousFocus?.focus();}
  find('editor-close').onclick=close;
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab') {
      const nodes=[...overlay.querySelectorAll('button,input,textarea,summary')].filter(node=>node.getClientRects().length && !node.disabled);
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  overlay.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    if(publishing)return;
    const custom=!find('editor-metadata').hidden;
    const target={...editingTrack,...(custom?{name:find('editor-song').value.trim(),artists:[{name:find('editor-artist').value.trim()}],duration_ms:Math.round(Number(find('editor-duration').value)*1000)}:{}),album:{...editingTrack.album,name:find('editor-album').value.trim()}};controller=new AbortController();const active=controller;
    const form=overlay.querySelector('form');
    try {
      // Validate without saving before a public submission succeeds.
      const value=validateLyrics(target,find('editor-plain').value,find('editor-synced').value);
      publishing=true;form.querySelectorAll('button,input,textarea').forEach(node=>node.disabled=true);
      await publishLyrics(target,value,{signal:active.signal,status:message=>{find('editor-error').textContent=message;}});
      if(active.signal.aborted)return;
      onSave(target,value);close();
    } catch(error){if(!active.signal.aborted)find('editor-error').textContent=error.message || 'Couldn’t publish. Your lyrics are still here; try again.';}
    finally {publishing=false;form.querySelectorAll('button,input,textarea').forEach(node=>node.disabled=false);for(const id of ['editor-song','editor-artist','editor-duration'])find(id).disabled=find('editor-metadata').hidden;}

  };
  return {close,open(track,initial={}){
    if(!track || publishing)return;
    // Capture this recording: a song change while editing never changes the save target.
    editingTrack=JSON.parse(JSON.stringify(track));previousFocus=document.activeElement;
    find('editor-title').textContent=initial.syncedLyrics?'Publish timed lyrics':'Add missing lyrics';
    find('editor-track').textContent=`${track.name} · ${track.artists?.map(a=>a.name).join(', ') || ''} · ${track.album?.name || ''}`;
    const custom=track.id?.startsWith('youtube:');find('editor-metadata').hidden=!custom;for(const id of ['editor-song','editor-artist','editor-duration'])find(id).disabled=!custom;find('editor-song').value=track.name;find('editor-artist').value=track.artists?.[0]?.name || '';find('editor-duration').value=track.duration_ms/1000;
    find('editor-album').value=track.album?.name || '';find('editor-album').readOnly=!!track.album?.name;
    find('editor-plain').value=initial.plainLyrics || '';find('editor-synced').value=initial.syncedLyrics || '';
    find('editor-error').textContent='';
    overlay.querySelector('details').open=!!initial.syncedLyrics;
    overlay.hidden=false;document.body.classList.add('editing-lyrics');find('editor-plain').focus();
  }};
}
