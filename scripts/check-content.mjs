import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function validate(data, { release = false, publicDir = path.resolve('public') } = {}) {
  const errors = [];
  const approvedMedia = new Set();
  const fail = message => errors.push(message);
  const bilingual = (value, label) => {
    if (!value || !['zh', 'en'].every(lang => typeof value[lang] === 'string' && value[lang].trim())) fail(`${label}: both zh and en are required`);
  };
  const image = (photo, label) => {
    if (!photo || typeof photo.src !== 'string' || !/^\/media\/[a-zA-Z0-9_./-]+\.(avif|webp|png|jpe?g|svg)$/i.test(photo.src)) { fail(`${label}: use a local /media/ image`); return; }
    const resolved = path.resolve(publicDir, '.' + photo.src);
    if (!resolved.startsWith(path.resolve(publicDir) + path.sep)) { fail(`${label}: invalid media path`); return; }
    if (!fs.existsSync(resolved)) fail(`${label}: media file missing`);
    else if (fs.statSync(resolved).size > 20 * 1024 * 1024) fail(`${label}: optimize images to less than 20 MiB`);
    if (!Number.isInteger(photo.width) || photo.width < 1 || !Number.isInteger(photo.height) || photo.height < 1) fail(`${label}: intrinsic width and height required`);
    bilingual(photo.alt, `${label}.alt`);
    if (photo.caption) bilingual(photo.caption, `${label}.caption`);
    if (photo.rightsConfirmed !== true) fail(`${label}: public image permission must be confirmed`);
    else approvedMedia.add(resolved);
  };
  if (!data.approvals || !['chineseCopy','englishCopy','members','media'].every(key=>typeof data.approvals[key]==='boolean')) fail('Four explicit approval flags are required');
  if (release && !Object.values(data.approvals || {}).every(Boolean)) fail('Release blocked: owner approval of Chinese copy, English copy, members and media is required');
  for (const lang of ['zh','en']) {
    if (!data.home?.[lang] || !['line1','line2','intro','about','note','archive'].every(key=>typeof data.home[lang][key]==='string' && data.home[lang][key].trim())) fail(`home.${lang}: incomplete copy`);
  }
  bilingual(data.about, 'about');
  if (!Array.isArray(data.members) || data.members.length !== 6) fail('Exactly six member records are required');
  const ids = new Set(), orders = new Set();
  for (const member of data.members || []) {
    if (!/^member-[a-z0-9-]+$/.test(member.id) || ids.has(member.id)) fail(`Invalid or duplicate member ID: ${member.id}`);
    ids.add(member.id);
    if (!Number.isInteger(member.order) || orders.has(member.order)) fail(`Invalid or duplicate member order: ${member.id}`);
    orders.add(member.order);
    bilingual(member.role, `${member.id}.role`);
    if (!['draft','published'].includes(member.status)) fail(`${member.id}: invalid status`);
    if ((release || member.status === 'published') && (!member.name?.trim() || !member.nameEn?.trim() || member.status !== 'published')) fail(`${member.id}: confirmed names and published status required`);
    if (member.photo) image(member.photo, member.id);
  }
  const archiveIds = new Set();
  if (!Array.isArray(data.archive)) fail('archive must be an array');
  for (const record of data.archive || []) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id) || archiveIds.has(record.id)) fail(`Invalid or duplicate archive ID: ${record.id}`);
    archiveIds.add(record.id);
    if (!['draft','published'].includes(record.status)) fail(`${record.id}: invalid status`);
    if (record.title) bilingual(record.title, `${record.id}.title`);
    if (record.text) bilingual(record.text, `${record.id}.text`);
    if (!(record.images?.length || record.text?.zh?.trim() || record.video)) fail(`${record.id}: at least one real content item is required`);
    for (const photo of record.images || []) image(photo, record.id);
    if (record.video) {
      if (record.video.rightsConfirmed !== true) fail(`${record.id}: video rights must be confirmed before inclusion in this repository`);
      if (!/^https:\/\//.test(record.video.src || '')) fail(`${record.id}: video must use external HTTPS storage`);
    }
  }
  if (release && !(data.archive || []).some(r=>r.status==='published' && r.images?.length)) fail('Release blocked: supply at least one approved band photograph');
  const inspectMedia = directory => {
    if (!fs.existsSync(directory)) return;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) inspectMedia(file);
      else if (!approvedMedia.has(path.resolve(file))) fail(`Unreviewed media file: ${path.relative(publicDir, file)}`);
    }
  };
  inspectMedia(path.join(publicDir, 'media'));
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = JSON.parse(fs.readFileSync('src/content/site.json', 'utf8'));
  const errors = validate(data, { release: process.argv.includes('--release') });
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Content validation passed' + (process.argv.includes('--release') ? ' (release)' : ' (private preview)'));
}
