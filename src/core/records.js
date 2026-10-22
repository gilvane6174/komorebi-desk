/*
 * こもれびデスク — 記録画面の共通部品（v2.8で records.js から分離・整形）
 * 各画面（src/mod/*.js）は KD.rec.register({...}) で表と画面を登録する。
 *   cfg: { id, title, icon, order, lead, monthPicker, tables:[...], cards: function(month) -> [要素], summary: function(month), sample, defaults, home }
 *   table: { key, title, fields, sensitive, desc, extraCols, rowActions, newRow(month), sort(a,b), filter(row, month), header() }
 * 外部通信・外部依存なし。サンプルは各画面のファイルに置く（実在の人物・事業所は使わない）。
 */
(function (root) {
  'use strict';
  var KD = root.KD, U = root.UI, C = root.Calc, St = root.Store, h = U.h;
  function f(k, label, type, options, kana) { var v = { k: k, label: label, type: type || 'text' }; if (options) v.options = options; if (kana) v.kana = kana; return v; }
  function hf(q, hint, hintKana) { q.hint = hint; q.hintKana = hintKana; return q; }
  var date = function () { return f('date', '日付', 'date'); };
  var note = function (label) { return f('memo', label || 'メモ', 'textarea'); };
  var id = function () { return f('person', '福祉施設利用者ID'); };

  function register(cfg) {
    var cols = {};
    cfg.tables.forEach(function (t) {
      cols[t.key] = { title: t.title, kanaTitle: t.kanaTitle, fields: t.fields, sensitive: !!t.sensitive, desc: t.desc || '氏名や連絡先は入れず、IDや呼び名で管理してください。' };
    });
    function defaultRow(t, m) {
      var r = {};
      t.fields.forEach(function (q) { if (q.type === 'date' && q.k === 'date') r[q.k] = C.today(); if (q.type === 'month') r[q.k] = m; });
      return r;
    }
    function view() {
      var A = root.App, v = h('div'), m = A.ui.month;
      v.appendChild(A.viewHead(cfg.title, U.k(cfg.lead, cfg.leadKana), cfg.monthPicker === false ? null : A.monthPicker()));
      if (cfg.cards) (cfg.cards(m) || []).forEach(function (c) { if (c) v.appendChild(c); });
      v.appendChild(U.card('期限が近いもの', { desc: '30日以内に期限が来る、まだ済んでいない記録。' }, A.live(function () {
        var pending = [];
        cfg.tables.forEach(function (t) {
          St.rows(t.key).forEach(function (r) {
            if (!r.due || r.done) return;
            var days = C.daysUntil(r.due);
            if (days !== null && days <= 30) pending.push({ d: days, row: [t.title + '：' + (r.title || r.person || r.student || r.code || r.work || r.site || ''), r.due, days < 0 ? U.badge((-days) + '日すぎ', 'bad') : days === 0 ? U.badge('今日', 'warn') : 'あと' + days + '日'] });
          });
        });
        pending.sort(function (a, b) { return a.d - b.d; });
        if (!pending.length) return h('p', null, '30日以内に期限が来るものはありません。');
        var head = ['内容', '期限', 'あと何日'], first = U.miniTable(head, pending.slice(0, 5).map(function (x) { return x.row; }));
        return pending.length > 5 ? h('div', null, first, h('details', { class: 'today-details' }, h('summary', null, 'ほか' + (pending.length - 5) + '件を見る'), U.miniTable(head, pending.slice(5, 60).map(function (x) { return x.row; })))) : first;
      })));
      if (cfg.summary) v.appendChild(U.card('表示月の集計', null, A.live(function () { return cfg.summary(m); })));
      cfg.tables.forEach(function (t) {
        v.appendChild(U.table(t.key, {
          extraCols: t.extraCols || [], rowActions: t.rowActions || [], sort: t.sort, limit: t.limit,
          filter: t.filter ? function (r) { return t.filter(r, m); } : null,
          header: t.header ? t.header() : null,
          newRow: function () { var r = defaultRow(t, m), x = t.newRow ? t.newRow(m) : {}; Object.keys(x).forEach(function (k) { r[k] = x[k]; }); return r; }
        }));
      });
      return v;
    }
    function sample(H, st) { return cfg.sample ? cfg.sample(H, st) : {}; }
    function home() {
      var A = root.App;
      if (cfg.home) return cfg.home();
      return [A.homeCard(cfg.title, { easy: true, action: A.navBtn(cfg.id, '開く') }, A.live(function () { var n = cfg.tables.reduce(function (a, t) { return a + St.rows(t.key).length; }, 0); return U.stat('記録', n + '件'); }))];
    }
    KD.mod({ id: cfg.id, title: cfg.title, icon: cfg.icon, order: cfg.order, collections: cols, defaults: cfg.defaults || {}, sample: sample, view: view, home: home });
  }
  KD.rec = { f: f, hf: hf, date: date, note: note, id: id, register: register };
})(this);
