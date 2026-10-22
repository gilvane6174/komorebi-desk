/*
 * こもれびデスク — ふりかえり（今月・1年）v2.8・R45
 * 記録を「自分に返ってくるもの」にする。体調の良かった日・働いた時間・売上・書いた文字数・通院・できたことなどを1枚にまとめ、
 * 個人情報を含まない画像（集計の数字だけ）として保存できる。連続記録の日数は数えない。記録しなかった日は責めない。外部通信なし。
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, St = root.Store, C = root.Calc, KD = root.KD, App = root.App, doc = root.document, num = C.num;
  function inRange(d, a, b) { return d && d >= a && d <= b; }
  function range(kind) { var t = C.today(); if (kind === 'year') { var y = t.slice(0, 4); return { a: y + '-01-01', b: y + '-12-31', label: y + '年', }; } var m = t.slice(0, 7); return { a: m + '-01', b: m + '-' + C.pad(C.daysInMonth(m)), label: Number(m.slice(0, 4)) + '年' + Number(m.slice(5)) + '月' }; }
  // 版にある記録だけを使って、数字の項目を作る
  function collect(kind) {
    var r = range(kind), out = [];
    function rows(k) { return KD.defs[k] ? St.rows(k) : []; }
    var hl = rows('health').filter(function (x) { return inRange(x.date, r.a, r.b); });
    if (hl.length) { out.push({ k: '体調が良い・普通の日', v: hl.filter(function (x) { return x.cond === '良い' || x.cond === '普通'; }).length, u: '日' }); out.push({ k: '体調を記録した日', v: hl.length, u: '日' }); }
    var feel = rows('myFeelings').filter(function (x) { return inRange(x.date, r.a, r.b) && x.mood; });
    if (feel.length) out.push({ k: '気持ちを記録した日', v: feel.length, u: '日' });
    var done = rows('myDone').filter(function (x) { return inRange(x.date, r.a, r.b); });
    if (KD.defs.myDone) out.push({ k: 'できたこと', v: done.length, u: '個' });
    var plans = rows('myPlans').filter(function (x) { return inRange(x.date, r.a, r.b) && x.done; });
    if (KD.defs.myPlans) out.push({ k: 'できた予定', v: plans.length, u: '個' });
    var wd = rows('workdays').filter(function (x) { return inRange(x.date, r.a, r.b); });
    if (wd.length) out.push({ k: '働いた時間', v: Math.round(wd.reduce(function (a, x) { return a + (C.workMinutes(x.start, x.end, x.breakMin) || 0); }, 0) / 60), u: '時間' });
    var sales = rows('ledger').filter(function (x) { return inRange(x.date, r.a, r.b) && x.kind === '売上'; });
    if (KD.defs.ledger) out.push({ k: '売上', v: sales.reduce(function (a, x) { return a + num(x.amount); }, 0), u: '円', money: true });
    var logs = rows('creatorLog').filter(function (x) { return inRange(x.date, r.a, r.b); });
    if (KD.defs.creatorLog) out.push({ k: '書いた文字数', v: logs.reduce(function (a, x) { return a + num(x.words); }, 0), u: '字' });
    var med = rows('medical').filter(function (x) { return inRange(x.date, r.a, r.b); });
    if (KD.defs.medical) out.push({ k: '通院', v: med.length, u: '回' });
    var res = rows('reservations').filter(function (x) { return inRange(x.date, r.a, r.b) && x.status === '来店'; });
    if (KD.defs.reservations) out.push({ k: 'ご来店', v: res.length, u: '名' });
    var ls = rows('lessonSessions').filter(function (x) { return inRange(x.date, r.a, r.b) && x.status === '出席'; });
    if (KD.defs.lessonSessions) out.push({ k: '授業', v: ls.length, u: 'コマ' });
    var orders = rows('craftOrders').filter(function (x) { return inRange(x.date, r.a, r.b) && x.status === '発送済'; });
    if (KD.defs.craftOrders) out.push({ k: '届けた作品', v: orders.length, u: '件' });
    var jobs = rows('serviceJobs').filter(function (x) { return inRange(x.date, r.a, r.b) && x.status === '完了'; });
    if (KD.defs.serviceJobs) out.push({ k: '終えた訪問', v: jobs.length, u: '件' });
    var sr = rows('supportRecords').filter(function (x) { return inRange(x.date, r.a, r.b); });
    if (KD.defs.supportRecords) out.push({ k: '支援の記録', v: sr.length, u: '件' });
    var act = rows('facilityActuals').filter(function (x) { return inRange(x.date, r.a, r.b) && x.status === '利用'; });
    if (KD.defs.facilityActuals) out.push({ k: 'のべ利用', v: act.length, u: '人日' });
    return { range: r, items: out };
  }
  function fmt(x, hideMoney) { if (x.money && hideMoney) return '（非表示）'; return (x.u === '円' ? '¥' + Math.round(x.v).toLocaleString() : Math.round(x.v).toLocaleString() + x.u); }
  // 画像（PNG）を描く。数字だけで、名前・ID・メモは入れない
  function draw(data, hideMoney) {
    var items = data.items.slice(0, 8), W = 1080, H = 1080, cv = doc.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#f5f1e6'); bg.addColorStop(1, '#e3efe5'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (var i = 0; i < 26; i++) { g.beginPath(); g.fillStyle = 'rgba(255,248,214,' + (0.15 + (i % 5) * 0.05) + ')'; var x = (i * 173) % W, y = (i * 97) % (H * 0.5), r = 40 + (i * 37) % 90; g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#27493b'; g.font = '700 54px sans-serif'; g.fillText(data.range.label + 'のふりかえり', 80, 150);
    g.font = '28px sans-serif'; g.fillStyle = '#5b6e63'; g.fillText('こもれびデスク｜記録した分だけの数字です', 80, 205);
    items.forEach(function (x, i) {
      var col = i % 2, row = Math.floor(i / 2), bx = 80 + col * 470, by = 270 + row * 180;
      g.fillStyle = 'rgba(255,255,255,0.86)'; roundRect(g, bx, by, 440, 150, 22); g.fill();
      g.fillStyle = '#5b6e63'; g.font = '26px sans-serif'; g.fillText(x.k, bx + 30, by + 52);
      g.fillStyle = '#1f3d31'; g.font = '700 52px sans-serif'; g.fillText(fmt(x, hideMoney), bx + 30, by + 118);
    });
    g.fillStyle = '#6a7a70'; g.font = '24px sans-serif'; g.fillText('記録しなかった日も、ちゃんと過ごした日です。', 80, H - 60);
    return cv;
  }
  function roundRect(g, x, y, w, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function open(kind) {
    var data = collect(kind || 'month'), hide = h('input', { type: 'checkbox', checked: true }), pic = h('div', { class: 'review-pic' });
    function redraw() { U.clear(pic); var cv = draw(data, hide.checked), img = h('img', { alt: data.range.label + 'のふりかえりの画像（数字だけ）' }); img.src = cv.toDataURL('image/png'); pic.appendChild(img); }
    hide.addEventListener('change', redraw); redraw();
    var list = data.items.length ? h('ul', { class: 'review-list' }, data.items.map(function (x) { return h('li', null, h('span', null, x.k), h('strong', null, fmt(x, false))); })) : U.empty('この期間の記録はまだありません。');
    U.ask(data.range.label + 'のふりかえり', h('div', null, list, h('label', { class: 'field check' }, hide, h('span', null, '画像では金額を伏せる')), pic,
      h('p', { class: 'small muted' }, '画像には集計の数字だけが入り、名前・ID・メモは入りません。保存した画像をどう使うかは自分で決めてください（このツールから送ることはありません）。')),
      [{ label: kind === 'year' ? '今月を見る' : '1年を見る', value: 'switch', tone: 'ghost' }, { label: '画像で保存', value: 'save', tone: 'ghost' }, { label: '閉じる', value: null }], { cls: 'form-dlg' }).then(function (v) {
      if (v === 'switch') return open(kind === 'year' ? 'month' : 'year');
      if (v === 'save') draw(data, hide.checked).toBlob(function (b) { if (b) U.saveFile('komorebi-review-' + data.range.a.slice(0, kind === 'year' ? 4 : 7) + '.png', b, 'image/png').then(function (ok) { if (ok) U.toast(ok === true ? '画像を保存しました' : '画像のダウンロードを開始しました（保存先はブラウザで確認）'); }); });
    });
  }
  function homeCard() {
    var d = collect('month'), top = d.items.filter(function (x) { return !x.money; }).slice(0, 3);
    return U.card('今月のふりかえり', { cls: 'review-card', action: h('div', { class: 'btn-row tight' }, h('button', { type: 'button', class: 'btn small ghost', on: { click: function () { open('month'); } } }, '開く'), h('button', { type: 'button', class: 'btn small ghost', on: { click: function () { open('year'); } } }, '1年')) },
      top.length ? h('div', { class: 'stats' }, top.map(function (x) { return U.stat(x.k, fmt(x, false)); })) : U.empty('記録すると、ここに今月の数字が出ます。'));
  }
  var prior = App.render;
  App.render = function () {
    prior();
    if ((root.location.hash || '#home') !== '#home' && root.location.hash) return;
    var slot = doc.getElementById('home-today'); if (!slot) return;
    slot.parentNode.insertBefore(homeCard(), slot.nextSibling);
  };
  root.Review = { open: open, collect: collect };
})(this);
