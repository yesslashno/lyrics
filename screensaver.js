export const IDLE_MS=20*60*1000;
// Only fresh playback samples count as activity; a lost connection must not
// keep an old playing flag alive forever. Wall time survives background sleep.
export function createIdleClock(now=Date.now,delay=IDLE_MS){
  let lastActivity=now();
  return {activity(){lastActivity=now();},idle(){return now()-lastActivity>=delay;}};
}
export function createScreensaver({isPlaying,now=Date.now,delay=IDLE_MS}={}){
  const clock=createIdleClock(now,delay);
  const cover=document.createElement('button');
  cover.type='button';cover.className='screensaver';cover.hidden=true;
  cover.setAttribute('aria-label','Idle screen. Tap to return to lyrics.');
  const mark=document.createElement('span');mark.className='screensaver-mark';
  const rings=document.createElement('span');rings.className='screensaver-rings';rings.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.textContent='LYRICS COMPANION';
  const hint=document.createElement('span');hint.className='screensaver-hint';hint.textContent='Tap to return';
  mark.append(rings,label);cover.append(mark,hint);document.body.append(cover);
  let previousFocus=null;
  function hide(){if(cover.hidden)return;cover.hidden=true;document.body.classList.remove('screensaver-open');if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
  function activity(){clock.activity();hide();}
  function check(){if(isPlaying()){activity();return;}if(!clock.idle() || !cover.hidden || document.hidden)return;previousFocus=document.activeElement;cover.hidden=false;document.body.classList.add('screensaver-open');cover.focus({preventScroll:true});}
  // Capture the first gesture so waking never clicks a control underneath.
  function interact(event){if(!cover.hidden){event.preventDefault();event.stopImmediatePropagation();}activity();}
  document.addEventListener('pointerdown',interact,true);
  if(!('PointerEvent' in window))document.addEventListener('touchstart',interact,{capture:true,passive:false});
  document.addEventListener('keydown',interact,true);
  document.addEventListener('wheel',interact,{capture:true,passive:false});
  cover.addEventListener('click',event=>{event.preventDefault();activity();});
  const timer=setInterval(check,1000);
  document.addEventListener('visibilitychange',check);
  return {activity,check,destroy(){clearInterval(timer);document.removeEventListener('pointerdown',interact,true);document.removeEventListener('touchstart',interact,true);document.removeEventListener('keydown',interact,true);document.removeEventListener('wheel',interact,true);document.removeEventListener('visibilitychange',check);hide();cover.remove();}};
}
