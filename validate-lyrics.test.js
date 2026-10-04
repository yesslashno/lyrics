import {test} from 'node:test';import assert from 'node:assert/strict';import {validateLyrics} from './validate-lyrics.js';
const track={duration_ms:120000};
test('plain and synced lyrics validate without publishing or storing anything',()=>{
 assert.equal(validateLyrics(track,'  Hello\nWorld  ','').plainLyrics,'Hello\nWorld');
 assert.equal(validateLyrics(track,'','[00:01.5]Hello\n[00:05.20]World').plainLyrics,'Hello\nWorld');
 for(const text of ['bad','[00:99]Bad','[00:01]Hello\nUntimed','[03:00]Too late'])assert.throws(()=>validateLyrics(track,'',text));
 assert.throws(()=>validateLyrics(track,'',''),/Paste/);
});
