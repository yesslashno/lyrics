import test from 'node:test';import assert from 'node:assert/strict';import {inferSong,defaultLyricsResult,lyricText,playbackPosition} from './youtube-model.js';
const sample={videoId:'dQw4w9WgXcQ',title:'Rick Astley - Never Gonna Give You Up (Official Music Video)',channel:'Rick Astley',position:10,duration:213,paused:false,ad:false};
test('default lyrics prefer the song and artist without comparing video duration',()=>{
 const song=inferSong(sample.title,sample.channel);assert.deepEqual(song,{artist:'Rick Astley',title:'Never Gonna Give You Up'});
 const good={trackName:song.title,artistName:song.artist,duration:999,syncedLyrics:'[00:01]Hello'};
 assert.equal(defaultLyricsResult([{...good,artistName:'Cover band'},good],song),good);
 assert.equal(defaultLyricsResult([good],song),good);assert.equal(defaultLyricsResult([],song),undefined);
});
test('plain lyrics win; timestamp-only lyrics retain words, stanzas and repeated sections',()=>{
 assert.equal(lyricText({plainLyrics:'A verse\n\nA chorus',syncedLyrics:'[00:01]Wrong version'}),'A verse\n\nA chorus');
 assert.equal(lyricText({syncedLyrics:'[ar:Artist]\n[offset:100]\n[00:01.00][01:03.00]A verse\n\n[Chorus]\n[00:02]A chorus'}),'A verse\n\n[Chorus]\nA chorus');
});
test('clock follows pause, seek and stale updates',()=>{assert.equal(playbackPosition(sample,1000,1000),12000);assert.equal(playbackPosition({...sample,paused:true},1000,1000),10000);assert.equal(playbackPosition({...sample,position:40},0,0),40000);assert.equal(playbackPosition(sample,60000,60000),18000);assert.equal(playbackPosition({...sample,ad:true},0,0),0);assert.equal(playbackPosition({...sample,position:1},0,0),1000);});
