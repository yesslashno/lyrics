importScripts('./sha256.js');
onmessage=({data:{prefix,target}})=>{
  if(typeof prefix!=='string' || !/^[0-9a-f]{64}$/i.test(target)){postMessage({error:'Invalid publishing challenge. Please try again.'});return;}
  target=target.toLowerCase();const start=Date.now();
  for(let nonce=0;Date.now()-start<240000;nonce++) {
    if(sha256(prefix+String(nonce))<=target){postMessage({nonce:String(nonce)});return;}
    if(nonce%100000===0)postMessage({progress:true});
  }
  postMessage({error:'Publishing preparation timed out. Your lyrics are still here; try again.'});
};
