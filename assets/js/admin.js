/*!
 * Portfolio Admin Panel (front-end only)
 * - Sign in with email + password (password is stored only as a SHA-256 hash)
 * - Edit text, upload images, manage projects
 * - Data is saved in THIS browser (localStorage + IndexedDB)
 *
 * IMPORTANT: this is a client-side panel. It is NOT real security and the
 * changes are not visible to other visitors. For a public, secure admin you
 * need a backend (e.g. Firebase / Supabase).
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Config                                                              */
  /* ------------------------------------------------------------------ */
  var CFG = {
    email: 'harthikgokul@gmail.com',
    salt: 'gk-portfolio-v1:',
    hash: '204dfc7e4a2fc7a7b7310bea9d2f24e4fbfe6f5e73973c99ef4dcbdad02993bf',
    lsKey: 'gk_cms_v1',
    sessionKey: 'gk_admin_session',
    lockKey: 'gk_admin_lock',
    maxTries: 5,
    lockSeconds: 60
  };

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* SHA-256 (works on http/file too, no crypto.subtle needed) */
  function sha256(ascii) {
    var utf8 = unescape(encodeURIComponent(ascii));
    var words = [], i, j;
    var K = [], H = [], primes = [], n = 2;
    while (primes.length < 64) {
      var isP = true;
      for (i = 0; i < primes.length; i++) { if (n % primes[i] === 0) { isP = false; break; } }
      if (isP) primes.push(n);
      n++;
    }
    for (i = 0; i < 64; i++) {
      K[i] = (Math.pow(primes[i], 1 / 3) * 4294967296) | 0;
      if (i < 8) H[i] = (Math.pow(primes[i], 1 / 2) * 4294967296) | 0;
    }
    var bitLen = utf8.length * 8;
    utf8 += '\x80';
    while (utf8.length % 64 - 56) utf8 += '\x00';
    for (i = 0; i < utf8.length; i++) {
      j = utf8.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((bitLen / 4294967296) | 0);
    words[words.length] = (bitLen);
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = H.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = H[0], e = H[4];
        var t1 = H[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & H[5]) ^ (~e & H[6])) + K[i] +
          (w[i] = (i < 16) ? (w[i] | 0) : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
        H = [(t1 + t2) | 0].concat(H);
        H[4] = (H[4] + t1) | 0;
        H.length = 8;
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + old[i]) | 0;
    }
    var out = '';
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (H[i] >> (j * 8)) & 255;
        out += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Storage: text in localStorage, images in IndexedDB                  */
  /* ------------------------------------------------------------------ */
  var data = loadData();
  function loadData() {
    try {
      var d = JSON.parse(localStorage.getItem(CFG.lsKey) || 'null');
      if (d && typeof d === 'object') {
        d.text = d.text || {}; d.images = d.images || {}; d.projects = d.projects || null;
        return d;
      }
    } catch (e) { /* ignore */ }
    return { text: {}, images: {}, projects: null };
  }
  function saveData() { localStorage.setItem(CFG.lsKey, JSON.stringify(data)); }

  var dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB not supported')); return; }
      var req = indexedDB.open('gk_portfolio_cms', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('images'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction('images', mode);
        var store = tx.objectStore('images');
        var r = fn(store);
        tx.oncomplete = function () { resolve(r && r.result !== undefined ? r.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }
  function idbGet(key) { return idb('readonly', function (s) { return s.get(key); }); }
  function idbSet(key, val) { return idb('readwrite', function (s) { return s.put(val, key); }); }
  function idbDel(key) { return idb('readwrite', function (s) { return s.delete(key); }); }
  function idbClear() { return idb('readwrite', function (s) { return s.clear(); }); }
  function idbAll() {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var out = {};
        var tx = d.transaction('images', 'readonly');
        var cur = tx.objectStore('images').openCursor();
        cur.onsuccess = function () {
          var c = cur.result;
          if (c) { out[c.key] = c.value; c.continue(); }
        };
        tx.oncomplete = function () { resolve(out); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Capture defaults, then apply saved content to the page              */
  /* ------------------------------------------------------------------ */
  var defaults = { text: {}, images: {}, projects: [] };
  var imgCache = {};

  function captureDefaults() {
    $$('[data-cms]').forEach(function (n) {
      var key = n.getAttribute('data-cms');
      var attr = n.getAttribute('data-cms-attr');
      defaults.text[key] = attr ? (n.getAttribute(attr) || '') : n.textContent.replace(/\s+/g, ' ').trim();
    });
    $$('[data-cms-img]').forEach(function (n) {
      defaults.images[n.getAttribute('data-cms-img')] = n.getAttribute('src');
    });
    $$('.portfolio-container .portfolio-item').forEach(function (item, i) {
      var cat = 'filter-web';
      (item.className.match(/filter-[a-z]+/g) || []).some(function (c) { cat = c; return true; });
      var link = $('a.portfolio-details-lightbox', item);
      var img = $('img', item);
      defaults.projects.push({
        id: 'orig' + i,
        title: ($('h4', item) || {}).textContent || '',
        sub: ($('.portfolio-info p', item) || {}).textContent || '',
        category: cat,
        link: link ? link.getAttribute('href') : '',
        imgUrl: img ? img.getAttribute('src') : ''
      });
    });
  }

  function applyText() {
    $$('[data-cms]').forEach(function (n) {
      var key = n.getAttribute('data-cms');
      if (!Object.prototype.hasOwnProperty.call(data.text, key)) return;
      var v = data.text[key];
      var attr = n.getAttribute('data-cms-attr');
      var pre = n.getAttribute('data-cms-href-prefix');
      if (attr) n.setAttribute(attr, v);
      if (!n.hasAttribute('data-cms-textless')) n.textContent = v;
      if (pre) n.setAttribute('href', pre + v);
    });
  }

  function applyImages() {
    Object.keys(data.images).forEach(function (key) {
      idbGet(key).then(function (url) {
        if (!url) return;
        imgCache[key] = url;
        $$('[data-cms-img="' + key + '"]').forEach(function (n) { n.src = url; });
      }).catch(function () { /* ignore */ });
    });
  }

  var lightbox = null;
  function relayoutIsotope() {
    var c = $('.portfolio-container');
    if (!c || typeof Isotope === 'undefined' || !Isotope.data) return;
    var iso = Isotope.data(c);
    if (iso) { iso.reloadItems(); iso.arrange(); }
  }

  function projectImageSrc(p) {
    if (p.imgKey) return idbGet(p.imgKey).then(function (u) { return u || p.imgUrl || ''; }).catch(function () { return p.imgUrl || ''; });
    return Promise.resolve(p.imgUrl || '');
  }

  function renderProjects() {
    var c = $('.portfolio-container');
    if (!c || !data.projects) return;
    Promise.all(data.projects.map(function (p) {
      return projectImageSrc(p).then(function (src) { p._src = src; return p; });
    })).then(function (list) {
      c.innerHTML = '';
      var timer = null;
      function later() { clearTimeout(timer); timer = setTimeout(relayoutIsotope, 120); }
      list.forEach(function (p) {
        var links = el('div', { class: 'portfolio-links' }, [
          el('a', { href: p._src, 'data-gallery': 'portfolioGallery', class: 'portfolio-lightbox-cms', title: p.title }, [el('i', { class: 'bx bx-plus' })])
        ]);
        if (p.link) {
          links.appendChild(el('a', { href: p.link, target: '_blank', rel: 'noopener', title: 'Open project' }, [el('i', { class: 'bx bx-link' })]));
        }
        var img = el('img', { class: 'img-fluid', alt: p.title || '', loading: 'lazy', decoding: 'async' });
        img.addEventListener('load', later);
        img.src = p._src;
        c.appendChild(el('div', { class: 'col-lg-4 col-md-6 portfolio-item ' + (p.category || 'filter-web') }, [
          el('div', { class: 'portfolio-wrap' }, [
            img,
            el('div', { class: 'portfolio-info' }, [
              el('h4', { text: p.title }),
              el('p', { text: p.sub }),
              links
            ])
          ])
        ]));
      });
      relayoutIsotope();
      if (typeof GLightbox === 'function') {
        try { lightbox = GLightbox({ selector: '.portfolio-lightbox-cms' }); } catch (e) { /* ignore */ }
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Image processing (resize + convert to WebP)                         */
  /* ------------------------------------------------------------------ */
  function fileToDataURL(file, maxDim) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('Please choose an image file.')); return; }
      if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(new Error('Could not read file.')); };
        fr.readAsDataURL(file);
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
        var out = cv.toDataURL('image/webp', 0.86);
        if (out.indexOf('data:image/webp') !== 0) out = cv.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88);
        URL.revokeObjectURL(url);
        resolve(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not load image.')); };
      img.src = url;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */
  var toastTimer = null;
  function toast(msg, type) {
    var t = $('#admToast');
    if (!t) { t = el('div', { id: 'admToast', role: 'status' }); document.body.appendChild(t); }
    t.className = 'adm-toast adm-toast-' + (type || 'info') + ' show';
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  /* ------------------------------------------------------------------ */
  /* Auth                                                                */
  /* ------------------------------------------------------------------ */
  function isLoggedIn() { return sessionStorage.getItem(CFG.sessionKey) === '1'; }
  function lockRemaining() {
    var until = parseInt(localStorage.getItem(CFG.lockKey) || '0', 10);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  }
  var tries = 0;

  function openLogin() {
    if ($('#admLogin')) return;
    var err = el('div', { class: 'adm-error', role: 'alert' });
    var email = el('input', { type: 'email', id: 'admEmail', placeholder: ' ', autocomplete: 'username', required: 'required' });
    var pass = el('input', { type: 'password', id: 'admPass', placeholder: ' ', autocomplete: 'current-password', required: 'required' });
    var eye = el('button', { type: 'button', class: 'adm-eye', 'aria-label': 'Show password', html: '<i class="bx bx-show"></i>' });
    eye.addEventListener('click', function () {
      var show = pass.type === 'password';
      pass.type = show ? 'text' : 'password';
      eye.innerHTML = '<i class="bx ' + (show ? 'bx-hide' : 'bx-show') + '"></i>';
    });
    var submit = el('button', { type: 'submit', class: 'adm-btn adm-btn-primary adm-btn-block', text: 'Sign in' });
    var form = el('form', { class: 'adm-login-form', novalidate: 'novalidate' }, [
      el('div', { class: 'adm-field' }, [email, el('label', { for: 'admEmail', text: 'Email' })]),
      el('div', { class: 'adm-field adm-field-pass' }, [pass, el('label', { for: 'admPass', text: 'Password' }), eye]),
      err,
      submit
    ]);
    var close = el('button', { type: 'button', class: 'adm-close', 'aria-label': 'Close', html: '&times;' });
    var box = el('div', { class: 'adm-login-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Admin sign in' }, [
      close,
      el('div', { class: 'adm-login-icon', html: '<i class="bx bx-lock-alt"></i>' }),
      el('h3', { text: 'Admin Sign in' }),
      el('p', { text: 'Sign in to edit your portfolio content.' }),
      form
    ]);
    var overlay = el('div', { id: 'admLogin', class: 'adm-overlay adm-login-overlay' }, [box]);
    document.body.appendChild(overlay);
    document.body.classList.add('adm-open');
    setTimeout(function () { overlay.classList.add('show'); email.focus(); }, 10);

    function closeLogin() {
      overlay.classList.remove('show');
      document.body.classList.remove('adm-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { overlay.remove(); }, 250);
    }
    function onKey(e) { if (e.key === 'Escape') closeLogin(); }
    document.addEventListener('keydown', onKey);
    close.addEventListener('click', closeLogin);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeLogin(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';
      var wait = lockRemaining();
      if (wait > 0) { err.textContent = 'Too many attempts. Try again in ' + wait + 's.'; return; }
      var ok = email.value.trim().toLowerCase() === CFG.email && sha256(CFG.salt + pass.value) === CFG.hash;
      if (ok) {
        tries = 0;
        sessionStorage.setItem(CFG.sessionKey, '1');
        closeLogin();
        updateNav();
        toast('Signed in successfully', 'ok');
        setTimeout(openPanel, 300);
      } else {
        tries++;
        pass.value = '';
        if (tries >= CFG.maxTries) {
          localStorage.setItem(CFG.lockKey, String(Date.now() + CFG.lockSeconds * 1000));
          tries = 0;
          err.textContent = 'Too many attempts. Locked for ' + CFG.lockSeconds + ' seconds.';
        } else {
          err.textContent = 'Incorrect email or password.';
        }
        box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
      }
    });
  }

  function logout() {
    sessionStorage.removeItem(CFG.sessionKey);
    closePanel();
    updateNav();
    toast('Signed out', 'info');
  }

  function updateNav() {
    var a = $('#adminSignInLink');
    if (!a) return;
    var span = $('span', a), icon = $('i', a);
    if (isLoggedIn()) {
      span.textContent = 'Admin';
      icon.className = 'bx bx-cog';
      a.title = 'Open admin panel';
    } else {
      span.textContent = 'Sign in';
      icon.className = 'bx bx-lock-alt';
      a.title = 'Admin sign in';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Admin panel                                                         */
  /* ------------------------------------------------------------------ */
  var panel = null;
  var draft = null;          // { text:{}, images:{key:dataURL|'__reset__'} }
  var pDraft = null;         // working copy of projects
  var pDirty = false;
  var activeTab = 'hero';

  var TABS = [
    { id: 'hero', label: 'Hero', icon: 'bx-home' },
    { id: 'about', label: 'About', icon: 'bx-user' },
    { id: 'stats', label: 'Stats', icon: 'bx-bar-chart-alt-2' },
    { id: 'services', label: 'Services', icon: 'bx-briefcase-alt-2' },
    { id: 'projects', label: 'Projects', icon: 'bx-book-content' },
    { id: 'showcase', label: 'Showcase', icon: 'bx-devices' },
    { id: 'contact', label: 'Contact', icon: 'bx-envelope' },
    { id: 'backup', label: 'Backup', icon: 'bx-save' }
  ];

  function curText(key) {
    if (draft.text.hasOwnProperty(key)) return draft.text[key];
    if (data.text.hasOwnProperty(key)) return data.text[key];
    return defaults.text[key] || '';
  }
  function curImage(path) {
    var d = draft.images[path];
    if (d === '__reset__') return defaults.images[path];
    if (d) return d;
    return imgCache[path] || defaults.images[path];
  }

  function fText(label, key, opts) {
    opts = opts || {};
    var input = opts.multiline
      ? el('textarea', { id: 'f_' + key, rows: opts.rows || 4, placeholder: ' ' })
      : el('input', { id: 'f_' + key, type: opts.type || 'text', placeholder: ' ' });
    input.value = curText(key);
    input.addEventListener('input', function () { draft.text[key] = input.value; });
    var kids = [input, el('label', { for: 'f_' + key, text: label })];
    var wrap = el('div', { class: 'adm-field' + (opts.multiline ? ' adm-field-area' : '') }, kids);
    if (opts.hint) wrap.appendChild(el('small', { class: 'adm-hint', text: opts.hint }));
    return wrap;
  }

  function imagePicker(label, getSrc, onPick, onReset, maxDim, resetLabel) {
    var preview = el('img', { class: 'adm-thumb', alt: '' });
    preview.src = getSrc() || '';
    var file = el('input', { type: 'file', accept: 'image/*', class: 'adm-file' });
    var info = el('small', { class: 'adm-hint', text: '' });
    var pick = el('button', { type: 'button', class: 'adm-btn adm-btn-light', html: '<i class="bx bx-upload"></i> Upload image' });
    pick.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', function () {
      var f = file.files[0];
      if (!f) return;
      info.textContent = 'Processing...';
      fileToDataURL(f, maxDim).then(function (url) {
        onPick(url);
        preview.src = url;
        info.textContent = f.name + ' (' + Math.round(url.length * 0.75 / 1024) + ' KB)';
      }).catch(function (e) { info.textContent = ''; toast(e.message, 'err'); });
      file.value = '';
    });
    var kids = [pick];
    if (onReset) {
      var reset = el('button', { type: 'button', class: 'adm-btn adm-btn-ghost', text: resetLabel || 'Use original' });
      reset.addEventListener('click', function () { onReset(); preview.src = getSrc() || ''; info.textContent = 'Reverted (save to apply)'; });
      kids.push(reset);
    }
    return el('div', { class: 'adm-image-field' }, [
      el('div', { class: 'adm-image-label', text: label }),
      el('div', { class: 'adm-image-row' }, [preview, el('div', { class: 'adm-image-actions' }, kids.concat([info, file]))])
    ]);
  }

  function fImage(label, path, maxDim) {
    return imagePicker(label, function () { return curImage(path); },
      function (url) { draft.images[path] = url; },
      function () { draft.images[path] = '__reset__'; },
      maxDim || 1600);
  }

  function section(title, kids) {
    return el('div', { class: 'adm-group' }, [el('h4', { text: title })].concat(kids));
  }

  var CATS = [
    { v: 'filter-app', t: 'Websites' },
    { v: 'filter-chat', t: 'Posters' },
    { v: 'filter-card', t: 'Dashboard' },
    { v: 'filter-web', t: 'Other (shown in "All" only)' }
  ];

  function renderTab(body) {
    body.innerHTML = '';
    if (activeTab === 'hero') {
      body.appendChild(section('Banner', [
        fText('Your name', 'hero.name'),
        fText('Role / typing text', 'hero.role', { hint: 'Separate several roles with a comma, e.g. Web Designer, UI/UX Designer' })
      ]));
    } else if (activeTab === 'about') {
      body.appendChild(section('Profile photo', [fImage('About photo', 'about.photo', 900)]));
      body.appendChild(section('Intro', [
        fText('Heading', 'about.heading'),
        fText('Tagline', 'about.intro', { multiline: true, rows: 2 }),
        fText('Summary', 'about.summary', { multiline: true, rows: 8 })
      ]));
      body.appendChild(section('Details', [
        fText('Birthday', 'about.birthday'), fText('Phone', 'about.phone'), fText('City', 'about.city'),
        fText('Age', 'about.age'), fText('Degree', 'about.degree'), fText('Email', 'about.email')
      ]));
    } else if (activeTab === 'stats') {
      [1, 2, 3, 4].forEach(function (i) {
        body.appendChild(section('Counter ' + i, [
          fText('Number', 'stats.' + i + '.value', { type: 'number' }),
          fText('Label', 'stats.' + i + '.label')
        ]));
      });
    } else if (activeTab === 'services') {
      [1, 2, 3, 4].forEach(function (i) {
        body.appendChild(section('Service ' + i, [
          fText('Title', 'services.' + i + '.title'),
          fText('Description', 'services.' + i + '.text', { multiline: true, rows: 3 })
        ]));
      });
    } else if (activeTab === 'projects') {
      renderProjectsTab(body);
    } else if (activeTab === 'showcase') {
      body.appendChild(el('p', { class: 'adm-note', text: 'Images shown inside the Laptop, Phone and TV mockups in the UI/UX Design Showcase.' }));
      [['laptop', 'Laptop screen'], ['phone', 'Phone screen'], ['tv', 'TV screen']].forEach(function (g) {
        body.appendChild(section(g[1] + ' images', [1, 2, 3].map(function (i) {
          return fImage(g[1] + ' ' + i, 'showcase.' + g[0] + i, 1400);
        })));
      });
    } else if (activeTab === 'contact') {
      body.appendChild(section('Contact details', [
        fText('Address', 'contact.address', { multiline: true, rows: 3 }),
        fText('Email', 'contact.email', { type: 'email' }),
        fText('Phone', 'contact.phone')
      ]));
    } else if (activeTab === 'backup') {
      renderBackupTab(body);
    }
  }

  function initProjectsDraft() {
    if (pDraft) return Promise.resolve();
    var list = data.projects ? clone(data.projects) : clone(defaults.projects);
    return Promise.all(list.map(function (p) {
      return projectImageSrc(p).then(function (src) { p.preview = src; p.newImg = null; return p; });
    })).then(function (l) { pDraft = l; });
  }

  function renderProjectsTab(body) {
    initProjectsDraft().then(function () {
      body.innerHTML = '';
      body.appendChild(el('p', { class: 'adm-note', text: 'Add, edit, reorder or delete the projects shown in the Projects section. Images are resized automatically.' }));
      var addBtn = el('button', { type: 'button', class: 'adm-btn adm-btn-primary', html: '<i class="bx bx-plus"></i> Add project' });
      addBtn.addEventListener('click', function () {
        pDraft.unshift({ id: uid(), title: '', sub: '', category: 'filter-app', link: '', imgUrl: '', preview: '', newImg: null, isNew: true });
        pDirty = true; renderTab(body);
      });
      body.appendChild(addBtn);
      pDraft.forEach(function (p, idx) {
        var title = el('input', { type: 'text', placeholder: ' ', id: 'pt_' + p.id }); title.value = p.title;
        title.addEventListener('input', function () { p.title = title.value; pDirty = true; });
        var sub = el('input', { type: 'text', placeholder: ' ', id: 'ps_' + p.id }); sub.value = p.sub;
        sub.addEventListener('input', function () { p.sub = sub.value; pDirty = true; });
        var link = el('input', { type: 'url', placeholder: ' ', id: 'pl_' + p.id }); link.value = p.link || '';
        link.addEventListener('input', function () { p.link = link.value.trim(); pDirty = true; });
        var cat = el('select', { id: 'pc_' + p.id });
        CATS.forEach(function (c) { var o = el('option', { value: c.v, text: c.t }); if (c.v === p.category) o.selected = true; cat.appendChild(o); });
        cat.addEventListener('change', function () { p.category = cat.value; pDirty = true; });

        var up = el('button', { type: 'button', class: 'adm-icon-btn', title: 'Move up', html: '<i class="bx bx-chevron-up"></i>' });
        var down = el('button', { type: 'button', class: 'adm-icon-btn', title: 'Move down', html: '<i class="bx bx-chevron-down"></i>' });
        var del = el('button', { type: 'button', class: 'adm-icon-btn adm-danger', title: 'Delete project', html: '<i class="bx bx-trash"></i>' });
        up.addEventListener('click', function () { if (idx > 0) { pDraft.splice(idx - 1, 0, pDraft.splice(idx, 1)[0]); pDirty = true; renderTab(body); } });
        down.addEventListener('click', function () { if (idx < pDraft.length - 1) { pDraft.splice(idx + 1, 0, pDraft.splice(idx, 1)[0]); pDirty = true; renderTab(body); } });
        del.addEventListener('click', function () {
          if (confirm('Delete "' + (p.title || 'this project') + '"?')) { pDraft.splice(idx, 1); pDirty = true; renderTab(body); }
        });

        var picker = imagePicker('Project image', function () { return p.newImg || p.preview; },
          function (url) { p.newImg = url; p.preview = url; pDirty = true; }, null, 1600);

        body.appendChild(el('div', { class: 'adm-project' }, [
          el('div', { class: 'adm-project-head' }, [
            el('strong', { text: '#' + (idx + 1) + (p.isNew ? ' (new)' : '') }),
            el('div', { class: 'adm-project-tools' }, [up, down, del])
          ]),
          picker,
          el('div', { class: 'adm-field' }, [title, el('label', { for: 'pt_' + p.id, text: 'Title' })]),
          el('div', { class: 'adm-field' }, [sub, el('label', { for: 'ps_' + p.id, text: 'Type (e.g. Landing Page)' })]),
          el('div', { class: 'adm-field adm-field-select' }, [cat, el('label', { for: 'pc_' + p.id, text: 'Category' })]),
          el('div', { class: 'adm-field' }, [link, el('label', { for: 'pl_' + p.id, text: 'Project link (optional)' })])
        ]));
      });
      if (!pDraft.length) body.appendChild(el('p', { class: 'adm-note', text: 'No projects yet. Click "Add project".' }));
    });
  }

  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function renderBackupTab(body) {
    body.appendChild(el('p', { class: 'adm-note', text: 'Your edits live in this browser only. Export a backup so you never lose them, or move them to another browser/device.' }));
    var exp = el('button', { type: 'button', class: 'adm-btn adm-btn-primary', html: '<i class="bx bx-download"></i> Export backup (.json)' });
    exp.addEventListener('click', function () {
      idbAll().then(function (imgs) {
        download('portfolio-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ version: 1, data: data, images: imgs }));
        toast('Backup downloaded', 'ok');
      }).catch(function (e) { toast('Export failed: ' + e.message, 'err'); });
    });
    var imp = el('input', { type: 'file', accept: 'application/json,.json', class: 'adm-file' });
    var impBtn = el('button', { type: 'button', class: 'adm-btn adm-btn-light', html: '<i class="bx bx-upload"></i> Import backup' });
    impBtn.addEventListener('click', function () { imp.click(); });
    imp.addEventListener('change', function () {
      var f = imp.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var obj = JSON.parse(fr.result);
          if (!obj || !obj.data) throw new Error('Not a valid backup file');
          idbClear().then(function () {
            var keys = Object.keys(obj.images || {});
            return Promise.all(keys.map(function (k) { return idbSet(k, obj.images[k]); }));
          }).then(function () {
            data = obj.data; data.text = data.text || {}; data.images = data.images || {};
            saveData(); toast('Backup imported. Reloading...', 'ok');
            setTimeout(function () { location.reload(); }, 700);
          }).catch(function (e) { toast('Import failed: ' + e.message, 'err'); });
        } catch (e) { toast(e.message, 'err'); }
      };
      fr.readAsText(f); imp.value = '';
    });
    var reset = el('button', { type: 'button', class: 'adm-btn adm-btn-danger', html: '<i class="bx bx-reset"></i> Reset everything to original' });
    reset.addEventListener('click', function () {
      if (!confirm('This removes ALL your saved edits and uploaded images from this browser. Continue?')) return;
      idbClear().catch(function () { }).then(function () {
        localStorage.removeItem(CFG.lsKey);
        toast('Reset done. Reloading...', 'ok');
        setTimeout(function () { location.reload(); }, 600);
      });
    });
    body.appendChild(section('Backup', [exp, el('div', { class: 'adm-spacer' }), impBtn, imp]));
    body.appendChild(section('Danger zone', [reset]));
    body.appendChild(el('p', { class: 'adm-note adm-warn', html: '<strong>Note:</strong> this panel runs only in the browser. Anyone with developer tools can bypass the sign-in, and visitors on other devices will not see your changes. For a secure public admin, connect a backend such as Firebase.' }));
  }

  function openPanel() {
    if (!isLoggedIn()) { openLogin(); return; }
    if (panel) return;
    draft = { text: {}, images: {} };
    pDraft = null; pDirty = false;

    var body = el('div', { class: 'adm-body' });
    var tabsEl = el('div', { class: 'adm-tabs', role: 'tablist' });
    TABS.forEach(function (t) {
      var b = el('button', { type: 'button', class: 'adm-tab' + (t.id === activeTab ? ' active' : ''), role: 'tab', html: '<i class="bx ' + t.icon + '"></i><span>' + t.label + '</span>' });
      b.addEventListener('click', function () {
        activeTab = t.id;
        $$('.adm-tab', tabsEl).forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        renderTab(body); body.scrollTop = 0;
      });
      tabsEl.appendChild(b);
    });

    var saveBtn = el('button', { type: 'button', class: 'adm-btn adm-btn-primary', html: '<i class="bx bx-check"></i> Save changes' });
    saveBtn.addEventListener('click', function () { save(saveBtn); });
    var outBtn = el('button', { type: 'button', class: 'adm-btn adm-btn-ghost', html: '<i class="bx bx-log-out"></i> Sign out' });
    outBtn.addEventListener('click', logout);
    var closeBtn = el('button', { type: 'button', class: 'adm-close', 'aria-label': 'Close panel', html: '&times;' });
    closeBtn.addEventListener('click', closePanel);

    var aside = el('aside', { class: 'adm-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Admin panel' }, [
      el('div', { class: 'adm-head' }, [
        el('div', {}, [el('h3', { text: 'Admin Panel' }), el('small', { text: CFG.email })]),
        closeBtn
      ]),
      tabsEl, body,
      el('div', { class: 'adm-foot' }, [outBtn, saveBtn])
    ]);
    panel = el('div', { class: 'adm-overlay adm-panel-overlay' }, [aside]);
    panel.addEventListener('mousedown', function (e) { if (e.target === panel) closePanel(); });
    document.body.appendChild(panel);
    document.body.classList.add('adm-open');
    renderTab(body);
    setTimeout(function () { panel.classList.add('show'); }, 10);
    document.addEventListener('keydown', panelKey);
  }
  function panelKey(e) { if (e.key === 'Escape') closePanel(); }

  function hasUnsaved() {
    return Object.keys(draft.text).length > 0 || Object.keys(draft.images).length > 0 || pDirty;
  }

  function closePanel() {
    if (!panel) return;
    if (hasUnsaved() && !confirm('You have unsaved changes. Close without saving?')) return;
    var p = panel; panel = null;
    p.classList.remove('show');
    document.body.classList.remove('adm-open');
    document.removeEventListener('keydown', panelKey);
    setTimeout(function () { p.remove(); }, 250);
  }

  function save(btn) {
    // validate projects
    if (pDirty && pDraft) {
      for (var i = 0; i < pDraft.length; i++) {
        var p = pDraft[i];
        if (!p.title.trim()) { toast('Project #' + (i + 1) + ' needs a title.', 'err'); return; }
        if (!(p.newImg || p.preview || p.imgUrl)) { toast('Project "' + p.title + '" needs an image.', 'err'); return; }
      }
    }
    btn.disabled = true;
    var jobs = [];

    // text
    Object.keys(draft.text).forEach(function (k) {
      var v = draft.text[k];
      if (v === (defaults.text[k] || '')) delete data.text[k]; else data.text[k] = v;
    });

    // images
    Object.keys(draft.images).forEach(function (path) {
      var v = draft.images[path];
      if (v === '__reset__') { delete data.images[path]; delete imgCache[path]; jobs.push(idbDel(path)); }
      else { data.images[path] = 1; imgCache[path] = v; jobs.push(idbSet(path, v)); }
    });

    // projects
    if (pDirty && pDraft) {
      var oldKeys = (data.projects || []).map(function (p) { return p.imgKey; }).filter(Boolean);
      var usedKeys = [];
      var out = pDraft.map(function (p) {
        var rec = { id: p.id, title: p.title.trim(), sub: (p.sub || '').trim(), category: p.category, link: p.link || '' };
        if (p.newImg) {
          rec.imgKey = 'proj:' + p.id + ':' + Date.now().toString(36);
          jobs.push(idbSet(rec.imgKey, p.newImg));
          usedKeys.push(rec.imgKey);
        } else if (p.imgKey) {
          rec.imgKey = p.imgKey; usedKeys.push(p.imgKey);
        } else {
          rec.imgUrl = p.imgUrl;
        }
        return rec;
      });
      oldKeys.forEach(function (k) { if (usedKeys.indexOf(k) === -1) jobs.push(idbDel(k)); });
      data.projects = out;
    }

    Promise.all(jobs).then(function () {
      saveData();
      draft = { text: {}, images: {} }; pDirty = false;
      toast('Saved! Reloading to apply...', 'ok');
      setTimeout(function () { location.reload(); }, 800);
    }).catch(function (e) {
      btn.disabled = false;
      toast('Save failed: ' + (e && e.message ? e.message : e), 'err');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */
  function init() {
    captureDefaults();
    applyText();
    applyImages();
    renderProjects();

    var link = $('#adminSignInLink');
    if (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        if (isLoggedIn()) openPanel(); else openLogin();
      });
    }
    updateNav();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
