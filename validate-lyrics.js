import {parseLrc} from './lyrics.js';
export function validateLyrics(track,plain,synced) {
    if(!track)throw new Error('Choose a song first.');
    plain=plain.trim();synced=synced.trim();
    if(!plain && !synced)throw new Error('Paste lyrics before publishing.');
    if(synced) {
      const rows=synced.split(/\r?\n/).filter(row=>row.trim() && !/^\[(ar|ti|al|by|offset):.*\]$/i.test(row.trim()));
      if(!rows.length || rows.some(row=>!/^\[\d+:\d{2}(?:\.\d{1,3})?\]/.test(row.trim()) || !parseLrc(row).length))throw new Error('Timed lyrics need a timestamp on every line, for example [00:12.50]Hello.');
      if(parseLrc(synced).some(line=>line.time>track.duration_ms))throw new Error('A timestamp is past the end of this song.');
      if(!plain)plain=parseLrc(synced).map(line=>line.text).join('\n');
    }
    const value={plainLyrics:plain,syncedLyrics:synced,instrumental:false,};
    return value;
}
