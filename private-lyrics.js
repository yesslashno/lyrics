import {timingKey} from './lyrics-timing.js';
const KEY='companion.private-lyrics';
function read(storage){try{const value=JSON.parse(storage.getItem(KEY));return Array.isArray(value)?value:[];}catch{return [];}}
export function privateLyrics(track,storage=localStorage){if(!track)return null;const entries=read(storage);return entries.find(entry=>track?.id?.startsWith('youtube:') && entry.track.id===track.id) || entries.find(entry=>timingKey(entry.track)===timingKey(track));}
export function savePrivateLyrics(track,value,storage=localStorage){const entries=read(storage).filter(entry=>entry.track.id!==track.id && timingKey(entry.track)!==timingKey(track));entries.push({track,value:{...value,private:true,published:false}});storage.setItem(KEY,JSON.stringify(entries.slice(-30)));}
export function clearPrivateLyrics(track,storage=localStorage){storage.setItem(KEY,JSON.stringify(read(storage).filter(entry=>entry.track.id!==track.id && timingKey(entry.track)!==timingKey(track))));}
export function webLyricsUrl(title,artist){return 'https://www.google.com/search?'+new URLSearchParams({q:[artist,title,'lyrics'].filter(Boolean).join(' ')});}
