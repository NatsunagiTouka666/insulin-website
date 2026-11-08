import test from 'node:test';
import assert from 'node:assert/strict';
import { Spring } from '../src/lib/liquid/liquid-motion.mjs';
import { SPECTRUM_BANDS } from '../src/lib/liquid/optics.mjs';
import fs from 'node:fs';

test('seven wavelength sampling preserves neutral white',()=>{
  assert.deepEqual(SPECTRUM_BANDS.map(band=>band.wavelengthNm),[650,610,580,550,500,460,420]);
  for(let channel=0;channel<3;channel++)assert.ok(Math.abs(SPECTRUM_BANDS.reduce((total,band)=>total+band.weights[channel],0)-1)<1e-10);
  for(let i=1;i<SPECTRUM_BANDS.length;i++)assert.ok(SPECTRUM_BANDS[i].offset>SPECTRUM_BANDS[i-1].offset);
});
test('interrupted spring retains velocity and does not depend on display frame rate',()=>{
  const a=new Spring({target:1,dampingRatio:.6,stiffness:250}),b=new Spring({target:1,dampingRatio:.6,stiffness:250});
  for(let i=0;i<15;i++)a.step(1/60);
  for(let i=0;i<30;i++)b.step(1/120);
  assert.ok(Math.abs(a.value-b.value)<1e-9);
  const position=a.value,velocity=a.velocity;a.retarget(0);
  assert.equal(a.value,position);assert.equal(a.velocity,velocity);
  for(let i=0;i<180;i++)a.step(1/60);
  assert.equal(a.value,0);assert.equal(a.velocity,0);
});
test('published pages retain exactly two semantic glass navigation anchors',()=>{
  const html=fs.readFileSync('dist/zh/about/index.html','utf8');
  assert.equal((html.match(/<a\b[^>]*data-liquid-tab=/g)||[]).length,2);
  assert.match(html,/data-motion-toggle/);
  assert.match(html,/aria-current="page"/);
  assert.match(html,/class="liquid-optics" aria-hidden="true"/);
});
