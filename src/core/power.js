/*
 * こもれびデスク — 操作を速く・迷わなくする共通機能（v2.8）
 * ・Ctrl+K（⌘K）で開く「探す・操作」窓：画面移動・記録の追加・記録の検索・バックアップ・元に戻す
 * ・元に戻す（ボタンと Ctrl+Z。直前の20操作まで。メモリ内だけ）
 * ・各画面の表をタブで1つずつ表示（全部を同時に並べない）
 * ・よく使う画面をホームの上に（並びは自分で固定もできる）
 * ・スマホは下部のタブバー
 * ・通信の確認（このページが行った外部通信の回数を表示）
 * どれも通信・外部送信はしない。
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, St = root.Store, C = root.Calc, KD = root.KD, App = root.App, doc = root.document;

  // ---- よく使う入力（ひな形）を保存する表。どの版にも入る ----
  KD.mod({ id: 'templates', core: true, title: 'ひな形', order: 999, collections: { rowTemplates: { title: 'よく使う入力（ひな形）', desc: '表ごとの「よく使う入力」。各表の「ひな形から追加」で使います。', fields: [{ k: 'table', label: '表' }, { k: 'name', label: '名前' }, { k: 'data', label: '内容', type: 'textarea' }] } } });

  // ---- 利用回数（ホームの「よく使う」用。端末内の設定にだけ保存） ----
  function parseMap(s) { var o = {}; String(s || '').split(',').forEach(function (p) { var m = /^([a-z]{2,20}):(\d{1,6})$/.exec(p); if (m) o[m[1]] = Number(m[2]); }); return o; }
  function usage() { return parseMap(St.settings().navUsage); }
  function pins() { return String(St.settings().navPins || '').split(',').filter(function (x) { return /^[a-z]{2,20}$/.test(x) && KD.has(x); }); }
  function bump(id) {
    var u = usage(); u[id] = Math.min(99999, (u[id] || 0) + 1);
    var keys = Object.keys(u).sort(function (a, b) { return u[b] - u[a]; }).slice(0, 20);
    St.setSetting('navUsage', keys.map(function (k) { return k + ':' + u[k]; }).join(','));
  }
  function views() { return KD.mods.filter(function (m) { return m.view && m.nav !== false; }); }
  function favorites(n) {
    var u = parseMap(St.settings().navRank), p = pins(), rest = views().map(function (m) { return m.id; }).filter(function (id) { return p.indexOf(id) < 0 && u[id]; }).sort(function (a, b) { return u[b] - u[a]; });
    return p.concat(rest).slice(0, n || 4);
  }
  function modById(id) { return KD.mods.filter(function (m) { return m.id === id; })[0]; }
  function updateRank(){St.setSetting('navRank',St.settings().navUsage||'');App.render();U.toast('よく使う画面の並びを更新しました');}
  function pinDialog() {
    var p = pins(), boxes = views().map(function (m) { return h('label', { class: 'field check' }, h('input', { type: 'checkbox', value: m.id, checked: p.indexOf(m.id) >= 0 }), h('span', null, m.title)); });
    U.ask('ホームに固定する画面', h('div', null, h('p', null, '選んだ画面は「よく使う」の先頭にいつも出ます。選ばない場合は、開いた回数の多い順に並びます。'), h('div', { class: 'pin-list' }, boxes)), [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '保存', value: true }]).then(function (ok) {
      if (!ok) return; St.setSetting('navPins', boxes.filter(function (b) { return b.querySelector('input').checked; }).map(function (b) { return b.querySelector('input').value; }).join(',')); App.render();
    });
  }

  // ---- 表のタブ（1画面に表が2つ以上あるとき） ----
  App.ui.tabs = App.ui.tabs || {};
  function applyTabs(main, id) {
    var sections = Array.prototype.slice.call(main.querySelectorAll('section.table-card[data-table]'));
    if (sections.length < 2) return;
    var keys = sections.map(function (s) { return s.getAttribute('data-table'); }), active = App.ui.tabs[id];
    if (active !== 'all' && keys.indexOf(active) < 0) active = keys[0];
    var bar = h('div', { class: 'table-tabs', role: 'group', 'aria-label': id === 'client' ? U.k('書くところを選ぶ', 'かくところを えらぶ') : 'この画面の記録' });
    sections.forEach(function (s, i) {
      var key = keys[i], def = St.def(key), on = active === 'all' || active === key;
      s.hidden = !on;
      var n = St.rows(key).length;
      bar.appendChild(h('button', { type: 'button', class: 'tab', 'aria-pressed': active === key ? 'true' : 'false', 'data-tab': key, on: { click: function () { App.ui.tabs[id] = key; App.render(); var t = doc.getElementById('record-' + key); if (t) t.scrollIntoView({ block: 'start' }); } } },
        U.k(def.title, def.kanaTitle), h('span', { class: 'tab-count' }, String(n))));
    });
    bar.appendChild(h('button', { type: 'button', class: 'tab all', 'aria-pressed': active === 'all' ? 'true' : 'false', on: { click: function () { App.ui.tabs[id] = 'all'; App.render(); } } }, 'すべて表示'));
    sections[0].parentNode.insertBefore(bar, sections[0]);
    var old = main.querySelector('.section-map'); if (old) old.remove();
  }
  App.showTable = function (key) { var d = St.def(key); if (!d) return; App.ui.tabs[d.mod] = key; };

  // ---- 元に戻す ----
  function undo() { var l = St.undo(); U.toast(l ? '「' + l + '」を元に戻しました' : '戻せる操作はありません'); }
  function topTools() {
    var bar = doc.querySelector('.topbar'); if (!bar || doc.getElementById('top-tools')) return;
    bar.insertBefore(h('span', { id: 'top-tools', class: 'top-tools' },
      h('button', { type: 'button', class: 'btn small ghost', id: 'undo-btn', title: '直前の操作を元に戻す（Ctrl+Z）', on: { click: undo } }, '元に戻す'),
      h('button', { type: 'button', class: 'btn small ghost top-search', title: '探す・操作（Ctrl+K）', on: { click: palette } }, '探す・操作', h('kbd', null, 'Ctrl+K'))), doc.getElementById('today'));
  }
  function refreshUndo() { var b = doc.getElementById('undo-btn'); if (b) b.disabled = !St.canUndo(); }

  // ---- 探す・操作（Ctrl+K） ----
  function go(id, after) { if (root.location.hash !== '#' + id) { root.location.hash = '#' + id; } else App.render(); if (after) root.setTimeout(after, 30); }
  function commands(q) {
    var list = [];
    list.push({ label: 'ホームを開く', kind: '画面', run: function () { go('home'); } });
    views().forEach(function (m) { list.push({ label: m.title + 'を開く', kind: '画面', run: function () { go(m.id); } }); });
    Object.keys(KD.defs).forEach(function (k) {
      var d = St.def(k); if (k === 'rowTemplates' || !modById(d.mod) || !modById(d.mod).view) return;
      list.push({ label: '「' + d.title + '」に追加', kind: '追加', run: function () { App.showTable(k); go(d.mod, function () { var s = doc.getElementById('record-' + k), b = s && s.querySelector('.card-head .btn'); if (b) b.click(); }); } });
    });
    if (KD.defs.health) ['良い', '普通', '悪い'].forEach(function (c) { list.push({ label: '今日の体調を「' + c + '」で記録', kind: '記録', run: function () { var t = C.today(), r = St.rows('health').filter(function (x) { return x.date === t; })[0]; if (r) St.setRow('health', r._id, { cond: c }); else St.addRow('health', { date: t, cond: c }); U.toast('今日の体調を「' + c + '」で記録しました'); } }); });
    list.push({ label: '全体バックアップ', kind: '保存', run: function () { App.backupFlow(); } });
    list.push({ label: '直前の操作を元に戻す', kind: '操作', run: undo });
    list.push({ label: '設定・バックアップを開く', kind: '画面', run: function () { go('settings'); } });
    list.push({ label: 'ご利用にあたって（注意事項・プライバシー）', kind: '画面', run: function () { go('info'); } });
    if (KD.defs.health || KD.defs.ledger || KD.defs.myPlans) list.push({ label: '今月のふりかえりを見る', kind: '画面', run: function () { if (root.Review) root.Review.open('month'); } });
    var qq = String(q || '').trim().toLocaleLowerCase();
    var hit = qq ? list.filter(function (c) { return c.label.toLocaleLowerCase().indexOf(qq) >= 0; }) : list.slice(0, 12);
    if (qq.length >= 2 && root.Pickup) root.Pickup.find(qq, 'all').slice(0, 8).forEach(function (r) {
      hit.push({ label: r.title + '：' + r.text.slice(0, 70), kind: '記録', run: function () { App.showTable(r.key); go(r.module, function () { var row = St.rows(r.key).filter(function (x) { return x._id === r.id; })[0]; if (row) U.openForm(r.key, row); }); } });
    });
    return hit.slice(0, 20);
  }
  function palette() {
    if (root.App && root.App.isSoftLocked && root.App.isSoftLocked()) return;
    if (doc.querySelector('dialog.palette')) return;
    var input = h('input', { type: 'search', 'aria-label': '探す・操作', placeholder: '画面名・「追加」・記録の言葉を入力', maxlength: '80', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list' });
    var listEl = h('ul', { id: 'pal-list', role: 'listbox', class: 'pal-list', 'aria-label': '候補' }), sel = 0, cur = [], closeFn = null;
    function draw() {
      cur = commands(input.value); U.clear(listEl); if (sel >= cur.length) sel = 0;
      cur.forEach(function (c, i) { listEl.appendChild(h('li', { role: 'option', id: 'pal-' + i, 'aria-selected': i === sel ? 'true' : 'false', class: i === sel ? 'on' : '', on: { click: function () { pickIt(i); } } }, h('span', { class: 'pal-kind' }, c.kind), h('span', null, c.label))); });
      if (!cur.length) listEl.appendChild(h('li', { class: 'muted' }, '見つかりませんでした'));
      input.setAttribute('aria-activedescendant', cur.length ? 'pal-' + sel : '');
    }
    function pickIt(i) { var c = cur[i]; if (!c) return; if (closeFn) closeFn(null); root.setTimeout(c.run, 10); }
    input.addEventListener('input', function () { sel = 0; draw(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(cur.length - 1, sel + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); pickIt(sel); }
    });
    draw();
    U.ask('探す・操作', h('div', null, input, listEl, h('p', { class: 'small muted' }, '↑↓で選んでEnter。記録の検索はこの端末の中だけで行います。')), [{ label: '閉じる', value: null, tone: 'ghost' }], { cls: 'palette', focus: input, onOpen: function (dlg, close) { closeFn = close; } });
  }
  doc.addEventListener('keydown', function (e) {
    if (root.App && root.App.isSoftLocked && root.App.isSoftLocked()) return;
    var k = (e.key || '').toLowerCase(), typing = /^(input|textarea|select)$/i.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); palette(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey && !typing && !doc.querySelector('dialog[open]')) { e.preventDefault(); undo(); }
  });

  // ---- スマホの下部タブバー ----
  function mobileBar(cur) {
    var old = doc.getElementById('mobilebar'); if (old) old.remove();
    var fav = favorites(2); if (fav.length < 2) views().forEach(function (m) { if (fav.length < 2 && fav.indexOf(m.id) < 0) fav.push(m.id); });
    var items = [{ id: 'home', title: 'ホーム', icon: '⌂' }].concat(fav.map(function (id) { var m = modById(id); return { id: id, title: m.title, icon: m.icon || '・' }; }));
    var bar = h('nav', { id: 'mobilebar', class: 'mobilebar', 'aria-label': 'よく使う画面' },
      items.map(function (it) { return h('a', { href: '#' + it.id, 'aria-current': it.id === cur ? 'page' : null }, h('span', { class: 'mb-icon', 'aria-hidden': 'true' }, it.icon), h('span', { class: 'mb-label' }, it.title)); }),
      h('button', { type: 'button', 'aria-label': '探す・操作を開く', on: { click: palette } }, h('span', { class: 'mb-icon', 'aria-hidden': 'true' }, '⌕'), h('span', { class: 'mb-label', 'aria-hidden': 'true' }, '探す')),
      h('button', { type: 'button', 'aria-expanded': doc.body.classList.contains('nav-open') ? 'true' : 'false', on: { click: function (e) { var open = doc.body.classList.toggle('nav-open'); e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false'); if (open) { var n = doc.querySelector('#nav a'); if (n) n.focus(); } } } }, h('span', { class: 'mb-icon', 'aria-hidden': 'true' }, '☰'), h('span', { class: 'mb-label' }, 'メニュー')));
    doc.body.appendChild(bar);
  }

  // ---- ホームの「よく使う」 ----
  function favoritesRow() {
    var list = favorites(4);
    var row = h('div', { class: 'fav-row' }, h('span', { class: 'eyebrow' }, 'よく使う'),
      list.length ? list.map(function (id) { var m = modById(id); return h('a', { class: 'fav-chip', href: '#' + id }, h('span', { class: 'hanko small', 'aria-hidden': 'true' }, m.icon || '記'), m.title); }) : h('span', { class: 'muted small' }, '画面を開くと、よく使う順にここへ並びます。'),
      h('button', { type: 'button', class: 'btn tiny ghost', on: { click: pinDialog } }, '固定する'));
    return row;
  }

  // ---- 通信の確認（R40）：このページが行った外部通信を、ブラウザの記録から数える ----
  function netCount() {
    try { return (root.performance && root.performance.getEntriesByType ? root.performance.getEntriesByType('resource') : []).filter(function (e) { return /^https?:/i.test(e.name); }).length; } catch (e) { return 0; }
  }
  App.netCount = netCount;
  function netCard() {
    var n = netCount(), url = (doc.querySelector('meta[name="komorebi-update-url"]') || {}).content || '';
    return U.card('通信の確認', { wide: true, cls: 'net-card', desc: 'このツールは、記録を外へ送りません。ブラウザに残る通信の記録から、このページを開いてからの外部通信を数えています。' },
      h('div', { class: 'stats' }, U.stat('このページを開いてからの外部通信', n + '回', n ? '「最新情報に更新」を押したときの取得です' : '外部への通信はありません', n ? '' : 'good'),
        U.stat('「最新情報に更新」で取得した回数（累計）', (Number(St.settings().updateCount) || 0) + '回', url ? '取得先は1か所だけ：' + url.replace(/^https:\/\//, '') : 'この版では取得機能はオフ（ファイル読込のみ）')),
      h('p', { class: 'small muted' }, 'ブラウザの機能（Content-Security-Policy）で、' + (url ? '上の取得先以外への' : 'すべての') + '通信を止めています。外部リンクを自分で開いたときは、その接続先にIPアドレスなどが届きます。'));
  }

  // ---- 描画のあと処理 ----
  var prior = App.render;
  App.render = function () {
    prior();
    var main = doc.getElementById('main'), id = (root.location.hash || '#home').slice(1) || 'home';
    if (modById(id) && modById(id).view) { if (App._lastBump !== id) { App._lastBump = id; bump(id); } applyTabs(main, id); }
    else App._lastBump = id;
    if (id === 'home' || !modById(id)) {
      if (id === 'home') { var intro = main.querySelector('.edition-intro'); if (intro && St.EDITION !== 'user') intro.parentNode.insertBefore(favoritesRow(), intro.nextSibling); }
    }
    if (id === 'settings') main.appendChild(netCard());
    if (App.isSoftLocked && App.isSoftLocked()) return;
    topTools(); refreshUndo(); mobileBar(id);
    doc.body.classList.remove('nav-open');
  };
  St.onChange(refreshUndo);
  root.Power = { palette: palette, undo: undo, favorites: favorites };
})(this);

(function(root){var old=root.App.render;root.App.render=function(){old();if(!root.Store.get()||(root.App.isSoftLocked&&root.App.isSoftLocked()))return;if((root.location.hash||'#home')!=='#home')return;var main=root.document.getElementById('main');main.appendChild(root.UI.h('button',{type:'button',class:'btn small ghost',on:{click:function(){root.Store.setSetting('navRank',root.Store.settings().navUsage||'');root.App.render();root.UI.toast('よく使う画面の並びを更新しました');}}},'よく使う画面の並びを更新'));};})(this);
