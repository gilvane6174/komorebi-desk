/*
 * こもれびデスク — カレンダーとタイムライン（v2.8・R20）
 * 予約・授業・訪問・公開予定などを、日（担当別の列）・週・月で見る共通部品。
 * 空いている時間を押すと、その日時で記録を追加できる。外部通信なし。
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, App = root.App;
  var WD = '日月火水木金土';
  function mins(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  function hm(n) { return C.pad(Math.floor(n / 60)) + ':' + C.pad(n % 60); }
  function wday(d) { return new Date(d + 'T00:00:00').getDay(); }
  function mondayOf(d) { var w = (wday(d) + 6) % 7; return C.addDays(d, -w); }
  function label(d) { return Number(d.slice(5, 7)) + '/' + Number(d.slice(8)) + '（' + WD[wday(d)] + '）'; }
  // state: App.ui.cal[id] = { mode: 'day'|'week'|'month', date: 'YYYY-MM-DD' }
  function state(id, def) { App.ui.cal = App.ui.cal || {}; var s = App.ui.cal[id] = App.ui.cal[id] || { mode: def || 'day', date: C.today() }; return s; }
  /*
   * opts: { id, title, items: function(from, to) -> [{date,start,end,lane,title,sub,cls,open}], lanes: [..] (日表示の列),
   *         from: 8, to: 21 (時), step: 30 (分), onAdd: function(date, time, lane), modes: ['day','week','month'], travel: 分（訪問の移動時間を前に表示） }
   */
  function view(opts) {
    var s = state(opts.id, opts.defaultMode), modes = opts.modes || ['day', 'week', 'month'];
    if (modes.indexOf(s.mode) < 0) s.mode = modes[0];
    function go(n) { if (s.mode === 'day') s.date = C.addDays(s.date, n); else if (s.mode === 'week') s.date = C.addDays(s.date, 7 * n); else s.date = C.addMonths(s.date.slice(0, 8) + '01', n); App.render(); }
    var head = h('div', { class: 'cal-tools' },
      h('div', { class: 'seg', role: 'group', 'aria-label': '表示の切り替え' }, modes.map(function (m) { return h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': s.mode === m ? 'true' : 'false', on: { click: function () { s.mode = m; App.render(); } } }, { day: '日', week: '週', month: '月' }[m]); })),
      h('div', { class: 'cal-nav' }, h('button', { type: 'button', class: 'btn small ghost', 'aria-label': '前へ', on: { click: function () { go(-1); } } }, '‹'),
        h('button', { type: 'button', class: 'btn small ghost', on: { click: function () { s.date = C.today(); App.render(); } } }, '今日'),
        h('button', { type: 'button', class: 'btn small ghost', 'aria-label': '次へ', on: { click: function () { go(1); } } }, '›'),
        h('strong', { class: 'cal-title' }, s.mode === 'month' ? s.date.slice(0, 4) + '年' + Number(s.date.slice(5, 7)) + '月' : s.mode === 'week' ? label(mondayOf(s.date)) + '〜' + label(C.addDays(mondayOf(s.date), 6)) : label(s.date) + (s.date === C.today() ? '・今日' : ''))));
    var body = s.mode === 'day' ? dayView(opts, s.date) : s.mode === 'week' ? weekView(opts, mondayOf(s.date)) : monthView(opts, s.date.slice(0, 7));
    return h('div', { class: 'calview' }, head, body);
  }
  function dayView(opts, d) {
    var from = (opts.from || 8) * 60, to = (opts.to || 21) * 60, step = opts.step || 30, items = opts.items(d, d), lanes = (opts.lanes && opts.lanes.length ? opts.lanes : ['']).slice();
    items.forEach(function (it) { if (it.lane && lanes.indexOf(it.lane) < 0) lanes.push(it.lane); });
    var rows = Math.ceil((to - from) / step), px = 26;
    var grid = h('div', { class: 'tl', role: 'grid', 'aria-label': label(d) + 'の予定' });
    grid.style.setProperty('--lanes', lanes.length); grid.style.setProperty('--rows', rows);
    var hdr = h('div', { class: 'tl-head' }, h('span', { class: 'tl-corner' }), lanes.map(function (l) { return h('span', { class: 'tl-lane-name' }, l || '予定'); }));
    var times = h('div', { class: 'tl-times', 'aria-hidden': 'true' }); for (var i = 0; i <= rows; i++) { var t = from + i * step; if (t % 60 === 0) { var tm = h('span', null, hm(t)); tm.style.top = (i * px) + 'px'; times.appendChild(tm); } }
    var cols = lanes.map(function (lane) {
      var col = h('div', { class: 'tl-col' }); col.style.height = (rows * px) + 'px';
      for (var i = 0; i < rows; i++) (function (i) {
        var t = hm(from + i * step), slot = h('button', { type: 'button', class: 'tl-slot' + ((from + i * step) % 60 === 0 ? ' hour' : ''), 'aria-label': (lane ? lane + ' ' : '') + label(d) + ' ' + t + 'に追加', on: { click: function () { if (opts.onAdd) opts.onAdd(d, t, lane); } } });
        slot.style.top = (i * px) + 'px'; slot.style.height = px + 'px'; if (!opts.onAdd) slot.disabled = true; col.appendChild(slot);
      })(i);
      items.filter(function (it) { return (it.lane || '') === (lane || '') || (!lane && lanes.length === 1); }).forEach(function (it) {
        var a = mins(it.start), b = mins(it.end); if (a === null) return; if (b === null || b <= a) b = a + 30;
        if (opts.travel && it.cls !== 'off') { var tr = h('div', { class: 'tl-travel', 'aria-hidden': 'true' }, '移動'); tr.style.top = Math.max(0, (a - opts.travel - from) / step * px) + 'px'; tr.style.height = Math.max(8, opts.travel / step * px - 2) + 'px'; col.appendChild(tr); }
        var ev = h('button', { type: 'button', class: 'tl-ev ' + (it.cls || ''), title: it.title + (it.sub ? '／' + it.sub : ''), on: { click: function (e) { e.stopPropagation(); if (it.open) it.open(); } } }, h('strong', null, it.start + ' ' + it.title), it.sub ? h('span', null, it.sub) : null);
        ev.style.top = Math.max(0, (a - from) / step * px) + 'px'; ev.style.height = Math.max(px - 2, (b - a) / step * px - 2) + 'px'; col.appendChild(ev);
      });
      return col;
    });
    grid.appendChild(hdr); grid.appendChild(h('div', { class: 'tl-body' }, times, cols));
    var nowM = (new Date().getHours()) * 60 + new Date().getMinutes();
    if (d === C.today() && nowM >= from && nowM <= to) { var line = h('div', { class: 'tl-now', 'aria-hidden': 'true' }); line.style.top = ((nowM - from) / step * px) + 'px'; grid.querySelector('.tl-body').appendChild(line); }
    var list = items.length ? null : h('p', { class: 'muted small' }, 'この日の予定はありません。' + (opts.onAdd ? '時間のマスを押すと追加できます。' : ''));
    return h('div', null, h('div', { class: 'tl-wrap', tabindex: '0', role: 'region', 'aria-label': '日の予定表。横にスクロールできます' }, grid), list);
  }
  function weekView(opts, mon) {
    var days = []; for (var i = 0; i < 7; i++) days.push(C.addDays(mon, i));
    var items = opts.items(days[0], days[6]);
    return h('div', { class: 'week-grid' }, days.map(function (d) {
      var list = items.filter(function (it) { return it.date === d; }).sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); });
      return h('section', { class: 'week-day' + (d === C.today() ? ' today' : '') + (wday(d) === 0 || wday(d) === 6 ? ' we' : ''), 'aria-label': label(d) },
        h('header', null, h('button', { type: 'button', class: 'linkish', on: { click: function () { var s = state(opts.id); s.mode = 'day'; s.date = d; App.render(); } } }, label(d)), h('span', { class: 'small muted' }, list.length ? list.length + '件' : '')),
        list.length ? h('ul', null, list.slice(0, 12).map(function (it) { return h('li', null, h('button', { type: 'button', class: 'wk-ev ' + (it.cls || ''), title: (it.start ? it.start + ' ' : '') + it.title + (it.lane ? '（' + it.lane + '）' : ''), on: { click: function () { if (it.open) it.open(); } } }, h('span', { class: 'wk-time' }, it.start || ''), ' ', it.title, it.lane ? h('span', { class: 'small muted' }, '（' + it.lane + '）') : null)); }), list.length > 12 ? h('li', { class: 'small muted' }, 'ほか' + (list.length - 12) + '件') : null) : h('p', { class: 'small muted' }, '—'),
        opts.onAdd ? h('button', { type: 'button', class: 'btn tiny ghost add-day', on: { click: function () { opts.onAdd(d, '', ''); } } }, '＋ 追加') : null);
    }));
  }
  function monthView(opts, m) {
    var first = m + '-01', n = C.daysInMonth(m), lead = (wday(first) + 6) % 7, items = opts.items(first, m + '-' + C.pad(n)), cells = [];
    for (var i = 0; i < lead; i++) cells.push(h('div', { class: 'mc blank', 'aria-hidden': 'true' }));
    for (var d = 1; d <= n; d++) (function (ds) {
      var list = items.filter(function (it) { return it.date === ds; });
      cells.push(h('button', { type: 'button', class: 'mc' + (ds === C.today() ? ' today' : '') + (wday(ds) === 0 || wday(ds) === 6 ? ' we' : '') + (list.length ? ' has' : ''), 'aria-label': label(ds) + ' ' + list.length + '件', on: { click: function () { var s = state(opts.id); s.mode = opts.monthOnly ? 'month' : 'day'; s.date = ds; if (opts.onDay) opts.onDay(ds); else App.render(); } } },
        h('span', { class: 'mc-day' }, Number(ds.slice(8))), list.length ? h('span', { class: 'mc-count' }, list.length + '件') : null,
        list.slice(0, 3).map(function (it) { return h('span', { class: 'mc-ev ' + (it.cls || '') }, (it.start ? it.start + ' ' : '') + it.title); })));
    })(m + '-' + C.pad(d));
    return h('div', { class: 'month-cal' }, h('div', { class: 'mc-head', 'aria-hidden': 'true' }, ['月', '火', '水', '木', '金', '土', '日'].map(function (x) { return h('span', null, x); })), h('div', { class: 'mc-grid' }, cells));
  }
  root.Cal = { view: view, mins: mins, hm: hm, state: state };
})(this);
