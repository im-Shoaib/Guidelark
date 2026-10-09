#!/usr/bin/env node
/* Optional: rebuild the whole site from the terminal with `node build.js`.
   Does exactly what "Rebuild site" does in the admin dashboard.
   No npm install needed. */
const fs = require('fs');
const path = require('path');
const root = __dirname;
const SiteBuilder = require('./admin/builder.js');
const marked = require('./admin/vendor/marked.min.js');

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const readDir = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
      try { return readJson(path.join(dir, f)); }
      catch (e) { console.error('Skipped ' + f + ': not valid JSON (' + e.message + ')'); return null; }
    }).filter(Boolean)
  : [];

const out = SiteBuilder.build({
  site: readJson(path.join(root, 'content/site.json')),
  posts: readDir(path.join(root, 'content/posts')),
  pages: readDir(path.join(root, 'content/pages')),
  css: fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8'),
  marked,
});

const manifestFile = path.join(root, 'content/.build.json');
const previous = fs.existsSync(manifestFile) ? readJson(manifestFile).files || [] : [];
const current = Object.keys(out.files).sort();

for (const rel of current) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out.files[rel]);
}
// remove pages that no longer exist (deleted or renamed articles)
for (const rel of previous) {
  if (current.includes(rel)) continue;
  const file = path.join(root, rel);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const dir = path.dirname(file);
  if (dir !== root && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}
fs.writeFileSync(manifestFile, JSON.stringify({ files: current }, null, 1) + '\n');

console.log('Built ' + current.length + ' files, ' + out.posts.length + ' published articles.');
out.warnings.forEach((w) => console.log('Note: ' + w));
