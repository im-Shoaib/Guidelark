/* Site admin — runs entirely in the browser.
   It edits the JSON files in /content and regenerates the finished HTML pages
   directly inside the website folder you open (File System Access API).
   There is no server, no database and no login: whoever has the folder can edit it. */
(function () {
  'use strict';
  var B = window.SiteBuilder, h = B.esc;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  var H = null;               // the website folder
  var site = null, posts = [], pages = [], css = '';
  var cur = null;             // item being edited
  var dirty = false;
  var COLORS = { green: '#bfe4c2', yellow: '#ffd94a', blue: '#bcd9f5', red: '#f6b9a6', violet: '#d6c9f3' };
  var INK = '#14213d', PAPER = '#fbfcf8';

  /* ---------- small helpers ---------- */
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function uid() { return Math.random().toString(36).slice(2, 7); }
  var toastTimer;
  function toast(msg, isError) {
    var t = $('#toast'); t.textContent = msg; t.className = 'toast' + (isError ? ' err' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, isError ? 8000 : 4000);
  }
  function fail(e) { console.error(e); toast((e && e.message) || String(e), true); }
  function clean(obj) { return JSON.stringify(obj, function (k, v) { return k.charAt(0) === '_' ? undefined : v; }, 2) + '\n'; }

  /* ---------- files inside the website folder ---------- */
  function split(path) { var parts = path.split('/').filter(Boolean); return { name: parts.pop(), dirs: parts }; }
  async function dirHandle(dirs, create) {
    var d = H;
    for (var i = 0; i < dirs.length; i++) d = await d.getDirectoryHandle(dirs[i], { create: !!create });
    return d;
  }
  async function readText(path) {
    var s = split(path), d = await dirHandle(s.dirs);
    return (await (await d.getFileHandle(s.name)).getFile()).text();
  }
  async function exists(path) {
    try { var s = split(path), d = await dirHandle(s.dirs); await d.getFileHandle(s.name); return true; } catch (e) { return false; }
  }
  async function write(path, data) {
    var s = split(path), d = await dirHandle(s.dirs, true);
    var w = await (await d.getFileHandle(s.name, { create: true })).createWritable();
    await w.write(data); await w.close();
  }
  async function remove(path) {
    try {
      var s = split(path), d = await dirHandle(s.dirs);
      await d.removeEntry(s.name);
      // tidy up a folder left empty (e.g. blog/old-address/)
      if (s.dirs.length > 1) {
        var empty = true;
        for await (var k of d.keys()) { empty = false; break; } // eslint-disable-line no-unused-vars
        if (empty) { var parent = await dirHandle(s.dirs.slice(0, -1)); await parent.removeEntry(s.dirs[s.dirs.length - 1]); }
      }
    } catch (e) { /* already gone */ }
  }
  async function readJsonDir(path, problems) {
    var out = [], d;
    try { d = await dirHandle(path.split('/')); } catch (e) { return out; }
    for await (var entry of d.entries()) {
      var name = entry[0];
      if (entry[1].kind !== 'file' || !/\.json$/i.test(name) || name.charAt(0) === '.') continue;
      try {
        var obj = JSON.parse(await (await entry[1].getFile()).text());
        obj._file = name;
        if (!obj.slug) obj.slug = B.slugify(name.replace(/\.json$/i, ''));
        out.push(obj);
      } catch (e) { problems.push(path + '/' + name + ' is not valid JSON, so it was skipped (' + e.message + ').'); }
    }
    return out;
  }

  /* ---------- remembering the folder between visits ---------- */
  function idb(mode, fn) {
    return new Promise(function (resolve, reject) {
      var open = indexedDB.open('site-admin', 1);
      open.onupgradeneeded = function () { open.result.createObjectStore('kv'); };
      open.onerror = function () { reject(open.error); };
      open.onsuccess = function () {
        var tx = open.result.transaction('kv', mode), req = fn(tx.objectStore('kv'));
        tx.oncomplete = function () { resolve(req && req.result); };
        tx.onerror = function () { reject(tx.error); };
      };
    });
  }

  /* ---------- load everything from disk ---------- */
  var loadProblems = [];
  async function loadAll() {
    loadProblems = [];
    site = JSON.parse(await readText('content/site.json'));
    site.categories = site.categories || []; site.author = site.author || {}; site.newsletter = site.newsletter || {}; site.social = site.social || {};
    posts = await readJsonDir('content/posts', loadProblems);
    pages = await readJsonDir('content/pages', loadProblems);
    posts.forEach(function (p) { if (!p.status) p.status = 'published'; if (!p.date) p.date = today(); });
    css = await readText('assets/css/style.css');
    $('#bar-name').textContent = site.name + ' admin';
    document.title = site.name + ' admin';
  }

  /* ---------- social preview images (drawn on a canvas) ---------- */
  function wrapLines(ctx, text, maxWidth, maxLines) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = words[i]; } else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (ctx.measureText(last + '…').width > maxWidth && last.indexOf(' ') > 0) last = last.slice(0, last.lastIndexOf(' '));
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }
  function drawBrand(ctx, x, y, light) {
    ctx.font = '800 34px Bricolage, Arial, sans-serif'; ctx.textBaseline = 'alphabetic';
    var w = ctx.measureText(site.name).width, s = 44, left = x - w - s - 14;
    ctx.fillStyle = light ? PAPER : INK; ctx.beginPath(); ctx.roundRect(left, y - 35, s, s, 8); ctx.fill();
    ctx.fillStyle = light ? INK : PAPER; ctx.fillRect(left + 10, y - 24, 24, 5); ctx.fillRect(left + 10, y - 6, 15, 5);
    ctx.fillStyle = light ? INK : COLORS.yellow; ctx.fillRect(left + 10, y - 15, 24, 5);
    ctx.fillStyle = light ? PAPER : INK; ctx.textAlign = 'left'; ctx.fillText(site.name, x - w, y);
  }
  async function canvasBlob(canvas, type, q) { return new Promise(function (res) { canvas.toBlob(res, type, q); }); }
  async function fontsReady() { try { await document.fonts.load('800 60px Bricolage'); await document.fonts.load('600 34px Bricolage'); } catch (e) {} }

  async function ogForPost(p) {
    await fontsReady();
    var c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    var ctx = c.getContext('2d');
    var cat = site.categories.filter(function (x) { return x.slug === p.category; })[0] || {};
    ctx.fillStyle = COLORS[cat.color] || COLORS.green; ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = 'rgba(20,33,61,0.09)';
    for (var y = 78; y < 630; y += 79) ctx.fillRect(0, y, 1200, 2);
    ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '700 56px Bricolage, Arial, sans-serif';
    wrapLines(ctx, p.title, 1070, 3).forEach(function (line, i) { ctx.fillText(line, 64, 118 + i * 66); });
    if (p.figure) {
      var size = Math.min(250, 1500 / B.figLen(p.figure));
      ctx.font = '800 ' + size + 'px Bricolage, Arial, sans-serif';
      try { ctx.letterSpacing = (-0.045 * size) + 'px'; } catch (e) {}
      ctx.fillText(p.figure, 58, 520);
      try { ctx.letterSpacing = '0px'; } catch (e) {}
    }
    if (p.figureLabel) { ctx.font = '600 34px Bricolage, Arial, sans-serif'; ctx.fillText(p.figureLabel, 64, 576); }
    drawBrand(ctx, 1136, 576, false);
    return canvasBlob(c, 'image/png');
  }
  async function ogDefault() {
    await fontsReady();
    var c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    var ctx = c.getContext('2d');
    ctx.fillStyle = INK; ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = COLORS.yellow; ctx.fillRect(64, 84, 150, 14);
    ctx.fillStyle = PAPER; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = '800 104px Bricolage, Arial, sans-serif';
    try { ctx.letterSpacing = '-3.5px'; } catch (e) {}
    wrapLines(ctx, site.tagline || site.name, 1070, 3).forEach(function (line, i) { ctx.fillText(line, 60, 236 + i * 108); });
    try { ctx.letterSpacing = '0px'; } catch (e) {}
    drawBrand(ctx, 64 + 58 + ctxWidth(ctx, site.name), 566, true);
    return canvasBlob(c, 'image/png');
  }
  function ctxWidth(ctx, text) { ctx.font = '800 34px Bricolage, Arial, sans-serif'; return ctx.measureText(text).width; }

  /* ---------- images you upload ---------- */
  async function resized(bitmap, w, hgt, type, q) {
    // centre-crop to the target shape, then scale
    var c = document.createElement('canvas'); c.width = w; c.height = hgt;
    var ctx = c.getContext('2d');
    var scale = Math.max(w / bitmap.width, hgt / bitmap.height);
    var sw = w / scale, sh = hgt / scale;
    ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, w, hgt);
    return canvasBlob(c, type, q);
  }
  async function addBodyImage(file) {
    var bmp = await createImageBitmap(file);
    var w = Math.min(1200, bmp.width), hgt = Math.round(bmp.height * (w / bmp.width));
    var blob = await resized(bmp, w, hgt, 'image/webp', 0.82);
    var name = (B.slugify(file.name.replace(/\.[^.]+$/, '')) || 'image') + '-' + uid() + '-' + w + 'x' + hgt + '.webp';
    await write('assets/img/posts/' + name, blob);
    return '/assets/img/posts/' + name;
  }
  async function addCover(file) {
    var bmp = await createImageBitmap(file), id = uid();
    var base = 'assets/img/posts/cover-' + id;
    await write(base + '-1200x675.webp', await resized(bmp, 1200, 675, 'image/webp', 0.8));
    await write(base + '-600x338.webp', await resized(bmp, 600, 338, 'image/webp', 0.78));
    await write('assets/img/og/cover-' + id + '.jpg', await resized(bmp, 1200, 630, 'image/jpeg', 0.84));
    return { cover: { src: base + '-1200x675.webp', src600: base + '-600x338.webp', w: 1200, h: 675, alt: '' }, ogImage: 'assets/img/og/cover-' + id + '.jpg' };
  }

  /* ---------- rebuild the site ---------- */
  async function rebuild(opts) {
    opts = opts || {};
    // articles added by hand as JSON files may not have a social image yet
    for (var i = 0; i < posts.length; i++) {
      var p = posts[i];
      if (p.status === 'draft' || (p.cover && p.cover.src && p.ogImage)) continue;
      var og = p.ogImage || 'assets/img/og/' + p.slug + '.png';
      if (!(await exists(og))) await write(og, await ogForPost(p));
      if (p.ogImage !== og) { p.ogImage = og; await write('content/posts/' + (p._file || p.slug + '.json'), clean(p)); }
    }
    if (opts.defaultOg || !(await exists('assets/img/og-default.png'))) await write('assets/img/og-default.png', await ogDefault());

    var out = B.build({ site: site, posts: posts, pages: pages, css: css, marked: window.marked });
    var names = Object.keys(out.files).sort();
    for (var j = 0; j < names.length; j++) await write(names[j], out.files[names[j]]);
    var previous = [];
    try { previous = JSON.parse(await readText('content/.build.json')).files || []; } catch (e) {}
    for (var k = 0; k < previous.length; k++) if (names.indexOf(previous[k]) < 0) await remove(previous[k]);
    await write('content/.build.json', JSON.stringify({ files: names }, null, 1) + '\n');

    var notes = loadProblems.concat(out.warnings), n = $('#notice');
    n.hidden = !notes.length;
    n.innerHTML = notes.length ? '<ul>' + notes.map(function (w) { return '<li>' + h(w) + '</li>'; }).join('') + '</ul>' : '';
    return out;
  }

  /* ---------- views ---------- */
  var view = $('#view');
  function leaveOk() { return !dirty || confirm('You have changes that are not saved. Leave without saving?'); }
  function show(name, arg) {
    if (!leaveOk()) return;
    dirty = false; cur = null;
    $$('.tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === (name === 'edit' ? (arg && arg.type === 'page' ? 'pages' : 'list') : name)); });
    ({ list: viewList, pages: viewPages, settings: viewSettings, help: viewHelp, edit: viewEdit })[name](arg);
    window.scrollTo(0, 0);
  }

  function viewList() {
    var sorted = posts.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var catName = function (p) { var c = site.categories.filter(function (x) { return x.slug === p.category; })[0]; return c ? c.name : '—'; };
    view.innerHTML = '<div class="view-head"><h1>Articles</h1><button class="btn" id="new">New article</button></div>' +
      (sorted.length ? '<div class="table-wrap"><table><thead><tr><th>Title</th><th>Topic</th><th>Status</th><th>Date</th><th>Words</th></tr></thead><tbody>' +
        sorted.map(function (p) {
          return '<tr><td class="title"><a href="#" data-slug="' + h(p.slug) + '">' + h(p.title || '(no title)') + '</a></td><td>' + h(catName(p)) + '</td>' +
            '<td><span class="pill ' + (p.status === 'draft' ? '' : 'live') + '">' + (p.status === 'draft' ? 'Draft' : 'Published') + '</span></td>' +
            '<td class="num">' + h(p.date || '') + '</td><td class="num">' + B.wordCount(p.body) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="empty"><h2>No articles yet</h2><p>Write your first one. It stays a draft until you choose Publish.</p><button class="btn" id="new2">New article</button></div>');
    $$('#new, #new2').forEach(function (b) { b.onclick = function () { show('edit', { type: 'post' }); }; });
    $$('a[data-slug]', view).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); show('edit', { type: 'post', slug: a.dataset.slug }); }; });
  }

  function viewPages() {
    view.innerHTML = '<div class="view-head"><h1>Pages</h1><button class="btn" id="newp">New page</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Title</th><th>Address</th><th>In top menu</th></tr></thead><tbody>' +
      pages.map(function (p) { return '<tr><td class="title"><a href="#" data-slug="' + h(p.slug) + '">' + h(p.title) + '</a></td><td>/' + h(p.slug) + '/</td><td>' + (p.nav ? 'Yes' : 'No') + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    $('#newp').onclick = function () { show('edit', { type: 'page' }); };
    $$('a[data-slug]', view).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); show('edit', { type: 'page', slug: a.dataset.slug }); }; });
  }

  /* ---------- editor ---------- */
  function field(label, key, value, o) {
    o = o || {};
    var input = o.type === 'textarea'
      ? '<textarea data-f="' + key + '"' + (o.rows ? ' rows="' + o.rows + '"' : '') + (o.ph ? ' placeholder="' + h(o.ph) + '"' : '') + '>' + h(value || '') + '</textarea>'
      : '<input type="' + (o.type || 'text') + '" data-f="' + key + '" value="' + h(value || '') + '"' + (o.ph ? ' placeholder="' + h(o.ph) + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + '>';
    return '<label class="field"><span>' + label + (o.counter ? ' <small data-count="' + key + '"></small>' : '') + '</span>' + input + (o.help ? '<p class="help">' + o.help + '</p>' : '') + '</label>';
  }

  function viewEdit(arg) {
    var isPost = arg.type === 'post';
    var list = isPost ? posts : pages;
    var existing = arg.slug ? list.filter(function (x) { return x.slug === arg.slug; })[0] : null;
    var d = existing ? JSON.parse(JSON.stringify(existing)) : (isPost
      ? { title: '', slug: '', description: '', category: (site.categories[0] || {}).slug || '', date: today(), updated: '', status: 'draft', featured: false, figure: '', figureLabel: '', cover: null, ogImage: '', seoTitle: '', keywords: '', takeaways: [], body: '' }
      : { title: '', slug: '', navLabel: '', nav: false, description: '', updated: today(), body: '' });
    if (existing) d._file = existing._file;
    cur = { type: arg.type, data: d, original: existing ? existing.slug : null, slugTouched: !!existing };
    var live = isPost && existing && existing.status !== 'draft';

    var side = '<div class="panel"><h2>' + (isPost ? (live ? 'Published' : 'Draft') : 'Page') + '</h2><div class="actions">' +
      (isPost ? '<button class="btn" id="publish">' + (live ? 'Publish changes' : 'Publish') + '</button><button class="btn ghost" id="draft">' + (live ? 'Move to drafts' : 'Save draft') + '</button>'
        : '<button class="btn" id="publish">Save page</button>') +
      (existing ? '<button class="btn danger" id="delete">Delete</button>' : '') + '</div></div>';

    if (isPost) {
      side += '<div class="panel"><h2>Search listing</h2>' +
        field('Address', 'slug', d.slug, { help: 'Short, lowercase, words joined by hyphens. Avoid changing it after publishing.' }) +
        field('Search description', 'description', d.description, { type: 'textarea', counter: true, help: 'Shown under the title in Google and when shared. Aim for 110–160 characters.' }) +
        '<div class="serp" aria-label="How it may look in Google"><div class="u" data-serp="u"></div><div class="t" data-serp="t"></div><div class="d" data-serp="d"></div></div></div>' +
        '<div class="panel"><h2>Details</h2>' +
        '<label class="field"><span>Topic</span><select data-f="category">' + site.categories.map(function (c) { return '<option value="' + h(c.slug) + '"' + (c.slug === d.category ? ' selected' : '') + '>' + h(c.name) + '</option>'; }).join('') + '</select></label>' +
        '<div class="two">' + field('Published', 'date', d.date, { type: 'date' }) + field('Last updated', 'updated', d.updated, { type: 'date' }) + '</div>' +
        '<label class="check"><input type="checkbox" data-f="featured"' + (d.featured ? ' checked' : '') + '> Feature on the home page</label>' +
        field('Key points', 'takeaways', (d.takeaways || []).join('\n'), { type: 'textarea', rows: 4, help: 'One per line. Shown in a box at the top of the article.' }) +
        field('Extra search words', 'keywords', d.keywords, { help: 'Optional. Helps the site search find this article.' }) +
        '</div>' +
        '<div class="panel"><h2>Cover</h2><div class="cover-prev" id="cover-prev"></div>' +
        '<div class="two">' + field('Big figure', 'figure', d.figure, { ph: '$500', max: 12, help: 'The number the article turns on.' }) + field('Small label', 'figureLabel', d.figureLabel, { ph: 'first target' }) + '</div>' +
        '<label class="field"><span>Or use a photo</span><input type="file" id="cover-file" accept="image/*"></label>' +
        '<div id="cover-photo-fields"' + (d.cover ? '' : ' hidden') + '>' + field('Describe the photo', 'coverAlt', d.cover ? d.cover.alt : '', { help: 'For screen readers and image search.' }) +
        '<button class="btn small ghost" id="cover-remove" type="button">Remove photo</button></div></div>' +
        '<div class="panel"><h2>Before you publish</h2><ul class="checks" id="checks"></ul></div>';
    } else {
      side += '<div class="panel"><h2>Details</h2>' +
        field('Address', 'slug', d.slug, { help: 'For example: about' }) +
        field('Search description', 'description', d.description, { type: 'textarea', counter: true }) +
        field('Last updated', 'updated', d.updated, { type: 'date' }) +
        '<label class="check"><input type="checkbox" data-f="nav"' + (d.nav ? ' checked' : '') + '> Show in the top menu</label>' +
        field('Menu label', 'navLabel', d.navLabel, { ph: 'Same as the title' }) +
        '<p class="help">In the text you can write {{email}}, {{siteName}}, {{siteUrl}} or {{author}} and the value from Settings is filled in.</p></div>';
    }

    view.innerHTML = '<div class="editor"><div>' +
      '<input class="title-input" data-f="title" value="' + h(d.title) + '" placeholder="' + (isPost ? 'Article title' : 'Page title') + '" aria-label="Title">' +
      '<div class="toolbar">' +
      '<button type="button" data-md="h2" title="Section heading">H2</button><button type="button" data-md="h3" title="Smaller heading">H3</button>' +
      '<button type="button" data-md="bold" title="Bold"><b>B</b></button><button type="button" data-md="italic" title="Italic"><i>I</i></button>' +
      '<button type="button" data-md="link" title="Link">Link</button><button type="button" data-md="ul" title="Bullet list">• List</button>' +
      '<button type="button" data-md="ol" title="Numbered list">1. List</button><button type="button" data-md="quote" title="Quote">Quote</button>' +
      '<button type="button" data-md="table" title="Table">Table</button><button type="button" id="img-btn" title="Add an image">Image</button>' +
      '<input type="file" id="img-file" accept="image/*" hidden>' +
      '<span class="spacer"></span><div class="seg"><button type="button" id="tab-write" class="on">Write</button><button type="button" id="tab-preview">Preview</button></div></div>' +
      '<textarea class="body-input" data-f="body" spellcheck="true" placeholder="Write here in Markdown. Start sections with ## so they appear in the article\'s contents list." aria-label="Article text">' + h(d.body) + '</textarea>' +
      '<iframe class="preview" id="preview" title="Preview" hidden></iframe>' +
      '<p class="count" id="words"></p></div><aside class="side">' + side + '</aside></div>';

    var body = $('[data-f="body"]', view);

    /* inputs -> data */
    var ed = view.firstElementChild; // listeners die with this element when the view changes
    ed.addEventListener('input', onInput);
    ed.addEventListener('change', onInput);
    function onInput(e) {
      var el = e.target, key = el.dataset && el.dataset.f;
      if (!key) return;
      dirty = true;
      if (key === 'takeaways') d.takeaways = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      else if (key === 'coverAlt') { if (d.cover) d.cover.alt = el.value; }
      else if (el.type === 'checkbox') d[key] = el.checked;
      else d[key] = el.value;
      if (key === 'slug') { cur.slugTouched = true; }
      if (key === 'title' && !cur.slugTouched) {
        d.slug = B.slugify(d.title).split('-').filter(function (w) { return ['a', 'an', 'the', 'and', 'of', 'to', 'for', 'in', 'on', 'with', 'you', 'your'].indexOf(w) < 0; }).slice(0, 8).join('-');
        $('[data-f="slug"]', view).value = d.slug;
      }
      refresh();
    }
    ed.addEventListener('focusout', function (e) {
      if (e.target.dataset && e.target.dataset.f === 'slug') { d.slug = B.slugify(d.slug); e.target.value = d.slug; refresh(); }
    });

    /* toolbar */
    function wrapSel(before, after, placeholder) {
      var s = body.selectionStart, e = body.selectionEnd, sel = body.value.slice(s, e) || placeholder;
      body.setRangeText(before + sel + after, s, e, 'select');
      body.selectionStart = s + before.length; body.selectionEnd = s + before.length + sel.length;
      body.focus(); body.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function linePrefix(prefix, numbered) {
      var s = body.selectionStart, e = body.selectionEnd, v = body.value;
      var start = v.lastIndexOf('\n', s - 1) + 1, end = v.indexOf('\n', e); if (end < 0) end = v.length;
      var lines = v.slice(start, end).split('\n').map(function (l, i) { return (numbered ? (i + 1) + '. ' : prefix) + l.replace(/^(#{1,6} |[-*] |\d+\. |> )/, ''); });
      body.setRangeText(lines.join('\n'), start, end, 'end');
      body.focus(); body.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function insertBlock(text) {
      var v = body.value, s = v.indexOf('\n', body.selectionEnd); // insert after the current line, never inside it
      if (s < 0) s = v.length;
      var pre = s > 0 && v.charAt(s - 1) !== '\n' ? '\n\n' : (s > 1 && v.charAt(s - 2) !== '\n' ? '\n' : '');
      body.setRangeText(pre + text + '\n', s, s, 'end');
      body.focus(); body.dispatchEvent(new Event('input', { bubbles: true }));
    }
    $$('[data-md]', view).forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.md;
        if (k === 'h2') linePrefix('## '); else if (k === 'h3') linePrefix('### ');
        else if (k === 'bold') wrapSel('**', '**', 'bold text'); else if (k === 'italic') wrapSel('*', '*', 'italic text');
        else if (k === 'ul') linePrefix('- '); else if (k === 'ol') linePrefix('', true); else if (k === 'quote') linePrefix('> ');
        else if (k === 'link') { var url = prompt('Link address. For another article on this site, use /blog/its-address/', 'https://'); if (url) wrapSel('[', '](' + url + ')', 'link text'); }
        else if (k === 'table') insertBlock('| Item | Amount |\n|---|---:|\n| First row | $0 |\n| Second row | $0 |');
      };
    });
    $('#img-btn').onclick = function () { $('#img-file').click(); };
    $('#img-file').onchange = async function () {
      var f = this.files[0]; this.value = ''; if (!f) return;
      try { var src = await addBodyImage(f); insertBlock('![Describe this image](' + src + ')'); toast('Image added. Replace "Describe this image" with a real description.'); } catch (e) { fail(e); }
    };

    /* write / preview */
    var previewOn = false;
    function setTab(preview) {
      previewOn = preview;
      $('#tab-write').classList.toggle('on', !preview); $('#tab-preview').classList.toggle('on', preview);
      body.hidden = preview; $('#preview').hidden = !preview;
      if (preview) {
        var html;
        if (isPost) {
          var draftCopy = Object.assign({}, d, { status: 'published', slug: d.slug || 'preview', title: d.title || 'Untitled', date: d.date > today() ? today() : d.date });
          var others = posts.filter(function (p) { return p.slug !== cur.original && p.slug !== draftCopy.slug; });
          var out = B.build({ site: site, posts: others.concat([draftCopy]), pages: pages, css: css, marked: window.marked });
          html = out.renderPost(draftCopy, { prefix: '../', noindex: true });
        } else {
          var pg = Object.assign({}, d, { slug: d.slug || 'preview', title: d.title || 'Untitled' });
          var out2 = B.build({ site: site, posts: posts, pages: pages.filter(function (p) { return p.slug !== cur.original && p.slug !== pg.slug; }).concat([pg]), css: css, marked: window.marked });
          html = out2.files[pg.slug + '/index.html'];
        }
        $('#preview').srcdoc = html;
      }
    }
    $('#tab-write').onclick = function () { setTab(false); };
    $('#tab-preview').onclick = function () { setTab(true); };

    /* cover */
    if (isPost) {
      $('#cover-file').onchange = async function () {
        var f = this.files[0]; if (!f) return;
        try {
          var res = await addCover(f);
          d.cover = res.cover; d.ogImage = res.ogImage; d._coverUrl = URL.createObjectURL(f);
          $('#cover-photo-fields').hidden = false; dirty = true; refresh();
        } catch (e) { fail(e); }
      };
      $('#cover-remove').onclick = function () { d.cover = null; d.ogImage = ''; d._coverUrl = null; $('#cover-file').value = ''; $('#cover-photo-fields').hidden = true; dirty = true; refresh(); };
    }

    /* live feedback */
    function refresh() {
      var words = B.wordCount(d.body);
      $('#words').textContent = words + ' words, about ' + B.readingTime(d.body) + ' min to read';
      $$('[data-count]', view).forEach(function (el) {
        var n = (d[el.dataset.count] || '').length;
        el.textContent = n + ' characters'; el.className = n > 160 ? 'bad' : '';
      });
      if (!isPost) return;
      var cat = site.categories.filter(function (c) { return c.slug === d.category; })[0] || {};
      var cp = $('#cover-prev');
      cp.className = 'cover-prev c-' + (cat.color || 'green');
      cp.style.setProperty('--len', B.figLen(d.figure || '§'));
      cp.innerHTML = d.cover ? '<img alt="" src="' + h(d._coverUrl || '../' + d.cover.src) + '">' : '<b>' + h(d.figure || '§') + '</b>' + (d.figureLabel ? '<span>' + h(d.figureLabel) + '</span>' : '');
      $('[data-serp="u"]').textContent = String(site.url).replace(/^https?:\/\//, '') + ' › blog › ' + (d.slug || '…');
      $('[data-serp="t"]').textContent = (d.seoTitle || d.title || 'Article title') + ' | ' + site.name;
      $('[data-serp="d"]').textContent = d.description || 'Your search description appears here.';
      var t = (d.title || '').length, ds = (d.description || '').length;
      var checks = [
        [t >= 30 && t <= 65, 'Title is 30–65 characters (now ' + t + ')'],
        [ds >= 110 && ds <= 160, 'Search description is 110–160 characters (now ' + ds + ')'],
        [d.slug && d.slug.length <= 60, 'Address is short and readable'],
        [words >= 600, 'At least 600 words (now ' + words + ')'],
        [(d.body.match(/^## /gm) || []).length >= 2, 'Two or more section headings (##)'],
        [/\]\(\/(blog|category)\//.test(d.body), 'Links to at least one other article on this site'],
        [!/!\[\s*(Describe this image)?\s*\]\(/.test(d.body), 'Every image has a description'],
        [d.cover ? !!d.cover.alt : !!d.figure && B.figLen(d.figure) <= 9, d.cover ? 'Cover photo has a description' : 'Cover has a short big figure'],
        [(d.takeaways || []).length >= 2, 'Two or more key points']
      ];
      $('#checks').innerHTML = checks.map(function (c) { return '<li class="' + (c[0] ? 'ok' : '') + '">' + h(c[1]) + '</li>'; }).join('');
    }
    refresh();

    /* save */
    async function save(status) {
      d.title = d.title.trim(); d.slug = B.slugify(d.slug || d.title);
      if (!d.title) return toast('Add a title first.', true);
      if (!d.slug) return toast('Add an address (letters and numbers).', true);
      if (list.some(function (x) { return x.slug === d.slug && x.slug !== cur.original; })) return toast('Another ' + (isPost ? 'article' : 'page') + ' already uses the address "' + d.slug + '". Change one of them.', true);
      if (!isPost && ['blog', 'category', 'page', 'assets', 'admin', 'content'].indexOf(d.slug) >= 0) return toast('"' + d.slug + '" is reserved by the site. Choose another address.', true);
      try {
        var folder = isPost ? 'content/posts/' : 'content/pages/';
        if (isPost) {
          d.status = status;
          if (!d.date) d.date = today();
          if (!d.cover) {
            var og = 'assets/img/og/' + d.slug + '.png';
            if (d.ogImage && d.ogImage !== og) await remove(d.ogImage);
            d.ogImage = og;
            await write(og, await ogForPost(d));
          }
        }
        var oldFile = d._file || (cur.original ? cur.original + '.json' : null);
        if (oldFile && oldFile !== d.slug + '.json') await remove(folder + oldFile);
        d._file = d.slug + '.json';
        await write(folder + d._file, clean(d));
        var saved = JSON.parse(clean(d)); saved._file = d._file;
        var idx = list.findIndex(function (x) { return x.slug === cur.original; });
        if (idx >= 0) list[idx] = saved; else list.push(saved);
        await rebuild();
        dirty = false;
        toast(!isPost ? 'Page saved' : status === 'published' ? (d.date > today() ? 'Saved. It will appear when you rebuild on or after ' + d.date : 'Published') : 'Draft saved');
        show('edit', { type: cur.type, slug: d.slug });
      } catch (e) { fail(e); }
    }
    $('#publish').onclick = function () { save('published'); };
    if ($('#draft')) $('#draft').onclick = function () { save('draft'); };
    if ($('#delete')) $('#delete').onclick = async function () {
      if (!confirm('Delete "' + d.title + '"? This removes it from the site and cannot be undone.')) return;
      try {
        await remove((isPost ? 'content/posts/' : 'content/pages/') + (d._file || cur.original + '.json'));
        if (isPost && d.ogImage) await remove(d.ogImage);
        var i = list.findIndex(function (x) { return x.slug === cur.original; }); if (i >= 0) list.splice(i, 1);
        await rebuild(); dirty = false; toast('Deleted'); show(isPost ? 'list' : 'pages');
      } catch (e) { fail(e); }
    };
  }

  /* ---------- settings ---------- */
  function viewSettings() {
    var s = site, catRow = function (c, i) {
      return '<div class="cat-row" data-i="' + i + '"><input type="text" data-c="name" value="' + h(c.name) + '" placeholder="Topic name" aria-label="Topic name">' +
        '<select data-c="color" aria-label="Colour">' + Object.keys(COLORS).map(function (k) { return '<option' + (k === c.color ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="btn small danger" data-c="del">Remove</button>' +
        '<textarea data-c="description" placeholder="One sentence describing this topic (used as its search description)" aria-label="Topic description">' + h(c.description || '') + '</textarea></div>';
    };
    view.innerHTML = '<div class="view-head"><h1>Settings</h1><button class="btn" id="save-settings">Save settings</button></div><div class="form">' +
      '<div class="panel"><h2>Site</h2>' +
      field('Site address', 'url', s.url, { type: 'url', ph: 'https://yourdomain.com', help: 'Your real web address, with https:// and no slash at the end. Search engines and social previews depend on this being right.' }) +
      field('Site name', 'name', s.name) +
      field('Headline on the home page', 'tagline', s.tagline) +
      field('Line under the headline', 'intro', s.intro, { type: 'textarea' }) +
      field('Search description of the site', 'description', s.description, { type: 'textarea', counter: true, help: 'Aim for 110–160 characters.' }) +
      field('Home page title in search results', 'seoTitle', s.seoTitle) +
      field('Articles per page', 'perPage', s.perPage, { type: 'number' }) +
      field('Note under every article', 'disclaimer', s.disclaimer, { type: 'textarea' }) + '</div>' +
      '<div class="panel"><h2>Author</h2>' + field('Name', 'author.name', s.author.name) + field('Short bio', 'author.bio', s.author.bio, { type: 'textarea', help: 'Shown under every article.' }) +
      field('Contact email', 'author.email', s.author.email, { type: 'email', help: 'Shown on the Contact and Privacy pages.' }) +
      field('X / Twitter username', 'social.twitter', s.social.twitter, { ph: 'without @' }) + '</div>' +
      '<div class="panel"><h2>Topics</h2><div id="cats">' + s.categories.map(catRow).join('') + '</div><button type="button" class="btn small ghost" id="add-cat" style="margin-top:.8rem">Add topic</button></div>' +
      '<div class="panel"><h2>Email sign-up</h2>' + field('Form address from your email service', 'newsletter.action', s.newsletter.action, { type: 'url', help: 'Paste the form "action" link from Buttondown, Mailchimp, Kit or similar. Leave empty to hide the sign-up box.' }) +
      field('Name of the email field', 'newsletter.field', s.newsletter.field || 'email') + '</div>' +
      '<div class="panel"><h2>Tracking and verification code</h2>' + field('Code for &lt;head&gt;', 'headCode', s.headCode, { type: 'textarea', rows: 5, help: 'Search Console verification tags, analytics or ad scripts. Added to every page exactly as typed. Every script you add here slows the site down.' }) + '</div></div>';

    var cats = JSON.parse(JSON.stringify(s.categories));
    var draw = function () { $('#cats').innerHTML = cats.map(catRow).join(''); };
    $('#cats').addEventListener('input', function (e) { var r = e.target.closest('.cat-row'); if (r && e.target.dataset.c) { cats[+r.dataset.i][e.target.dataset.c] = e.target.value; dirty = true; } });
    $('#cats').addEventListener('change', function (e) { var r = e.target.closest('.cat-row'); if (r && e.target.dataset.c === 'color') { cats[+r.dataset.i].color = e.target.value; dirty = true; } });
    $('#cats').addEventListener('click', function (e) {
      if (e.target.dataset.c !== 'del') return;
      var i = +e.target.closest('.cat-row').dataset.i, c = cats[i];
      var used = posts.filter(function (p) { return p.category === c.slug; }).length;
      if (used) return toast(used + ' article' + (used > 1 ? 's use' : ' uses') + ' "' + c.name + '". Move them to another topic first.', true);
      cats.splice(i, 1); dirty = true; draw();
    });
    $('#add-cat').onclick = function () { cats.push({ slug: '', name: '', color: 'violet', description: '' }); draw(); };
    $('.form', view).addEventListener('input', function () { dirty = true; });

    $('#save-settings').onclick = async function () {
      try {
        $$('[data-f]', view).forEach(function (el) {
          var path = el.dataset.f.split('.'), o = site;
          while (path.length > 1) { var k = path.shift(); o = o[k] = o[k] || {}; }
          o[path[0]] = el.type === 'number' ? (+el.value || 10) : el.value.trim();
        });
        site.url = site.url.replace(/\/+$/, '');
        site.shortName = site.name;
        cats = cats.filter(function (c) { return c.name.trim(); });
        cats.forEach(function (c) { c.name = c.name.trim(); if (!c.slug) c.slug = B.slugify(c.name); if (!c.title) c.title = c.name; });
        site.categories = cats;
        await write('content/site.json', clean(site));
        await rebuild({ defaultOg: true });
        for (var i = 0; i < posts.length; i++) if (!posts[i].cover && posts[i].status !== 'draft' && posts[i].ogImage) await write(posts[i].ogImage, await ogForPost(posts[i]));
        dirty = false; toast('Settings saved'); $('#bar-name').textContent = site.name + ' admin';
      } catch (e) { fail(e); }
    };
  }

  function viewHelp() {
    view.innerHTML = '<div class="help-doc"><div class="view-head"><h1>Help</h1></div>' +
      '<h2>How publishing works</h2><ol><li>Write an article and choose <b>Publish</b>. The admin saves it as a JSON file in <code>content/posts</code> and rewrites the finished pages (home page, article page, topic pages, sitemap, RSS feed) inside your website folder.</li>' +
      '<li>Put the folder online: upload it to your host, or commit and push if you use GitHub. Until you do this, the change exists only on this computer.</li></ol>' +
      '<h2>Adding articles as JSON files</h2><p>You can also drop a <code>.json</code> file into <code>content/posts</code> yourself. Copy an existing file to see the fields. Then press <b>Rebuild site</b> here (or run <code>node build.js</code>). A website without a server cannot notice new files on its own, so one of those two steps is needed.</p>' +
      '<h2>Writing</h2><ul><li>Start each section with <code>## Heading</code>. Those headings become the "In this article" list.</li><li>Link to your other articles with <code>[text](/blog/address/)</code>. Internal links help readers and search engines.</li>' +
      '<li>Tables: use the Table button. End a column with <code>---:</code> to right-align numbers.</li><li>Images are resized and converted to WebP automatically. Always replace the placeholder description.</li></ul>' +
      '<h2>Changing the design</h2><p>Colours, fonts and spacing live in <code>assets/css/style.css</code>. After editing it, press <b>Rebuild site</b> so every page picks up the change.</p>' +
      '<h2>Good to know</h2><ul><li>This admin has no password because it has no server. It can only change files on a computer where someone opens the website folder with it.</li>' +
      '<li>If you open the site through VS Code Live Server or a similar tool, the admin still works: page auto-refresh is switched off on this page so saves are not interrupted.</li>' +
      '<li>It needs Chrome, Edge or Opera on a computer. Phones and Firefox/Safari cannot edit local folders.</li><li>Keep a backup of the <code>content</code> folder. It holds everything you have written.</li></ul></div>';
  }

  /* ---------- start ---------- */
  async function start(handle) {
    H = handle;
    try { await readText('content/site.json'); }
    catch (e) { H = null; throw new Error('That folder does not contain content/site.json. Choose the website folder itself: the one with index.html, admin and content inside it.'); }
    await loadAll();
    $('#connect').hidden = true; $('#app').hidden = false;
    show('list');
    if (loadProblems.length) { var n = $('#notice'); n.hidden = false; n.innerHTML = '<ul>' + loadProblems.map(function (w) { return '<li>' + h(w) + '</li>'; }).join('') + '</ul>'; }
  }
  function connectError(e) {
    if (e && e.name === 'AbortError') return;
    var el = $('#connect-error'); el.hidden = false; el.textContent = (e && e.message) || String(e);
  }

  if (!window.showDirectoryPicker) {
    $('#connect-actions').hidden = true;
    $('#connect-hint').textContent = 'This dashboard edits files on your computer, which only Chrome, Edge and Opera on a desktop or laptop can do. Open this page in one of those browsers.';
  } else {
    $('#pick').onclick = async function () {
      try {
        var handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'website' });
        await start(handle);
        idb('readwrite', function (st) { return st.put(handle, 'folder'); }).catch(function () {});
      } catch (e) { connectError(e); }
    };
    idb('readonly', function (st) { return st.get('folder'); }).then(function (saved) {
      if (!saved) return;
      $('#reconnect').hidden = false; $('#reconnect-name').textContent = '"' + saved.name + '"';
      $('#pick').classList.add('ghost'); $('#pick').textContent = 'Open a different folder';
      $('#reconnect').onclick = async function () {
        try {
          if (saved.requestPermission && (await saved.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Permission to edit the folder was not given.');
          await start(saved);
        } catch (e) { connectError(e); }
      };
      // if the browser still remembers the permission (same session), open the folder straight away
      if (saved.queryPermission) saved.queryPermission({ mode: 'readwrite' }).then(function (state) {
        if (state === 'granted' && !H) start(saved).catch(connectError);
      }).catch(function () {});
    }).catch(function () {});
  }

  $$('.tabs button').forEach(function (b) { b.onclick = function () { show(b.dataset.view); }; });
  $('#rebuild').onclick = async function () {
    if (!leaveOk()) return;
    var btn = this; btn.disabled = true;
    try { dirty = false; await loadAll(); var out = await rebuild(); toast('Site rebuilt: ' + out.posts.length + ' published articles'); show('list'); }
    catch (e) { fail(e); }
    btn.disabled = false;
  };
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  window.__admin = { ogForPost: ogForPost, ogDefault: ogDefault, setSite: function (s) { site = s; } }; // used by the seed/test scripts
})();
