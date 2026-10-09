/* Guidelark — front-end behaviour. No libraries, loaded with `defer`. */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement;
  var root = html.getAttribute('data-root') || './';
  var $ = function (s, el) { return (el || doc).querySelector(s); };

  /* Opened straight from disk (file://)? Folder links need index.html. */
  if (location.protocol === 'file:') {
    doc.querySelectorAll('a[href]').forEach(function (a) {
      var h = a.getAttribute('href');
      if (/^(https?:|mailto:|#)/.test(h)) return;
      var parts = h.split('#');
      if (/\/$/.test(parts[0])) a.setAttribute('href', parts[0] + 'index.html' + (parts[1] ? '#' + parts[1] : ''));
    });
  }

  /* Theme */
  var themeBtn = $('#theme');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var dark = html.getAttribute('data-theme') === 'dark' ||
      (!html.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    var next = dark ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  /* Mobile menu */
  var menuBtn = $('#menu'), nav = $('#nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.focus();
      }
    });
  }

  /* Search: the index is only downloaded the first time search is opened */
  var dlg = $('#search'), openBtn = $('#search-open');
  if (dlg && openBtn && dlg.showModal) {
    var input = $('input', dlg), out = $('.search-out', dlg), msg = $('.search-msg', dlg), index = null;
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var run = function () {
      if (!index) return;
      var words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) { out.innerHTML = ''; msg.textContent = 'Type to search ' + index.length + ' articles.'; msg.hidden = false; return; }
      var hits = [];
      index.forEach(function (p) {
        var title = p.t.toLowerCase(), hay = title + ' ' + p.d.toLowerCase() + ' ' + p.c.toLowerCase() + ' ' + (p.k || '');
        var score = 0;
        for (var i = 0; i < words.length; i++) {
          if (hay.indexOf(words[i]) < 0) return;
          score += title.indexOf(words[i]) >= 0 ? 3 : 1;
        }
        hits.push({ p: p, s: score });
      });
      hits.sort(function (a, b) { return b.s - a.s; });
      out.innerHTML = hits.slice(0, 12).map(function (h) {
        var u = root + h.p.u + (location.protocol === 'file:' ? 'index.html' : '');
        return '<li><a href="' + esc(u) + '">' + esc(h.p.t) + '<small>' + esc(h.p.c) + '</small></a></li>';
      }).join('');
      msg.hidden = hits.length > 0;
      if (!hits.length) msg.textContent = 'No articles match "' + input.value + '". Try a shorter word.';
    };
    openBtn.addEventListener('click', function () {
      dlg.showModal(); input.focus();
      if (index) return;
      msg.textContent = 'Loading…';
      fetch(root + 'search.json').then(function (r) { return r.json(); }).then(function (d) { index = d; run(); })
        .catch(function () { msg.textContent = 'Search is unavailable when the site is opened as a file. It works once the site is online.'; });
    });
    input.addEventListener('input', run);
    $('.search-close', dlg).addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }

  /* Article: copy link, contents highlight, reading progress */
  var copy = $('#copy');
  if (copy) copy.addEventListener('click', function () {
    var done = function () { copy.textContent = 'Link copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, function () {});
  });

  var toc = $('.toc');
  if (toc && 'IntersectionObserver' in window) {
    var links = {};
    toc.querySelectorAll('a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var current;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        if (current) current.classList.remove('on');
        current = links[en.target.id];
        if (current) current.classList.add('on');
      });
    }, { rootMargin: '0px 0px -70% 0px' });
    doc.querySelectorAll('.prose h2[id]').forEach(function (h) { io.observe(h); });
  }

  var bar = $('.progress'), prose = $('.prose');
  if (bar && prose) {
    var ticking = false;
    var update = function () {
      ticking = false;
      var r = prose.getBoundingClientRect();
      var p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight * 0.6)));
      bar.style.transform = 'scaleX(' + p + ')';
    };
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  }
})();
