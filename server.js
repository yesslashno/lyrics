import {handleRelay} from './publish-relay.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('./', import.meta.url);
const files = Object.fromEntries(['youtube.html','youtube-app.js','youtube-style.css','youtube-model.js','lyrics-timing.js','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png','youtube-firefox-extension.zip'].map(name=>['/'+name,name]));
Object.assign(files,{'/':'index.html','/callback':'index.html','/app.js':'app.js','/spotify.js':'spotify.js','/lyrics.js':'lyrics.js','/validate-lyrics.js':'validate-lyrics.js','/lyrics-editor.js':'lyrics-editor.js','/style.css':'style.css','/publish.js':'publish.js','/publish-worker.js':'publish-worker.js','/sha256.js':'sha256.js','/publish-config.js':'publish-config.js'});
http.createServer(async (req,res) => {
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname.startsWith('/api/lrclib/')) {
    let body='';for await(const chunk of req){body+=chunk;if(body.length>150000){res.writeHead(413);res.end('Submission too large');return;}}
    const request=new Request('http://127.0.0.1:5173'+pathname,{method:req.method,headers:req.headers,...(req.method==='POST'?{body}: {})});
    const response=await handleRelay(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  const path=files[pathname];
  if (!path || !['GET','HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(path,root));
    res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':path.endsWith('.zip')?'application/zip':path.endsWith('.webmanifest')?'application/manifest+json':'text/html','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Unable to load app'); }
}).listen(5173,'127.0.0.1',()=>console.log('Spotify Companion: http://127.0.0.1:5173'));
