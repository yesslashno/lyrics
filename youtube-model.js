export function normalize(text=''){return text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
export function inferSong(title,channel='') {
  const clean=title.replace(/\([^)]*(official|video|lyrics|audio|hd|4k)[^)]*\)|\[[^\]]*(official|video|lyrics|audio|hd|4k)[^\]]*\]/gi,'').replace(/\s+(official music video|official video|official audio)\s*$/i,'').trim();
  const parts=clean.split(/\s+[-–—]\s+/);
  return parts.length>=2?{artist:parts.shift().trim(),title:parts.join(' - ').trim()}:{artist:channel.replace(/VEVO$|\s*-\s*Topic$/i,'').trim(),title:clean};
}
export function defaultLyricsResult(results,song) {
  const available=results.filter(value=>value.plainLyrics || value.syncedLyrics || value.instrumental);
  return available.find(value=>normalize(value.trackName)===normalize(song.title) && normalize(value.artistName)===normalize(song.artist)) || available.find(value=>normalize(value.trackName)===normalize(song.title)) || available[0];
}
export function lyricText(result) {
  if(result.plainLyrics?.trim())return result.plainLyrics.trim();
  return (result.syncedLyrics || '').split(/\r?\n/).filter(row=>!/^\s*\[(ar|ti|al|by|offset|re|ve|length):/i.test(row)).map(row=>row.replace(/\[\d+:\d{2}(?:\.\d{1,3})?\]/g,'').trim()).join('\n').trim();
}
export function playbackPosition(playback,ageMs,elapsedMs) {
  if(!playback || playback.ad)return 0;
  const advance=playback.paused?0:Math.min(8000,Math.max(0,ageMs+elapsedMs))/1000;
  return Math.max(0,Math.min(playback.duration,playback.position+advance))*1000;
}
