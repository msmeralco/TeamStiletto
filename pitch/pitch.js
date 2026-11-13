/* TANAW pitch deck — navigation, scaling, presenter view, timers, demo helpers.
   Plain JS, no dependencies, works offline. */
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var MODE = qs.has('presenter') ? 'presenter' : (qs.has('read') ? 'read' : 'stage');
  var stage = document.getElementById('stage');
  var slides = Array.prototype.slice.call(document.querySelectorAll('section.slide'));
  var mains = slides.filter(function (s) { return !s.hasAttribute('data-backup'); });
  var limitMeta = document.querySelector('meta[name="pitch-limit"]');
  var LIMIT = parseInt(limitMeta ? limitMeta.content : '300', 10) || 300;
  var WIN = Math.random().toString(36).slice(2);

  var st = { idx: 0, step: 0, black: false, timerRunning: false, timerStart: 0 };
  var slideEnteredAt = Date.now();
  var digitBuf = '';
  var vBroken = false;
  var framesLoaded = false;
  var suppressHash = false;

  function $(id) { return document.getElementById(id); }
  function stepsOf(sec) {
    return Array.prototype.slice.call(sec.querySelectorAll('[data-step]'))
      .sort(function (a, b) { return (+a.dataset.step) - (+b.dataset.step); });
  }
  function maxStep(sec) {
    return stepsOf(sec).reduce(function (m, e) { return Math.max(m, +e.dataset.step); }, 0);
  }
  function fmt(secs) {
    secs = Math.max(0, Math.floor(secs));
    return Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2);
  }

  /* ---------- clones (overview, presenter, read mode) ---------- */
  function cloneFor(sec) {
    var c = sec.cloneNode(true);
    c.removeAttribute('id');
    Array.prototype.forEach.call(c.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
    Array.prototype.forEach.call(c.querySelectorAll('iframe'), function (f) {
      var d = document.createElement('div');
      d.className = 'iframe-ph';
      d.textContent = f.getAttribute('data-src') || f.getAttribute('src') || '';
      f.parentNode.replaceChild(d, f);
    });
    Array.prototype.forEach.call(c.querySelectorAll('video'), function (v) { v.remove(); });
    c.classList.add('clone');
    c.setAttribute('aria-hidden', 'true');
    return c;
  }

  /* ---------- state application ---------- */
  function applyState() {
    var sec = slides[st.idx];
    if (shownIdx !== st.idx) {
      if (shownIdx >= 0) parallax(slides[shownIdx], sec, st.idx > shownIdx ? 1 : -1);
      shownIdx = st.idx;
    }
    slides.forEach(function (s, i) { s.classList.toggle('active', i === st.idx); });
    stepsOf(sec).forEach(function (e) { e.classList.toggle('step-on', +e.dataset.step <= st.step); });

    var hud = $('hud');
    var mi = mains.indexOf(sec);
    if (hud) {
      if (mi >= 0 && !sec.hasAttribute('data-fade')) {
        hud.hidden = false;
        $('slidenum').textContent = (mi + 1) + ' / ' + mains.length;
        document.querySelector('#progress i').style.width = ((mi + 1) / mains.length * 100) + '%';
      } else {
        hud.hidden = true;
      }
    }
    var black = $('black');
    if (black) black.hidden = !st.black;

    if (sec.id === 'demo' && MODE === 'stage') loadDemoFrames();

    var want = '#/' + sec.id;
    if (location.hash !== want) { suppressHash = true; location.hash = want; }

    renderPresenter();
  }

  function goTo(idx, step, broadcast) {
    if (idx < 0 || idx >= slides.length) return;
    if (idx !== st.idx) slideEnteredAt = Date.now();
    st.idx = idx;
    st.step = Math.max(0, Math.min(step || 0, maxStep(slides[idx])));
    applyState();
    if (broadcast !== false) send('state');
  }

  function next() {
    var sec = slides[st.idx];
    if (st.step < maxStep(sec)) { st.step++; applyState(); send('state'); return; }
    if (sec.hasAttribute('data-backup')) {
      if (st.idx + 1 < slides.length) goTo(st.idx + 1, 0);
      return;
    }
    var mi = mains.indexOf(sec);
    if (mi >= 0 && mi + 1 < mains.length) goTo(slides.indexOf(mains[mi + 1]), 0);
  }

  function prev() {
    var sec = slides[st.idx];
    if (st.step > 0) { st.step--; applyState(); send('state'); return; }
    if (sec.hasAttribute('data-backup')) {
      if (st.idx - 1 >= 0) goTo(st.idx - 1, maxStep(slides[st.idx - 1]));
      return;
    }
    var mi = mains.indexOf(sec);
    if (mi > 0) {
      var tgt = slides.indexOf(mains[mi - 1]);
      goTo(tgt, maxStep(slides[tgt]));
    }
  }

  function gotoMain(n) {
    if (n >= 0 && n < mains.length) goTo(slides.indexOf(mains[n]), 0);
  }
  function gotoId(id) {
    var i = slides.findIndex(function (s) { return s.id === id; });
    if (i >= 0) goTo(i, 0);
  }

  /* ---------- hash routing (#/3, #/demo, #/backup-privacy) ---------- */
  function applyHash() {
    var h = location.hash.replace(/^#\/?/, '');
    if (!h) return;
    if (/^\d+$/.test(h)) { gotoMain(parseInt(h, 10) - 1); return; }
    gotoId(h);
  }
  window.addEventListener('hashchange', function () {
    if (suppressHash) { suppressHash = false; return; }
    applyHash();
  });

  /* ---------- sync: BroadcastChannel with localStorage fallback ---------- */
  var chan = null;
  try {
    chan = new BroadcastChannel('tanaw-pitch');
    chan.onmessage = function (e) { onMsg(e.data); };
  } catch (err) { chan = null; }

  function send(type) {
    var msg = {
      src: WIN, type: type,
      state: {
        idx: st.idx, step: st.step, black: st.black,
        timerRunning: st.timerRunning, timerStart: st.timerStart,
        theme: document.documentElement.dataset.theme || ''
      }
    };
    if (chan) { try { chan.postMessage(msg); } catch (err) {} }
    try { localStorage.setItem('tanaw-pitch-msg', JSON.stringify({ m: msg, n: Math.random() })); } catch (err) {}
  }
  window.addEventListener('storage', function (e) {
    if (e.key === 'tanaw-pitch-msg' && e.newValue) {
      try { onMsg(JSON.parse(e.newValue).m); } catch (err) {}
    }
  });
  function onMsg(m) {
    if (!m || m.src === WIN) return;
    if (m.type === 'hello') { send('state'); return; }
    if (m.type === 'state' && m.state) {
      var prevIdx = st.idx;
      st.idx = Math.max(0, Math.min(m.state.idx | 0, slides.length - 1));
      st.step = m.state.step | 0;
      st.black = !!m.state.black;
      st.timerRunning = !!m.state.timerRunning;
      st.timerStart = m.state.timerStart || 0;
      if (m.state.theme !== undefined) {
        if (m.state.theme) document.documentElement.dataset.theme = m.state.theme;
        else delete document.documentElement.dataset.theme;
      }
      if (st.idx !== prevIdx) slideEnteredAt = Date.now();
      applyState();
    }
  }

  /* ---------- theme / black / fullscreen / timer ---------- */
  function toggleTheme() {
    var root = document.documentElement;
    if (root.dataset.theme === 'dark') delete root.dataset.theme;
    else root.dataset.theme = 'dark';
    try { localStorage.setItem('tanaw-pitch-theme', root.dataset.theme || ''); } catch (err) {}
    send('state');
  }
  function toggleBlack() { st.black = !st.black; applyState(); send('state'); }
  function toggleFullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); }
    else { document.documentElement.requestFullscreen().catch(function () {}); }
  }
  function toggleTimer() {
    if (st.timerRunning) { st.timerRunning = false; st.timerStart = 0; }
    else { st.timerRunning = true; st.timerStart = Date.now(); }
    send('state');
  }

  /* ---------- overview ---------- */
  function overviewOpen() { return !$('overview').hidden; }
  function toggleOverview(force) {
    var ov = $('overview');
    var show = force !== undefined ? force : ov.hidden;
    if (show) {
      var grid = $('ovgrid');
      grid.textContent = '';
      slides.forEach(function (sec, i) {
        var item = document.createElement('div');
        item.className = 'ov-item' + (i === st.idx ? ' current' : '');
        var shot = document.createElement('div');
        shot.className = 'ov-shot';
        shot.appendChild(cloneFor(sec));
        var cap = document.createElement('div');
        cap.className = 'ov-cap';
        var mi = mains.indexOf(sec);
        cap.innerHTML = (mi >= 0 ? (mi + 1) + ' · ' : '<span class="bk">B</span> · ') + sec.id;
        item.appendChild(shot); item.appendChild(cap);
        item.addEventListener('click', function () { toggleOverview(false); goTo(i, maxStep(sec)); });
        grid.appendChild(item);
      });
      ov.hidden = false;
    } else {
      ov.hidden = true;
    }
  }

  /* ---------- demo helpers ---------- */
  function loadDemoFrames() {
    if (framesLoaded) return;
    framesLoaded = true;
    Array.prototype.forEach.call(document.querySelectorAll('#demo iframe[data-src]'), function (f) {
      f.src = f.getAttribute('data-src');
    });
  }
  var bv = $('bvideo');
  if (bv) {
    bv.addEventListener('error', function () { vBroken = true; }, true);
  }
  function videoBroken() {
    return vBroken || !bv || !!bv.error || bv.networkState === 3; /* NETWORK_NO_SOURCE */
  }
  function toggleVideo() {
    var vl = $('videoLayer');
    if (!vl) return;
    if (vl.hidden) {
      if (slides[st.idx].id !== 'demo') gotoId('demo');
      vl.hidden = false;
      var broken = videoBroken();
      $('vcaption').hidden = !broken;
      bv.style.display = broken ? 'none' : '';
      if (!broken) { try { bv.currentTime = 0; } catch (err) {} bv.play().catch(function () {}); }
    } else {
      vl.hidden = true;
      if (bv) bv.pause();
    }
  }

  /* ---------- presenter view ---------- */
  function openPresenter() {
    window.open(location.pathname + '?presenter' + location.hash, 'tanaw-presenter', 'width=1200,height=760');
  }
  function fitClone(wrap) {
    var c = wrap.querySelector('.clone');
    if (!c) return;
    var s = wrap.clientWidth / 1920;
    c.style.transform = 'scale(' + s + ')';
    wrap.style.height = (1080 * s) + 'px';
  }
  function renderPresenter() {
    if (MODE !== 'presenter') return;
    var sec = slides[st.idx];
    var nxt = slides[st.idx + 1];
    var cur = $('pvCur'), nx = $('pvNext');
    cur.textContent = ''; cur.appendChild(cloneFor(sec)); fitClone(cur);
    nx.textContent = '';
    if (nxt) { nx.appendChild(cloneFor(nxt)); fitClone(nx); }
    else { nx.style.height = 'auto'; nx.textContent = '— end of deck —'; }
    var notes = sec.querySelector('.notes');
    $('pvNotes').textContent = notes
      ? notes.textContent.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).join('\n')
      : '';
    $('pvSpeaker').textContent = sec.dataset.speaker ? 'Speaker: ' + sec.dataset.speaker : '';
    var mi = mains.indexOf(sec);
    $('pvCount').textContent = mi >= 0
      ? 'Slide ' + (mi + 1) + ' of ' + mains.length + ' — ' + sec.id
      : 'Backup — ' + sec.id;
    $('pvSlideBudget').textContent = sec.dataset.time ? 'of ' + sec.dataset.time + 's planned' : 'no time budget (backup)';
    $('pvLimitLab').textContent = 'of ' + fmt(LIMIT) + ' limit';
  }
  function tickTimers() {
    if (MODE !== 'presenter') return;
    var el = st.timerRunning ? (Date.now() - st.timerStart) / 1000 : 0;
    var tot = $('pvTotal');
    tot.textContent = fmt(el);
    tot.classList.toggle('red', el >= LIMIT);
    tot.classList.toggle('amber', el >= LIMIT * 0.85 && el < LIMIT);
    var sl = (Date.now() - slideEnteredAt) / 1000;
    var slT = $('pvSlideT');
    slT.textContent = fmt(sl);
    var budget = parseInt(slides[st.idx].dataset.time || '0', 10);
    slT.classList.toggle('red', budget > 0 && sl >= budget);
    slT.classList.toggle('amber', budget > 0 && sl >= budget * 0.85 && sl < budget);
  }

  /* ---------- read mode ---------- */
  function initRead() {
    document.body.classList.add('read-mode');
    var holder = document.createElement('div');
    holder.id = 'readlist';
    mains.forEach(function (sec) {
      var w = document.createElement('div');
      w.className = 'read-wrap';
      w.appendChild(cloneFor(sec));
      holder.appendChild(w);
    });
    document.body.appendChild(holder);
    stage.remove();
    var fit = function () {
      Array.prototype.forEach.call(holder.querySelectorAll('.read-wrap'), function (w) {
        var s = w.clientWidth / 1920;
        w.firstChild.style.transform = 'scale(' + s + ')';
        w.style.height = (1080 * s) + 'px';
      });
    };
    window.addEventListener('resize', fit);
    fit();
  }

  /* ---------- stage scaling ---------- */
  /* Scale so the 1920x1080 design fits, then widen/heighten the stage to the
     window's aspect ratio so there are no letterbox bars. Slides are flex-centred,
     so content stays centred and edge-anchored labels follow the window edges. */
  function fitStage() {
    if (MODE !== 'stage') return;
    var w = window.innerWidth, h = window.innerHeight;
    var s = Math.min(w / 1920, h / 1080);
    stage.style.width = (w / s) + 'px';
    stage.style.height = (h / s) + 'px';
    stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }

  /* ---------- parallax slide transition ---------- */
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var running = [];
  var shownIdx = -1;
  var EASE = 'cubic-bezier(0.65, 0, 0.25, 1)';
  var DUR = 750;
  var WRAPPERS = ['split-cols', 'center-col', 'split-left', 'split-right', 'demohead'];

  /* The visible "layers" of a slide, in reading order; wrapper divs are flattened
     so each heading / card / table moves on its own. */
  function layersOf(sec) {
    var out = [];
    (function walk(el) {
      Array.prototype.forEach.call(el.children, function (c) {
        if (c.classList.contains('notes')) return;
        if (WRAPPERS.some(function (w) { return c.classList.contains(w); })) walk(c);
        else out.push(c);
      });
    })(sec);
    return out;
  }

  function stopTransition() {
    running.forEach(function (a) { try { a.cancel(); } catch (err) {} });
    running = [];
    slides.forEach(function (s) { s.classList.remove('leaving'); });
  }

  function parallax(from, to, dir) {
    stopTransition();
    if (reduceMotion || MODE !== 'stage' || !from || !to || !to.animate) return;
    /* data-fade slide (the closing black one): the previous slide's logo is the anchor.
       Black grows out of the logo's own rounded square until it covers the page,
       then the logo eases down to its place and the text arrives (text timing is in CSS). */
    if (to.hasAttribute('data-fade') && dir > 0) {
      var lf = from.querySelector('img.logo'), lt = to.querySelector('img.logo');
      if (lf && lt) {
        var sr = stage.getBoundingClientRect();
        var kx = sr.width / stage.offsetWidth, ky = sr.height / stage.offsetHeight;
        var W0 = stage.offsetWidth, H0 = stage.offsetHeight;
        var rf = lf.getBoundingClientRect(), rt = lt.getBoundingClientRect();
        var L = (rf.left - sr.left) / kx, T = (rf.top - sr.top) / ky;
        var w = rf.width / kx, h = rf.height / ky;
        var dx = (rf.left - rt.left) / kx, dy = (rf.top - rt.top) / ky;
        from.classList.add('leaving');
        var grow = to.animate([
          { clipPath: 'inset(' + T + 'px ' + (W0 - L - w) + 'px ' + (H0 - T - h) + 'px ' + L + 'px round ' + (w * 0.225) + 'px)' },
          { clipPath: 'inset(0px 0px 0px 0px round 0px)' }
        ], { duration: 1000, easing: 'cubic-bezier(0.65, 0, 0.25, 1)', fill: 'both' });
        var T0 = 'translate(' + dx + 'px,' + dy + 'px)';
        var drop = lt.animate([
          { transform: T0, offset: 0 },
          { transform: T0, offset: 0.45, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
          { transform: 'none', offset: 1 }
        ], { duration: 2000, fill: 'both' });
        running.push(grow, drop);
        grow.onfinish = function () { from.classList.remove('leaving'); };
        return;
      }
    }
    from.classList.add('leaving');
    var opts = { duration: DUR, easing: EASE };
    var px = function (v) { return 'translateX(' + v + 'px)'; };
    var W = stage.offsetWidth;

    /* back plane: the outgoing slide drifts only a third of the way and dims */
    running.push(from.animate([
      { transform: px(0), filter: 'brightness(1)' },
      { transform: px(-dir * W * 0.33), filter: 'brightness(0.55)' }
    ], opts));
    /* front plane: the incoming slide sweeps in over it */
    running.push(to.animate([
      { transform: px(dir * W), boxShadow: '0 0 0 rgba(0,0,0,0)' },
      { transform: px(0), boxShadow: (-dir * 30) + 'px 0 80px rgba(0,0,0,0.25)', offset: 0.6 },
      { transform: px(0), boxShadow: '0 0 0 rgba(0,0,0,0)' }
    ], opts));

    /* inner layers move at different speeds: later layers lag further behind */
    layersOf(to).forEach(function (el, i) {
      var depth = Math.min(i + 1, 5);
      running.push(el.animate([
        { transform: px(dir * 140 * depth), opacity: 0 },
        { opacity: 1, offset: 0.55 },
        { transform: px(0), opacity: 1 }
      ], { duration: DUR + depth * 60, easing: EASE }));
    });
    layersOf(from).forEach(function (el, i) {
      var depth = Math.min(i + 1, 5);
      running.push(el.animate([
        { transform: px(0) },
        { transform: px(-dir * 90 * depth) }
      ], opts));
    });

    var last = running[0];
    last.onfinish = function () { from.classList.remove('leaving'); };
  }

  /* ---------- keys ---------- */
  function onEsc() {
    if (overviewOpen()) { toggleOverview(false); return; }
    if (!$('videoLayer').hidden) { toggleVideo(); return; }
    if (slides[st.idx].id === 'demo') { document.body.focus(); return; } /* "press Esc to return to the slides" */
    toggleOverview(true);
  }
  window.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (/^[0-9]$/.test(k)) { digitBuf += k; return; }
    switch (k) {
      case 'ArrowRight': case ' ': case 'PageDown': case 'ArrowDown':
        next(); e.preventDefault(); break;
      case 'Enter':
        if (digitBuf) { gotoMain(parseInt(digitBuf, 10) - 1); digitBuf = ''; }
        else next();
        e.preventDefault(); break;
      case 'ArrowLeft': case 'PageUp': case 'Backspace': case 'ArrowUp':
        prev(); e.preventDefault(); break;
      case 'Home': gotoMain(0); e.preventDefault(); break;
      case 'End': gotoMain(mains.length - 1); e.preventDefault(); break;
      case 'd': case 'D': gotoId('demo'); break;
      case 'v': case 'V': toggleVideo(); break;
      case 'o': case 'O': toggleOverview(); break;
      case 'Escape': onEsc(); break;
      case 'b': case 'B': case '.': toggleBlack(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'p': case 'P': openPresenter(); break;
      case 't': case 'T': toggleTheme(); break;
      case 's': case 'S': toggleTimer(); break;
      default: digitBuf = '';
    }
  });

  /* click/tap: right third forward, left third back */
  if (stage) {
    stage.addEventListener('click', function (e) {
      if (e.target.closest('button, a, iframe, video, input, textarea')) return;
      if (overviewOpen()) return;
      var x = e.clientX;
      if (x < window.innerWidth / 3) prev();
      else if (x > window.innerWidth * 2 / 3) next();
    });
  }

  var openBtn = $('openDemo');
  if (openBtn) {
    openBtn.addEventListener('click', function () {
      window.open('http://localhost:8000', 'tanaw-app');
    });
  }

  /* ---------- init ---------- */
  try {
    var saved = localStorage.getItem('tanaw-pitch-theme');
    if (saved) document.documentElement.dataset.theme = saved;
  } catch (err) {}

  if (MODE === 'read') { initRead(); return; }

  if (MODE === 'presenter') {
    document.body.classList.add('presenter-mode');
    $('presenter').hidden = false;
    if (location.protocol === 'file:') $('pvSync').hidden = false;
    window.addEventListener('resize', function () {
      fitClone($('pvCur')); fitClone($('pvNext'));
    });
    setInterval(tickTimers, 250);
  } else {
    window.addEventListener('resize', fitStage);
    fitStage();
  }

  applyHash();
  applyState();
  send('hello');
})();
