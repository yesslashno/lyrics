import http from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('./', import.meta.url);
const files = {'/':'index.html','/callback':'index.html','/app.js':'app.js','/spotify.js':'spotify.js','/lyrics.js':'lyrics.js','/style.css':'style.css'};
http.createServer(async (req,res) => {
  const path = files[new URL(req.url,'http://127.0.0.1').pathname];
  if (!path || !['GET','HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(path,root));
    res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Unable to load app'); }
}).listen(5173,'127.0.0.1',()=>console.log('Spotify Companion: http://127.0.0.1:5173'));
