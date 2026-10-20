/* Site builder — turns content/*.json into finished static HTML pages.
   The same file runs in two places:
     - in the browser, inside the admin dashboard
     - in Node, through `node build.js` (optional)
   It has no dependencies except the Markdown parser passed in as `marked`. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SiteBuilder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function parseDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 8)) : null;
  }
  function fmtDate(d) {
    var dt = parseDate(d);
    return dt ? MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCDate() + ', ' + dt.getUTCFullYear() : '';
  }
  function isoDate(d) { return d ? d.slice(0, 10) + 'T08:00:00+00:00' : ''; }
  function rfc822(d) {
    var dt = parseDate(d);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return DAYS[dt.getUTCDay()] + ', ' + p(dt.getUTCDate()) + ' ' + SHORT[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear() + ' 08:00:00 +0000';
  }
  function today(now) { var d = now || new Date(); /* the author's local date, not UTC */ return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function plainText(md) {
    return String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`|~-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function wordCount(md) { var t = plainText(md); return t ? t.split(' ').length : 0; }
  function readingTime(md) { return Math.max(1, Math.round(wordCount(md) / 220)); }
  function figLen(fig) {
    var n = 0;
    String(fig).split('').forEach(function (ch) { n += /[\/.,:;'’ |!-]/.test(ch) ? 0.5 : (/[mwMW%$@&]/.test(ch) ? 1.25 : 1); });
    return Math.max(2.4, Math.round(n * 10) / 10);
  }
  function minifyCss(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/:\s+/g, ':').replace(/;}/g, '}').trim();
  }
  function jsonLd(obj) {
    return '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';
  }
  function isAbsolute(u) { return /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u); }

  /* ---------- Markdown ---------- */
  function renderMarkdown(md, marked, P, hidden) {
    P = P || '';
    hidden = hidden || {};
    /* a link to an article that is not live yet (future date or draft) becomes plain text until it is */
    var pendingSlug = function (u) { var m = /^\/?blog\/([^\/?#]+)\/?(?:[?#].*)?$/.exec(u || ''); return m && hidden[m[1]] ? m[1] : ''; };
    var toc = [], used = {};
    var fixUrl = function (u) {
      if (!u || isAbsolute(u)) return u;
      return P + u.replace(/^\/+/, '');
    };
    var m = new marked.Marked({ gfm: true });
    m.use({
      renderer: {
        heading: function (text, level, raw) {
          var id = slugify(raw) || 'section';
          if (used[id]) { used[id]++; id += '-' + used[id]; } else used[id] = 1;
          if (level === 2) toc.push({ id: id, text: text.replace(/<[^>]+>/g, '') });
          var lvl = Math.max(2, level); /* the page already has its h1 */
          return '<h' + lvl + ' id="' + id + '">' + text + '</h' + lvl + '>\n';
        },
        image: function (href, title, text) {
          var dim = /-(\d+)x(\d+)\.[a-z0-9]+$/i.exec(href || '');
          return '<img src="' + esc(fixUrl(href)) + '" alt="' + esc(text) + '"' +
            (dim ? ' width="' + dim[1] + '" height="' + dim[2] + '"' : '') +
            (title ? ' title="' + esc(title) + '"' : '') + ' loading="lazy" decoding="async">';
        },
        link: function (href, title, text) {
          var ext = /^https?:\/\//i.test(href || '');
          if (!ext && pendingSlug(href)) return text;
          return '<a href="' + esc(ext ? href : fixUrl(href)) + '"' + (title ? ' title="' + esc(title) + '"' : '') +
            (ext ? ' rel="noopener"' : '') + '>' + text + '</a>';
        },
        table: function (header, body) {
          return '<div class="table-wrap"><table><thead>' + header + '</thead><tbody>' + body + '</tbody></table></div>\n';
        }
      }
    });
    var html = m.parse(String(md || '')).replace(/(<t[dh]) align="(left|right|center)"/g, '$1 class="a-$2"');
    /* raw HTML in the Markdown: fix site-relative src/href too */
    html = html.replace(/<a\b[^>]*?\shref="(\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g, function (all, u, inner) { return pendingSlug(u) ? inner : all; });
    html = html.replace(/(<(?:img|a|source|video|iframe)\b[^>]*?\s(?:src|href)=")(\/(?!\/)[^"]*)"/g, function (all, pre, u) {
      return pre + P + u.replace(/^\/+/, '') + '"';
    });
    return { html: html, toc: toc };
  }

  /* ---------- Icons ---------- */
  var ICON = {
    mark: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="currentColor"/><rect x="7" y="8" width="18" height="3.5" fill="var(--paper)"/><rect x="7" y="14.25" width="18" height="3.5" fill="var(--hi)"/><rect x="7" y="20.5" width="11" height="3.5" fill="var(--paper)"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.6-4.6"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    moon: '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
    sun: '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
  };

  /* ---------- Build ---------- */
  function build(input) {
    var site = input.site, marked = input.marked;
    var warnings = [], files = {};
    var base = String(site.url || '').replace(/\/+$/, '');
    if (!base || /example\.com/.test(base)) warnings.push('Site address is still the placeholder. Set your real address in Settings so canonical links, the sitemap and social previews point to your site.');
    var basePath = '/';
    try { basePath = new URL(base + '/').pathname; } catch (e) {}
    var css = minifyCss(input.css || '');
    var now = today(input.now);
    var cats = site.categories || [];
    var catBy = {};
    cats.forEach(function (c) { catBy[c.slug] = c; });
    var author = site.author || {};

    var seen = {};
    var posts = (input.posts || []).filter(function (p) {
      if (p && p.title && !p.slug) p.slug = slugify(p.title);
      if (!p || !p.slug || !p.title) { if (p) warnings.push('An article file has no title, so it was skipped.'); return false; }
      if (p.status === 'draft') return false;
      if (!p.date) p.date = now;
      p.body = p.body || '';
      if (p.date > now) { warnings.push('"' + p.title + '" is dated ' + p.date + ' (in the future), so it is not on the site yet. Rebuild on or after that date.'); return false; }
      if (seen[p.slug]) { warnings.push('Two articles share the address "' + p.slug + '". Only the first was built.'); return false; }
      seen[p.slug] = 1;
      if (!p.description) warnings.push('"' + p.title + '" has no search description.');
      if (!catBy[p.category]) warnings.push('"' + p.title + '" uses a topic that does not exist: ' + p.category);
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title); });
    var live = {}; posts.forEach(function (p) { live[p.slug] = 1; });
    var pending = {}; (input.posts || []).forEach(function (p) { var sl = p && (p.slug || (p.title && slugify(p.title))); if (sl && !live[sl]) pending[sl] = 1; });
    var pages = (input.pages || []).filter(function (p) { return p && p.slug && p.title; })
      .sort(function (a, b) { return (a.order || 99) - (b.order || 99) || a.title.localeCompare(b.title); });
    var aboutPage = pages.filter(function (p) { return p.slug === 'about'; })[0];
    var liveCats = cats.filter(function (c) { return posts.some(function (p) { return p.category === c.slug; }); });

    var postPath = function (p) { return 'blog/' + p.slug + '/'; };
    var catPath = function (c) { return 'category/' + c.slug + '/'; };
    var abs = function (path) { return base + '/' + path; };
    var prefixFor = function (path) { var d = path.split('/').length - 1; return new Array(d + 1).join('../'); };
    var ogFor = function (p) { return abs((p && p.ogImage) || 'assets/img/og-default.png'); };
    var catName = function (p) { return (catBy[p.category] || {}).name || ''; };
    var catColor = function (p) { return 'c-' + ((catBy[p.category] || {}).color || 'green'); };

    function cover(p, P, opt) {
      opt = opt || {};
      if (p.cover && p.cover.src) {
        var c = p.cover;
        var srcset = c.src600 ? ' srcset="' + esc(P + c.src600) + ' 600w, ' + esc(P + c.src) + ' ' + (c.w || 1200) + 'w" sizes="' + (opt.sizes || '(min-width: 56rem) 52rem, 100vw') + '"' : '';
        return '<div class="cover cover-photo"><img src="' + esc(P + c.src) + '"' + srcset + ' alt="' + esc(c.alt || '') + '" width="' + (c.w || 1200) + '" height="' + (c.h || 675) + '"' +
          (opt.eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"') + '></div>';
      }
      var fig = p.figure || '§';
      return '<div class="cover ' + catColor(p) + '" style="--len:' + figLen(fig) + '"' + (opt.decorative ? ' aria-hidden="true"' : '') + '>' +
        '<span class="cover-fig">' + esc(fig) + '</span>' + (p.figureLabel ? '<span class="cover-label">' + esc(p.figureLabel) + '</span>' : '') + '</div>';
    }
    function metaLine(p, P, opt) {
      opt = opt || {};
      var c = catBy[p.category];
      return '<div class="meta">' +
        (c && !opt.noCat ? '<a href="' + P + catPath(c) + '">' + esc(c.name) + '</a>' : '') +
        '<time datetime="' + esc(p.updated || p.date) + '">' + (p.updated && p.updated !== p.date ? 'Updated ' : '') + fmtDate(p.updated || p.date) + '</time>' +
        '<span>' + readingTime(p.body) + ' min read</span></div>';
    }
    function card(p, P, opt) {
      opt = typeof opt === 'string' ? { tag: opt } : (opt || {});
      var tag = opt.tag || 'h3';
      return '<li class="card">' + cover(p, P, { decorative: true, sizes: '(min-width: 64rem) 22rem, (min-width: 40rem) 45vw, 100vw' }) +
        '<div class="card-body"><' + tag + '><a class="stretch" href="' + P + postPath(p) + '">' + esc(p.title) + '</a></' + tag + '>' +
        '<p>' + esc(p.description) + '</p>' + metaLine(p, P, opt) + '</div></li>';
    }
    function row(p, P, opt) {
      var tag = (opt && opt.tag) || 'h3';
      return '<li><article class="row"><' + tag + '><a class="stretch" href="' + P + postPath(p) + '">' + esc(p.title) + '</a></' + tag + '>' +
        '<p>' + esc(p.description) + '</p>' + metaLine(p, P, opt) + '</article></li>';
    }
    function newsletter() {
      var n = site.newsletter || {};
      if (!n.action) return '';
      return '<section class="section"><div class="news"><div><h2>' + esc(n.title || 'Get new articles by email') + '</h2><p>' + esc(n.text || 'One email when something new is published. Unsubscribe any time.') + '</p></div>' +
        '<form action="' + esc(n.action) + '" method="post"><label class="sr" for="nl-email">Email address</label>' +
        '<input id="nl-email" type="email" name="' + esc(n.field || 'email') + '" placeholder="you@example.com" autocomplete="email" required>' +
        '<button class="btn" type="submit">Subscribe</button></form></div></section>';
    }

    /* ---- shared layout ---- */
    function layout(o) {
      var P = o.prefix != null ? o.prefix : prefixFor(o.path);
      var home = P || './';
      var canonical = o.canonical || abs(o.path);
      var title = o.title;
      var desc = o.description || site.description || '';
      var image = o.image || ogFor(null);
      var robots = o.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1';
      var navLinks = liveCats.map(function (c) {
        return '<a href="' + P + catPath(c) + '"' + (o.current === 'cat:' + c.slug ? ' aria-current="page"' : '') + '>' + esc(c.name) + '</a>';
      }).join('') + pages.filter(function (p) { return p.nav; }).map(function (p) {
        return '<a href="' + P + p.slug + '/"' + (o.current === 'page:' + p.slug ? ' aria-current="page"' : '') + '>' + esc(p.navLabel || p.title) + '</a>';
      }).join('');
      var head = [
        '<!doctype html>',
        '<html lang="' + esc(site.language || 'en') + '" data-root="' + home + '">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>' + esc(title) + '</title>',
        '<meta name="description" content="' + esc(desc) + '">',
        '<link rel="canonical" href="' + esc(canonical) + '">',
        '<meta name="robots" content="' + robots + '">',
        '<script>try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>',
        '<link rel="preload" href="' + P + 'assets/fonts/bricolage.woff2" as="font" type="font/woff2" crossorigin>',
        '<style>' + css.replace(/url\(\.\.\/fonts\//g, 'url(' + P + 'assets/fonts/') + '</style>',
        '<meta property="og:type" content="' + (o.type || 'website') + '">',
        '<meta property="og:site_name" content="' + esc(site.name) + '">',
        '<meta property="og:title" content="' + esc(o.ogTitle || title) + '">',
        '<meta property="og:description" content="' + esc(desc) + '">',
        '<meta property="og:url" content="' + esc(canonical) + '">',
        '<meta property="og:image" content="' + esc(image) + '">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:locale" content="' + esc(site.locale || 'en_US') + '">',
        o.extraMeta || '',
        '<meta name="twitter:card" content="summary_large_image">',
        (site.social && site.social.twitter ? '<meta name="twitter:site" content="@' + esc(String(site.social.twitter).replace(/^@/, '')) + '">' : ''),
        '<link rel="alternate" type="application/rss+xml" title="' + esc(site.name) + '" href="' + P + 'feed.xml">',
        '<link rel="icon" href="' + P + 'assets/img/favicon.svg" type="image/svg+xml">',
        '<link rel="icon" href="' + P + 'assets/img/icon-192.png" type="image/png" sizes="192x192">',
        '<link rel="apple-touch-icon" href="' + P + 'assets/img/apple-touch-icon.png">',
        '<link rel="manifest" href="' + P + 'manifest.webmanifest">',
        '<meta name="theme-color" content="#fbfcf8" media="(prefers-color-scheme: light)">',
        '<meta name="theme-color" content="#0e1830" media="(prefers-color-scheme: dark)">',
        (o.schema || []).map(jsonLd).join('\n'),
        '<script src="' + P + 'assets/js/main.js" defer></script>',
        site.headCode || '',
        '</head>'
      ].filter(Boolean).join('\n');

      var header = '<body>\n<a class="skip" href="#main">Skip to content</a>\n' + (o.progress ? '<div class="progress" aria-hidden="true"></div>\n' : '') +
        '<header class="head"><div class="wrap head-in">' +
        '<a class="brand" href="' + home + '">' + ICON.mark + '<span>' + esc(site.name) + '</span></a>' +
        '<nav class="nav" id="nav" aria-label="Main">' + navLinks + '</nav>' +
        '<button class="icon-btn" id="search-open" type="button" aria-label="Search articles">' + ICON.search + '</button>' +
        '<button class="icon-btn" id="theme" type="button" aria-label="Switch between light and dark">' + ICON.moon + ICON.sun + '</button>' +
        '<button class="icon-btn menu-btn" id="menu" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav">' + ICON.menu + '</button>' +
        '</div></header>\n';

      var footer = '<footer class="foot"><div class="wrap foot-in">' +
        '<div><a class="brand" href="' + home + '">' + ICON.mark + '<span>' + esc(site.name) + '</span></a><p>' + esc(site.description || '') + '</p></div>' +
        '<nav aria-label="Topics"><h2>Topics</h2><ul>' + liveCats.map(function (c) { return '<li><a href="' + P + catPath(c) + '">' + esc(c.name) + '</a></li>'; }).join('') + '</ul></nav>' +
        '<nav aria-label="Site"><h2>' + esc(site.name) + '</h2><ul>' + pages.map(function (p) { return '<li><a href="' + P + p.slug + '/">' + esc(p.navLabel || p.title) + '</a></li>'; }).join('') +
        '<li><a href="' + P + 'feed.xml">RSS feed</a></li></ul></nav>' +
        '<p class="fine">' + (site.disclaimer ? esc(site.disclaimer) + ' ' : '') + '© ' + now.slice(0, 4) + ' ' + esc(site.name) + '.</p>' +
        '</div></footer>\n' +
        '<dialog class="search" id="search" aria-label="Search articles"><div class="search-bar"><input type="search" placeholder="Search articles" aria-label="Search articles" autocomplete="off">' +
        '<button class="btn search-close" type="button">Close</button></div><p class="search-msg"></p><ul class="search-out"></ul></dialog>\n' +
        (site.bodyCode || '') + '</body>\n</html>\n';

      return head + '\n' + header + o.main + '\n' + footer;
    }

    var orgSchema = {
      '@type': 'Organization', '@id': abs('#org'), name: site.name, url: abs(''),
      logo: { '@type': 'ImageObject', url: abs('assets/img/icon-512.png'), width: 512, height: 512 }
    };
    /* If the author is the site itself (same name), articles are credited to the organisation, not a person */
    var brandAuthor = !author.name || author.name === site.name;
    var personSchema = brandAuthor
      ? { '@type': 'Organization', '@id': abs('#org'), name: site.name, url: abs('') }
      : { '@type': 'Person', '@id': abs('#author'), name: author.name };
    if (aboutPage && !brandAuthor) personSchema.url = abs('about/');
    if (author.sameAs && author.sameAs.length) personSchema.sameAs = author.sameAs;

    /* ---- articles ---- */
    function renderPost(p, opt) {
      opt = opt || {};
      var path = postPath(p);
      var P = opt.prefix != null ? opt.prefix : prefixFor(path);
      var md = renderMarkdown(p.body, marked, P, pending);
      var c = catBy[p.category];
      var related = posts.filter(function (x) { return x.slug !== p.slug && x.category === p.category; })
        .concat(posts.filter(function (x) { return x.slug !== p.slug && x.category !== p.category; })).slice(0, 3);
      var url = abs(path);
      var share = encodeURIComponent(url), shareT = encodeURIComponent(p.title);
      var crumbs = '<ol class="crumbs"><li><a href="' + (P || './') + '">Home</a></li>' + (c ? '<li><a href="' + P + catPath(c) + '">' + esc(c.name) + '</a></li>' : '') + '</ol>';
      var main = '<main id="main" class="wrap"><article>' +
        '<header class="post-head">' + crumbs + '<h1>' + esc(p.title) + '</h1>' +
        (p.description ? '<p class="deck">' + esc(p.description) + '</p>' : '') +
        '<div class="meta"><span>By ' + (aboutPage ? '<a href="' + P + 'about/">' + esc(author.name || site.name) + '</a>' : esc(author.name || site.name)) + '</span>' +
        '<time datetime="' + esc(p.date) + '">' + fmtDate(p.date) + '</time>' +
        (p.updated && p.updated !== p.date ? '<time datetime="' + esc(p.updated) + '">Updated ' + fmtDate(p.updated) + '</time>' : '') +
        '<span>' + readingTime(p.body) + ' min read</span></div></header>' +
        '<div class="post-cover">' + cover(p, P, { eager: true, decorative: true }) + '</div>' +
        '<div class="post-grid">' +
        (md.toc.length > 2 ? '<nav class="toc" aria-label="In this article"><h2>In this article</h2><ol>' + md.toc.map(function (t) { return '<li><a href="#' + t.id + '">' + t.text + '</a></li>'; }).join('') + '</ol></nav>' : '') +
        '<div class="post-main">' +
        (p.takeaways && p.takeaways.length ? '<aside class="takeaways" aria-label="Key points"><h2>The short version</h2><ul>' + p.takeaways.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></aside>' : '') +
        '<div class="prose">' + md.html + '</div>' +
        '<footer class="post-foot"><div class="share"><span>Share this article</span>' +
        '<a href="https://wa.me/?text=' + shareT + '%20' + share + '" rel="noopener nofollow">WhatsApp</a>' +
        '<a href="https://twitter.com/intent/tweet?text=' + shareT + '&amp;url=' + share + '" rel="noopener nofollow">X</a>' +
        '<a href="https://www.facebook.com/sharer/sharer.php?u=' + share + '" rel="noopener nofollow">Facebook</a>' +
        '<button type="button" id="copy">Copy link</button></div>' +
        '<div class="author"><div class="author-badge" aria-hidden="true">' + esc((author.name || site.name).charAt(0)) + '</div><div><h2>' + (brandAuthor ? 'Published by ' : 'Written by ') + esc(author.name || site.name) + '</h2>' +
        (author.bio ? '<p>' + esc(author.bio) + (aboutPage ? ' <a href="' + P + 'about/">More about this site</a>' : '') + '</p>' : '') + '</div></div>' +
        (site.disclaimer ? '<p class="note">' + esc(site.disclaimer) + '</p>' : '') +
        '</footer></div></div></article>' +
        (related.length ? '<section class="section related" aria-labelledby="rel"><div class="section-head"><h2 id="rel">Keep reading</h2></div><ul class="cards">' + related.map(function (r) { return card(r, P); }).join('') + '</ul></section>' : '') +
        newsletter() + '</main>';

      var schema = [{
        '@context': 'https://schema.org',
        '@graph': [{
          '@type': 'BlogPosting', '@id': url + '#article', headline: p.title, description: p.description || '',
          image: [ogFor(p)], datePublished: isoDate(p.date), dateModified: isoDate(p.updated || p.date),
          author: personSchema, publisher: orgSchema, mainEntityOfPage: url, wordCount: wordCount(p.body),
          articleSection: catName(p), inLanguage: site.language || 'en'
        }, {
          '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: abs('') }]
            .concat(c ? [{ '@type': 'ListItem', position: 2, name: c.name, item: abs(catPath(c)) }] : [])
            .concat([{ '@type': 'ListItem', position: c ? 3 : 2, name: p.title }])
        }]
      }];
      var t = p.seoTitle || p.title;
      return layout({
        path: path, prefix: opt.prefix, title: (t + ' | ' + site.name).length <= 62 ? t + ' | ' + site.name : t, ogTitle: p.title,
        description: p.description, image: ogFor(p), type: 'article', progress: true, schema: schema, main: main, noindex: opt.noindex,
        extraMeta: '<meta property="article:published_time" content="' + isoDate(p.date) + '">\n<meta property="article:modified_time" content="' + isoDate(p.updated || p.date) + '">\n' +
          '<meta property="article:section" content="' + esc(catName(p)) + '">\n<meta name="author" content="' + esc(author.name || site.name) + '">'
      });
    }
    posts.forEach(function (p) { files[postPath(p) + 'index.html'] = renderPost(p); });

    /* ---- home + pagination ---- */
    var per = Math.max(3, site.perPage || 10);
    var featured = posts.filter(function (p) { return p.featured; });
    var lead = featured[0] || posts[0];
    var picks = featured.filter(function (p) { return p !== lead; }).slice(0, 3);
    var rest = posts.filter(function (p) { return p !== lead && picks.indexOf(p) < 0; });
    var pageCount = Math.max(1, Math.ceil(rest.length / per));
    var listPath = function (n) { return n === 1 ? '' : 'page/' + n + '/'; };
    for (var n = 1; n <= pageCount; n++) {
      (function (n) {
        var path = listPath(n), P = prefixFor(path);
        var slice = rest.slice((n - 1) * per, n * per);
        var pager = pageCount > 1 ? '<nav class="pager" aria-label="More articles">' +
          (n > 1 ? '<a href="' + ((P + listPath(n - 1)) || './') + '" rel="prev">Newer articles</a>' : '<span></span>') +
          (n < pageCount ? '<a href="' + P + listPath(n + 1) + '" rel="next">Older articles</a>' : '<span></span>') + '</nav>' : '';
        var list = slice.length ? '<section class="section" aria-labelledby="latest"><div class="section-head"><h2 id="latest">' + (n === 1 ? 'Latest articles' : 'Articles, page ' + n) + '</h2></div><ul class="cards">' +
          slice.map(function (p) { return card(p, P); }).join('') + '</ul>' + pager + '</section>' : '';
        var main;
        if (n === 1) {
          main = '<main id="main" class="wrap">' +
            '<section class="hero"><div class="hero-text"><h1>' + esc(site.tagline || site.name) + '</h1><p>' + esc(site.intro || site.description || '') + '</p></div>' +
            (lead ? '<article class="lead">' + cover(lead, P, { eager: true, decorative: true }) + '<h2><a class="stretch" href="' + P + postPath(lead) + '">' + esc(lead.title) + '</a></h2><p>' + esc(lead.description) + '</p>' + metaLine(lead, P) + '</article>' : '') +
            '</section>' +
            (picks.length ? '<section class="section" aria-labelledby="start"><div class="section-head"><h2 id="start">Start here</h2></div><ul class="cards">' + picks.map(function (p) { return card(p, P); }).join('') + '</ul></section>' : '') +
            list +
            (liveCats.length ? '<section class="section" aria-labelledby="topics"><div class="section-head"><h2 id="topics">Browse by topic</h2></div><ul class="topics">' + liveCats.map(function (c) {
              var count = posts.filter(function (p) { return p.category === c.slug; }).length;
              return '<li><div class="topic c-' + esc(c.color || 'green') + '"><h3><a class="stretch" href="' + P + catPath(c) + '">' + esc(c.name) + '</a></h3><p>' + esc(c.description || '') + '</p><span class="count">' + count + (count === 1 ? ' article' : ' articles') + '</span></div></li>';
            }).join('') + '</ul></section>' : '') +
            (!posts.length ? '<section class="section"><p>No articles are published yet. Open the admin dashboard, write one and choose Publish.</p></section>' : '') +
            newsletter() + '</main>';
        } else {
          main = '<main id="main" class="wrap"><header class="page-head"><ol class="crumbs"><li><a href="' + P + '">Home</a></li></ol><h1>All articles</h1></header>' + list + '</main>';
        }
        files[path + 'index.html'] = layout({
          path: path, main: main, noindex: n > 1,
          title: n === 1 ? (site.seoTitle || site.name + ' — ' + (site.tagline || '')) : 'All articles, page ' + n + ' | ' + site.name,
          description: site.description,
          schema: n === 1 ? [{
            '@context': 'https://schema.org',
            '@graph': [
              { '@type': 'WebSite', '@id': abs('#website'), url: abs(''), name: site.name, description: site.description || '', inLanguage: site.language || 'en', publisher: { '@id': abs('#org') } },
              orgSchema
            ].concat(brandAuthor ? [] : [personSchema])
          }] : []
        });
      })(n);
    }

    /* ---- topic pages ---- */
    liveCats.forEach(function (c) {
      var path = catPath(c), P = prefixFor(path);
      var list = posts.filter(function (p) { return p.category === c.slug; });
      var main = '<main id="main" class="wrap"><header class="page-head"><ol class="crumbs"><li><a href="' + P + '">Home</a></li></ol><h1>' + esc(c.title || c.name) + '</h1>' +
        (c.description ? '<p>' + esc(c.description) + '</p>' : '') + '</header>' +
        '<ul class="cards">' + list.map(function (p) { return card(p, P, { noCat: true, tag: 'h2' }); }).join('') + '</ul></main>';
      files[path + 'index.html'] = layout({
        path: path, main: main, current: 'cat:' + c.slug,
        title: (c.title || c.name) + ' | ' + site.name, description: c.description,
        schema: [{
          '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.title || c.name, description: c.description || '', url: abs(path),
          isPartOf: { '@id': abs('#website') },
          mainEntity: { '@type': 'ItemList', itemListElement: list.map(function (p, i) { return { '@type': 'ListItem', position: i + 1, url: abs(postPath(p)), name: p.title }; }) }
        }]
      });
    });

    /* ---- plain pages (about, contact, ...) ---- */
    var tokens = function (s) {
      return String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, function (all, k) {
        var map = { email: author.email || 'hello@example.com', siteName: site.name, siteUrl: base, author: author.name || site.name, year: now.slice(0, 4) };
        return map[k] != null ? map[k] : all;
      });
    };
    pages.forEach(function (pg) {
      var path = pg.slug + '/', P = prefixFor(path);
      var md = renderMarkdown(tokens(pg.body), marked, P, pending);
      var main = '<main id="main" class="wrap"><header class="page-head"><ol class="crumbs"><li><a href="' + P + '">Home</a></li></ol><h1>' + esc(pg.title) + '</h1>' +
        (pg.updated ? '<div class="meta"><time datetime="' + esc(pg.updated) + '">Last updated ' + fmtDate(pg.updated) + '</time></div>' : '') + '</header><div class="prose">' + md.html + '</div></main>';
      var schema = [];
      if (pg.slug === 'about') schema.push({ '@context': 'https://schema.org', '@type': 'AboutPage', url: abs(path), name: pg.title, mainEntity: personSchema });
      if (pg.slug === 'contact') schema.push({ '@context': 'https://schema.org', '@type': 'ContactPage', url: abs(path), name: pg.title });
      files[path + 'index.html'] = layout({ path: path, main: main, current: 'page:' + pg.slug, title: pg.title + ' | ' + site.name, description: tokens(pg.description), schema: schema });
    });

    /* ---- 404 (served from any depth, so it uses root-based links) ---- */
    files['404.html'] = layout({
      path: '404.html', prefix: basePath, canonical: abs('404.html'), noindex: true, title: 'Page not found | ' + site.name,
      description: 'This page does not exist.',
      main: '<main id="main" class="wrap"><header class="page-head"><h1>That page is not here</h1><p>The address may be mistyped, or the article may have moved. These are the newest articles.</p></header>' +
        '<ul class="cards">' + posts.slice(0, 6).map(function (p) { return card(p, basePath, { tag: 'h2' }); }).join('') + '</ul>' +
        '<p style="margin-top:1.5rem"><a class="btn" href="' + basePath + '">Go to the home page</a></p></main>'
    });

    /* ---- sitemap, feed, robots, search index, manifest ---- */
    var newest = posts.reduce(function (m, p) { var d = p.updated || p.date; return d > m ? d : m; }, '');
    var urls = [{ loc: abs(''), lastmod: newest }]
      .concat(posts.map(function (p) { return { loc: abs(postPath(p)), lastmod: p.updated || p.date }; }))
      .concat(liveCats.map(function (c) {
        var d = posts.filter(function (p) { return p.category === c.slug; }).reduce(function (m, p) { var x = p.updated || p.date; return x > m ? x : m; }, '');
        return { loc: abs(catPath(c)), lastmod: d };
      }))
      .concat(pages.map(function (p) { return { loc: abs(p.slug + '/'), lastmod: p.updated || '' }; }));
    files['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(function (u) { return '  <url><loc>' + esc(u.loc) + '</loc>' + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') + '</url>'; }).join('\n') + '\n</urlset>\n';

    files['feed.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n' +
      '<title>' + esc(site.name) + '</title>\n<link>' + esc(abs('')) + '</link>\n<description>' + esc(site.description || '') + '</description>\n' +
      '<language>' + esc(site.language || 'en') + '</language>\n<atom:link href="' + esc(abs('feed.xml')) + '" rel="self" type="application/rss+xml"/>\n' +
      (newest ? '<lastBuildDate>' + rfc822(newest) + '</lastBuildDate>\n' : '') +
      posts.slice(0, 20).map(function (p) {
        return '<item>\n<title>' + esc(p.title) + '</title>\n<link>' + esc(abs(postPath(p))) + '</link>\n<guid isPermaLink="true">' + esc(abs(postPath(p))) + '</guid>\n' +
          '<pubDate>' + rfc822(p.date) + '</pubDate>\n<category>' + esc(catName(p)) + '</category>\n<description>' + esc(p.description || '') + '</description>\n</item>';
      }).join('\n') + '\n</channel>\n</rss>\n';

    files['robots.txt'] = 'User-agent: *\nAllow: /\nDisallow: ' + basePath + 'admin/\nDisallow: ' + basePath + 'content/\n\nSitemap: ' + abs('sitemap.xml') + '\n';

    files['search.json'] = JSON.stringify(posts.map(function (p) {
      return { t: p.title, d: p.description || '', c: catName(p), u: postPath(p), k: (p.keywords || '').toLowerCase() };
    }));

    files['manifest.webmanifest'] = JSON.stringify({
      name: site.name, short_name: site.shortName || site.name, description: site.description || '', start_url: basePath, scope: basePath,
      display: 'minimal-ui', background_color: '#fbfcf8', theme_color: '#14213d',
      icons: [{ src: 'assets/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'assets/img/icon-512.png', sizes: '512x512', type: 'image/png' }]
    }, null, 2) + '\n';

    return { files: files, warnings: warnings, posts: posts, renderPost: renderPost };
  }

  return {
    build: build, renderMarkdown: renderMarkdown, slugify: slugify, wordCount: wordCount, readingTime: readingTime,
    fmtDate: fmtDate, figLen: figLen, esc: esc, plainText: plainText
  };
});
