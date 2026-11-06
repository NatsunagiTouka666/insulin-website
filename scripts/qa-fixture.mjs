// Local QA only: render the real archive/gallery components with original test drawings.
// The original content is restored in finally; the output is ignored and never packaged.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const contentPath='src/content/site.json';
const original=fs.readFileSync(contentPath,'utf8');
const data=JSON.parse(original);
const files=['public/media/qa-one.svg','public/media/qa-two.svg'];
fs.mkdirSync('public/media',{recursive:true});
try {
  files.forEach((file,i)=>fs.writeFileSync(file,`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="${i?'#c6cebb':'#d9c4b5'}"/><circle cx="500" cy="350" r="170" fill="none" stroke="#292825" stroke-width="3"/><text x="500" y="365" text-anchor="middle" font-family="serif" font-size="32">LOCAL QA ${i+1}</text></svg>`));
  data.archive=[{id:'local-gallery-qa',status:'published',detail:true,title:{zh:'本机测试图形，不是乐队照片',en:'Local test drawings, not band photographs'},text:{zh:'此记录仅用于本机功能验收，不进入网站预览部署。',en:'This entry is for local functional QA only and is never deployed.'},images:files.map((file,i)=>({src:file.replace('public',''),width:1000,height:700,alt:{zh:`本机测试图形 ${i+1}`,en:`Local test drawing ${i+1}`},rightsConfirmed:true}))}];
  fs.writeFileSync(contentPath,JSON.stringify(data,null,2)+'\n');
  const result=spawnSync(process.execPath,['node_modules/astro/bin/astro.mjs','build','--outDir','test-results/fixture-dist'],{stdio:'inherit'});
  if(result.error)throw result.error;
  process.exitCode=result.status || 0;
} finally {
  fs.writeFileSync(contentPath,original);
  for(const file of files)if(fs.existsSync(file))fs.unlinkSync(file);
}
