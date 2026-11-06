import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validate } from '../scripts/check-content.mjs';
const original = JSON.parse(fs.readFileSync('src/content/site.json','utf8'));

test('private preview accepts truthful incomplete material; release rejects it', () => {
  assert.deepEqual(validate(original), []);
  assert.ok(validate(original, {release:true}).some(e=>e.includes('owner approval')));
  assert.ok(validate(original, {release:true}).some(e=>e.includes('approved band photograph')));
});
test('unlicensed video is rejected even in a draft record', () => {
  const data=structuredClone(original);
  data.archive=[{id:'unlicensed-test',status:'draft',video:{src:'https://example.invalid/video.mp4',rightsConfirmed:false}}];
  assert.ok(validate(data).some(e=>e.includes('video rights')));
});
test('unlicensed or missing photographs cannot be included', () => {
  const data=structuredClone(original);
  data.archive=[{id:'missing-photo',status:'published',images:[{src:'/media/missing.webp',alt:{zh:'测试',en:'Test'},width:100,height:100,rightsConfirmed:false}]}];
  const errors=validate(data);
  assert.ok(errors.some(e=>e.includes('media file missing')));
  assert.ok(errors.some(e=>e.includes('permission')));
});
test('complete approved material passes release; partial translations fail', () => {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'insulin-content-'));
  try {
    fs.mkdirSync(path.join(tmp,'media'));
    fs.writeFileSync(path.join(tmp,'media','test.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>');
    const data=structuredClone(original);
    Object.keys(data.approvals).forEach(key=>data.approvals[key]=true);
    data.members.forEach((member,i)=>{member.name=`测试成员${i+1}`;member.nameEn=`Test member ${i+1}`;member.status='published';});
    data.archive=[{id:'test-only',status:'published',images:[{src:'/media/test.svg',alt:{zh:'测试图',en:'Test image'},width:100,height:100,rightsConfirmed:true}]}];
    assert.deepEqual(validate(data,{release:true,publicDir:tmp}),[]);
    data.archive[0].images[0].alt.en='';
    assert.ok(validate(data,{release:true,publicDir:tmp}).some(e=>e.includes('.alt')));
    fs.writeFileSync(path.join(tmp,'media','unreviewed.mp4'),'test data');
    assert.ok(validate(data,{publicDir:tmp}).some(e=>e.includes('Unreviewed media file')));
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
