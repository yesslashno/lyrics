export function controlAvailability(data,fresh=true){const device=data?.device,disallows=data?.actions?.disallows || data?.actions || {};const ready=!!device?.id && !device.is_restricted && fresh;return {ready,volume:ready && device.supports_volume===true && Number.isFinite(device.volume_percent),play:ready && !(data?.is_playing?disallows.pausing:disallows.resuming),previous:ready && !disallows.skipping_prev,next:ready && !disallows.skipping_next};}
export function createSpotifyControls({spotify,readPlayback,onEnable,onRefresh}){
 const $=id=>document.getElementById(id);let command=null,listRequest=null,pendingDevice=null;
 const identity=()=>spotify.accountState().activeId;
 function update(){const {data,fresh}=readPlayback();if(pendingDevice && data?.device?.id===pendingDevice.id)pendingDevice=null;if(pendingDevice && Date.now()-pendingDevice.started>15000){pendingDevice=null;$('control-status').textContent='Speaker change was not confirmed. Refresh devices and check Spotify.';}const enabled=spotify.canControl(),available=controlAvailability(data,fresh),device=data?.device;
  $('enable-controls').hidden=enabled;$('transport').hidden=!enabled;$('device-picker').hidden=!enabled;$('volume-controls').hidden=!enabled;
  $('device-name').textContent=pendingDevice?'Switching speaker…':device?.name || 'Choose speaker';
  const locked=command!==null || pendingDevice!==null;
  $('play-pause').textContent=data?.is_playing?'Pause':'Play';
  for(const [id,allowed] of [['play-pause',available.play],['previous-track',available.previous],['next-track',available.next]])$(id).disabled=locked || !allowed;
  $('volume').disabled=locked || !available.volume;
  if(document.activeElement!==$('volume') && !locked){$('volume').value=Number.isFinite(device?.volume_percent)?device.volume_percent:0;$('volume-value').textContent=Number.isFinite(device?.volume_percent)?device.volume_percent+'%':'—';}
  $('volume-help').textContent=pendingDevice?'Waiting for Spotify to confirm the new speaker…':!device?'Start Spotify on a speaker, then choose it here.':device.is_restricted?'Spotify restricts controls on this device.':device.supports_volume!==true?'This speaker does not expose volume control through Spotify.':!fresh?'Waiting for current speaker information…':'';
 }
 async function run(action,deviceId,value){if(command)return;const ticket={id:identity(),generation:spotify.generation};command=ticket;if(action==='transfer')pendingDevice={id:deviceId,started:Date.now()};update();$('control-status').textContent='Sending command…';
  try{await spotify.control(action,deviceId,value);if(ticket.id!==identity() || ticket.generation!==spotify.generation)return;$('control-status').textContent='Command sent.';if(action==='transfer')$('device-picker').open=false;setTimeout(()=>{if(ticket.id===identity() && ticket.generation===spotify.generation)onRefresh();},700);}
  catch(error){if(ticket.id===identity() && ticket.generation===spotify.generation){if(action==='transfer')pendingDevice=null;$('control-status').textContent=error.name==='AbortError'?'No confirmation from Spotify. Check the speaker before trying again.':error.message;onRefresh();}}
  finally{if(command===ticket)command=null;update();}
 }
 async function devices(){const id=identity(),version=spotify.generation;if(listRequest?.id===id && listRequest?.version===version)return;const ticket={id,version};listRequest=ticket;$('device-list').replaceChildren();$('device-status').textContent='Finding speakers…';$('refresh-devices').disabled=true;
  try{const list=await spotify.devices();if(id!==identity() || version!==spotify.generation)return;
   $('device-status').textContent=list.length?'Choose where this account should play.':'No devices available. Start Spotify on an Echo or in the Spotify app, then refresh.';
   for(const device of list){const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent=device.name+(device.is_active?' · Playing here':'')+(device.is_restricted?' · Restricted':'');button.disabled=!device.id || device.is_restricted;button.onclick=()=>run('transfer',device.id,readPlayback().data?.is_playing);$('device-list').append(button);}
  }catch(error){if(id===identity() && version===spotify.generation)$('device-status').textContent=error.message;}
  finally{if(listRequest===ticket){listRequest=null;$('refresh-devices').disabled=false;}}
 }
 $('enable-controls').onclick=onEnable;$('device-picker').addEventListener('toggle',()=>{if($('device-picker').open)devices();});$('refresh-devices').onclick=devices;
 $('previous-track').onclick=()=>run('previous',readPlayback().data?.device?.id);
 $('next-track').onclick=()=>run('next',readPlayback().data?.device?.id);
 $('play-pause').onclick=()=>run(readPlayback().data?.is_playing?'pause':'play',readPlayback().data?.device?.id);
 $('volume').oninput=()=>$('volume-value').textContent=$('volume').value+'%';
 $('volume').onchange=()=>{if(!controlAvailability(readPlayback().data,readPlayback().fresh).volume)return;run('volume',readPlayback().data.device.id,Number($('volume').value));};
 return {update,reset(){command=null;listRequest=null;pendingDevice=null;$('device-picker').open=false;$('device-list').replaceChildren();$('control-status').textContent='';$('device-status').textContent='';$('refresh-devices').disabled=false;update();}};
}
