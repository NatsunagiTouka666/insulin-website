import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const dist=path.resolve('dist');
function files(dir) {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(dir,item.name)):[path.join(dir,item.name)]);}
test('all bilingual routes exist with matching language and title',()=>{
  for(const lang of ['zh','en']) for(const page of ['','about/','archive/']) {
    const html=fs.readFileSync(path.join(dist,lang,page,'index.html'),'utf8');
    assert.match(html,new RegExp(`<html lang="${lang==='zh'?'zh-CN':'en'}"`));
    assert.match(html,/<title>[^<]*insulin[^<]*<\/title>/);
    assert.match(html,/<main[^>]+id="main"/);
    assert.match(html,/noindex,nofollow/);
    assert.doesNotMatch(html,/<video|autoplay/);
  }
});
test('built internal links and scripts resolve, with a real 404 document',()=>{
  assert.ok(fs.existsSync(path.join(dist,'404.html')));
  for(const file of files(dist).filter(f=>f.endsWith('.html'))) {
    const html=fs.readFileSync(file,'utf8');
    for(const [,url] of html.matchAll(/(?:href|src)="(\/[^"#?]*)[^\"]*"/g)) {
      if(url.startsWith('//'))continue;
      const target=path.join(dist,decodeURIComponent(url));
      assert.ok(fs.existsSync(target.endsWith(path.sep)?path.join(target,'index.html'):target),`${file}: missing ${url}`);
    }
  }
});
