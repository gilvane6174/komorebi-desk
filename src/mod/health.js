/*
 * こもれびデスク — 体調・通院（体調の波・気圧・勤務・服薬・医療費の上限）
 * 診断や治療の判断はしない。記録と、医療者に伝えるためのメモ。
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, yen = C.yen, KD = root.KD;
  function A() { return root.App; }
  var WORK = ['', 'フル出勤', '午前休', '午後休', '在宅', '休日', '有給', '体調不良で休み'];

  var cols = {
    health: {
      sensitive: true, title: '体調・勤務・天気の記録', desc: '体調は本人の回答だけ。未入力の日を「普通」や「休み」に補いません。気圧は自分の感じ方で1〜3。',
      fields: [
        { k: 'date', label: '日付', type: 'date' }, { k: 'cond', label: '体調', type: 'select', options: ['', '良い', '普通', '悪い'] },
        { k: 'score', label: '5段階', type: 'select', options: ['', '1', '2', '3', '4', '5'] }, { k: 'sleep', label: '睡眠(時間)', type: 'number' },
        { k: 'work', label: '勤務', type: 'select', options: WORK }, { k: 'weather', label: '天気' }, { k: 'pressure', label: '気圧のつらさ', type: 'select', options: ['', '1', '2', '3'] },
        { k: 'energy', label: '元気の残り(0-10)', type: 'number' }, { k: 'memo', label: 'メモ' }
      ]
    },
    meds: {
      sensitive: true, title: '服薬チェック', desc: '飲んだかどうかだけ。量や種類の変更は必ず医師・薬剤師に相談。薬の名前は「朝の薬」など伏せた書き方を推奨。',
      fields: [{ k: 'date', label: '日付', type: 'date' }, { k: 'slot', label: '時間帯', type: 'select', options: ['朝', '昼', '夕', '寝る前', '頓服'] }, { k: 'name', label: '薬（伏せ字推奨）' }, { k: 'taken', label: '飲んだ', type: 'check' }]
    },
    medical: {
      sensitive: true, title: '通院・医療費', desc: '医療機関名は伏せてもOK。10割の医療費は領収書の「保険点数×10円」が目安。通院の交通費（公共交通）は医療費控除の対象。',
      fields: [
        { k: 'date', label: '日付', type: 'date' }, { k: 'place', label: '医療機関・薬局' }, { k: 'kind', label: '区分', type: 'select', options: ['診察', '薬局', '訪問看護', 'デイケア', '検査', '歯科', 'その他'] },
        { k: 'total10', label: '医療費(10割)', type: 'yen' }, { k: 'paid', label: '支払った額', type: 'yen' }, { k: 'jiritsu', label: '自立支援医療', type: 'check' },
        { k: 'transport', label: '通院交通費', type: 'yen' }, { k: 'memo', label: '医師に伝えること' }
      ]
    }
  };
  function hs() { return St.modSettings('health'); }

  function sample(H) {
    var hl = [], md = [], mm = [];
    var base = H.int(2, 4);
    for (var d = -119; d <= -1; d++) {
      if (H.chance(0.12)) continue;
      var date = H.day(d), wd = H.weekday(date), pr = H.pick(['1', '1', '1', '2', '2', '3']);
      var sc = Math.max(1, Math.min(5, base + H.int(-1, 1) - (pr === '3' ? 1 : 0)));
      var cond = sc >= 4 ? '良い' : sc <= 2 ? '悪い' : '普通';
      var work = wd === 0 || wd === 6 ? '休日' : cond === '悪い' && H.chance(0.6) ? '体調不良で休み' : H.pick(['フル出勤', 'フル出勤', '在宅', '午前休', '午後休']);
      hl.push({ date: date, cond: cond, score: String(sc), sleep: H.int(4, 9), work: work, weather: pr === '3' ? H.pick(['雨', '台風', 'くもり']) : H.pick(['晴', '晴', 'くもり']), pressure: pr, energy: Math.max(0, Math.min(10, sc * 2 + H.int(-2, 1))), memo: pr === '3' ? '架空例：雨の日の体調メモ' : H.pick(['架空例：昼休みに10分散歩','架空例：休憩を早めに取った','架空例：就寝時刻を記録','']) });
      if (H.chance(0.4)) base = Math.max(2, Math.min(4, base + H.int(-1, 1)));
    }
    for (var e = -13; e <= 0; e++) { md.push({ date: H.day(e), slot: '朝', name: '朝の薬', taken: e < 0 || H.chance(0.5) }); md.push({ date: H.day(e), slot: '寝る前', name: '寝る前の薬', taken: e < 0 && H.chance(0.9) }); }
    for (var v = 0; v < 10; v++) {
      var dd = H.day(-H.int(1, 85));
      mm.push({ date: dd, place: 'こもれびクリニック（架空）', kind: '診察', total10: H.round(H.int(5000, 9000), 10), paid: 0, jiritsu: true, transport: 420, memo: '' });
      mm.push({ date: dd, place: 'ひだまり薬局（架空）', kind: '薬局', total10: H.round(H.int(6000, 14000), 10), paid: 0, jiritsu: true, transport: 0, memo: '' });
    }
    mm.push({ date: H.day(-H.int(10, 60)), place: 'さくら歯科（架空）', kind: '歯科', total10: 12000, paid: 3600, jiritsu: false, transport: 0, memo: '' });
    mm.forEach(function (r) { if (r.jiritsu) r.paid = Math.round(r.total10 * 0.1 / 10) * 10; });
    return { health: hl.reverse(), meds: md, medical: mm };
  }

  function calendar(m) {
    var by = Object.create(null); St.rows('health').forEach(function (r) { by[r.date] = r; });
    var y = +m.slice(0, 4), mo = +m.slice(5, 7), first = new Date(y, mo - 1, 1), last = new Date(y, mo, 0).getDate(), start = (first.getDay() + 6) % 7, cells = [];
    for (var i = 0; i < start; i++) cells.push(h('div', { class: 'cal-cell blank', 'aria-hidden': 'true' }));
    for (var d = 1; d <= last; d++) {
      var ds = m + '-' + C.pad(d), r = by[ds] || {}, tone = r.cond === '良い' ? 'good' : r.cond === '悪い' ? 'bad' : r.cond === '普通' ? 'mid' : '';
      cells.push(h('div', { class: 'cal-cell week-' + (Math.floor((start+d-1)/7)%2) + ' ' + tone + (ds === C.today() ? ' today' : '') }, h('span', { class: 'cal-day' }, d),
        h('span', { class: 'cal-line cal-condition' }, r.cond ? '体調：' + r.cond : '未入力'), r.work ? h('span', { class: 'cal-line cal-work' }, r.work) : null,
        r.weather ? h('span', { class: 'cal-line cal-weather' }, r.weather + (r.pressure ? '・気圧' + r.pressure : '')) : null));
    }
    return h('div', { class: 'cal-wrap', tabindex:'0', role:'region', 'aria-label':'体調・勤務カレンダー。狭い画面では横にスクロールできます' }, h('div', { class: 'cal' }, ['月', '火', '水', '木', '金', '土', '日'].map(function (w) { return h('div', { class: 'cal-head' }, w); }), cells));
  }
  function quick() {
    var t = C.today(), rec = St.rows('health').filter(function (r) { return r.date === t; })[0];
    function set(c) {
      var r = St.rows('health').filter(function (x) { return x.date === t; })[0];
      if (r) St.setRow('health', r._id, { cond: c }); else St.addRow('health', { date: t, cond: c });
      U.toast('今日の体調を「' + c + '」で記録しました');
    }
    return h('div', { class: 'quick' }, h('p', null, '今日の体調は？', rec && rec.cond ? h('strong', null, ' いま：' + rec.cond) : h('span', { class: 'muted' }, ' 未入力')),
      h('div', { class: 'quick-btns' }, ['良い', '普通', '悪い'].map(function (c) {
        return h('button', { type: 'button', class: 'btn big health-choice ' + (c === '良い' ? 'good' : c === '悪い' ? 'bad' : 'mid'), 'aria-pressed': rec && rec.cond === c ? 'true' : 'false', on: { click: function () { set(c); } } }, c);
      })), h('p', { class: 'muted small' }, '押すだけで記録。未入力の日を「普通」にはしません。'));
  }
  function attendance(m) {
    var s = { full: 0, am: 0, pm: 0, home: 0, sick: 0, paid: 0, off: 0 };
    St.rows('health').filter(function (r) { return A().inMonth(r.date, m); }).forEach(function (r) {
      var k = { 'フル出勤': 'full', '午前休': 'am', '午後休': 'pm', '在宅': 'home', '体調不良で休み': 'sick', '有給': 'paid', '休日': 'off' }[r.work]; if (k) s[k]++;
    });
    s.attended = s.full + s.am + s.pm + s.home; return s;
  }
  // v2.7 体調と働き方の重ね合わせ。記録のある日だけで集計し、原因の断定や働ける量の判定はしない
  var WORKED = { 'フル出勤': 1, '午前休': 1, '午後休': 1, '在宅': 1 };
  function dayMap(from, to) {
    var by = Object.create(null), hasWork = !!KD.defs.workdays;
    St.rows('health').forEach(function (r) { if (r.date >= from && r.date <= to) (by[r.date] = by[r.date] || { min: 0, sales: 0 }).h = r; });
    if (hasWork) St.rows('workdays').forEach(function (r) { if (!r.date || r.date < from || r.date > to) return; var o = by[r.date] = by[r.date] || { min: 0, sales: 0 }; o.min += C.workMinutes(r.start, r.end, r.breakMin) || 0; o.sales += num(r.sales); });
    return { by: by, hasWork: hasWork };
  }
  function overlay(m) {
    var from = m + '-01', to = m + '-' + C.pad(C.daysInMonth(m)), d = dayMap(from, to), by = d.by, cells = [];
    for (var i = 1; i <= C.daysInMonth(m); i++) {
      var ds = m + '-' + C.pad(i), o = by[ds] || {}, r = o.h || {}, tone = r.cond === '良い' ? 'good' : r.cond === '悪い' ? 'bad' : r.cond === '普通' ? 'mid' : 'none';
      var amount = d.hasWork ? (o.min ? Math.round(o.min / 6) / 10 + 'h' : '') : (WORKED[r.work] ? '出' : r.work === '体調不良で休み' ? '休' : '');
      var hgt = d.hasWork ? Math.min(100, Math.round((o.min || 0) / 480 * 100)) : WORKED[r.work] ? (r.work === 'フル出勤' || r.work === '在宅' ? 100 : 55) : 0;
      cells.push(h('li', { class: 'ov-day ' + tone + (ds === C.today() ? ' today' : ''), title: ds + '：体調 ' + (r.cond || '未入力') + (d.hasWork ? '・作業 ' + (amount || '0h') : r.work ? '・' + r.work : '') },
        h('span', { class: 'ov-bar', 'aria-hidden': 'true' }, (function () { var f = h('span'); f.style.height = hgt + '%'; return f; })()), h('span', { class: 'ov-num' }, i), h('span', { class: 'ov-amt' }, amount)));
    }
    // 直近90日：体調ごとの平均（記録のある日だけ）
    var t = C.today(), back = C.addDays(t, -89), q = dayMap(back, t), g = { '良い': [], '普通': [], '悪い': [] };
    Object.keys(q.by).forEach(function (k) { var o = q.by[k], r = o.h; if (!r || !g[r.cond]) return; if (q.hasWork) { if (o.min) g[r.cond].push(o.min / 60); } else if (r.work && r.work !== '休日' && r.work !== '有給') g[r.cond].push(WORKED[r.work] ? 1 : 0); });
    var bars = ['良い', '普通', '悪い'].map(function (c) { var a = g[c], avg = a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; return { label: '体調「' + c + '」の日（' + a.length + '日）', value: q.hasWork ? Math.round(avg * 10) / 10 : Math.round(avg * 100) }; });
    var okDays = Object.keys(q.by).filter(function (k) { var r = q.by[k].h; return r && (r.cond === '良い' || r.cond === '普通'); }).length;
    return h('div', { class: 'overlay' },
      h('ol', { class: 'ov-strip', 'aria-label': A().ymLabel(m) + 'の体調と' + (d.hasWork ? '作業時間' : '出勤') + '。色が体調、棒の高さが' + (d.hasWork ? '作業時間（8時間で満杯）' : '出勤（半休は半分）') }, cells),
      h('ul', { class: 'ov-legend small muted' }, h('li', { class: 'good' }, '良い'), h('li', { class: 'mid' }, '普通'), h('li', { class: 'bad' }, '悪い'), h('li', { class: 'none' }, '未入力'), h('li', null, d.hasWork ? '棒・数字＝その日の作業時間' : '棒＝出勤（出）・体調不良の休み（休）')),
      h('h4', null, '直近90日：体調ごとの' + (q.hasWork ? '平均作業時間' : '出勤した割合')),
      U.bars(bars, function (x) { return q.hasWork ? x + '時間' : x + '%'; }),
      h('p', null, '直近90日で体調が「良い・普通」だった日は ', h('strong', null, okDays + '日'), '（月あたり約' + Math.round(okDays / 3) + '日）。予定を立てるときの目安にどうぞ。'),
      h('p', { class: 'muted small' }, '記録のある日だけの集計です。体調と働き方の関係を示す目安で、原因の断定、働ける量や制度上の判定には使えません。体調がすぐれない日が続くときは、主治医や支援者に相談してください。'));
  }
  // ---- 受診のときに見せる1か月のまとめ（印刷）R36 ----
  function doctorSummary(m) {
    var days = [], n = C.daysInMonth(m); for (var i = 1; i <= n; i++) days.push(m + '-' + C.pad(i));
    var by = {}; St.rows('health').forEach(function (r) { if (A().inMonth(r.date, m)) by[r.date] = r; });
    var meds = St.rows('meds').filter(function (r) { return A().inMonth(r.date, m); }), taken = meds.filter(function (r) { return r.taken; }).length;
    var rec = days.map(function (d) { return by[d]; }).filter(Boolean), cnt = { '良い': 0, '普通': 0, '悪い': 0 }; rec.forEach(function (r) { if (cnt[r.cond] !== undefined) cnt[r.cond]++; });
    var sl = rec.filter(function (r) { return r.sleep !== ''; }), avgSleep = sl.length ? Math.round(A().sum(sl, function (r) { return r.sleep; }) / sl.length * 10) / 10 : '—';
    var visits = St.rows('medical').filter(function (r) { return A().inMonth(r.date, m); });
    U.printDoc(h('div', { class: 'invoice doctor' }, h('h1', { class: 'small-title' }, A().ymLabel(m) + 'の体調のまとめ（受診用）'),
      h('p', null, '記録した日：' + rec.length + '日／体調 良い ' + cnt['良い'] + '日・普通 ' + cnt['普通'] + '日・悪い ' + cnt['悪い'] + '日／平均の睡眠 ' + avgSleep + '時間' + (meds.length ? '／服薬チェック ' + taken + '/' + meds.length + '回' : '')),
      h('table', null, h('thead', null, h('tr', null, ['日', '体調', '5段階', '睡眠', '勤務', '気圧', '元気', 'メモ'].map(function (x) { return h('th', null, x); }))),
        h('tbody', null, days.map(function (d) { var r = by[d] || {}; return h('tr', null, h('td', null, Number(d.slice(8)) + '（' + '日月火水木金土'[new Date(d + 'T00:00:00').getDay()] + '）'), h('td', null, r.cond || ''), h('td', null, r.score || ''), h('td', null, r.sleep === undefined ? '' : String(r.sleep)), h('td', null, r.work || ''), h('td', null, r.pressure || ''), h('td', null, r.energy === undefined ? '' : String(r.energy)), h('td', null, r.memo || '')); }))),
      visits.length ? h('div', null, h('h2', null, '通院'), U.miniTable(['日付', '医療機関', '区分', '医師に伝えること'], visits.map(function (v) { return [v.date, v.place, v.kind, v.memo]; }))) : null,
      h('h2', null, '医師に伝えたいこと'), h('p', null, '＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿'), h('p', null, '＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿'),
      h('p', { class: 'small' }, '本人が記録した内容です。診断や治療の判断に使う前に、医師と一緒に確認してください。')));
  }
  // ---- 体調が悪かった日の共通点（原因の断定はしない）R36 ----
  function patterns() {
    var t = C.today(), from = C.addDays(t, -89), rows = St.rows('health').filter(function (r) { return r.date >= from && r.date <= t && r.cond; });
    var bad = rows.filter(function (r) { return r.cond === '悪い'; }), other = rows.filter(function (r) { return r.cond !== '悪い'; }), out = [];
    if (bad.length < 3 || other.length < 3) return { n: bad.length, list: [] };
    function avg(l, k) { var x = l.filter(function (r) { return r[k] !== '' && r[k] !== undefined; }); return x.length ? A().sum(x, function (r) { return r[k]; }) / x.length : null; }
    function share(l, fn) { return l.length ? l.filter(fn).length / l.length : 0; }
    var s1 = avg(bad, 'sleep'), s2 = avg(other, 'sleep');
    if (s1 !== null && s2 !== null && Math.abs(s1 - s2) >= 0.5) out.push('睡眠：体調が悪い日は平均 ' + (Math.round(s1 * 10) / 10) + '時間、ほかの日は ' + (Math.round(s2 * 10) / 10) + '時間');
    var p1 = share(bad, function (r) { return r.pressure === '3'; }), p2 = share(other, function (r) { return r.pressure === '3'; });
    if (p1 - p2 >= 0.15) out.push('気圧：つらさ「3」の日が、悪い日では ' + Math.round(p1 * 100) + '%、ほかの日では ' + Math.round(p2 * 100) + '%');
    var w1 = share(bad, function (r) { var d = C.daysUntil(r.date); var prev = St.rows('health').filter(function (x) { return x.date === C.addDays(r.date, -1); })[0]; return prev && prev.work === 'フル出勤'; }), w2 = share(other, function (r) { var prev = St.rows('health').filter(function (x) { return x.date === C.addDays(r.date, -1); })[0]; return prev && prev.work === 'フル出勤'; });
    if (w1 - w2 >= 0.15) out.push('前の日の勤務：悪い日の前日が「フル出勤」だった割合は ' + Math.round(w1 * 100) + '%（ほかの日は ' + Math.round(w2 * 100) + '%）');
    var wd = [0, 0, 0, 0, 0, 0, 0]; bad.forEach(function (r) { wd[new Date(r.date + 'T00:00:00').getDay()]++; }); var top = wd.indexOf(Math.max.apply(null, wd));
    if (wd[top] >= Math.max(3, bad.length * 0.3)) out.push('曜日：悪い日は' + '日月火水木金土'[top] + '曜日が多め（' + wd[top] + '日）');
    return { n: bad.length, list: out };
  }
  // ---- 制度の目安との距離（R39）：住民税の非課税（障害者等）の所得の目安と、今年の事業の所得の見込み ----
  function limitDistance() {
    if (!KD.defs.ledger) return null;
    var y = C.today().slice(0, 4), rows = St.rows('ledger').filter(function (r) { return String(r.date).slice(0, 4) === y; });
    var sales = A().sum(rows.filter(function (r) { return r.kind === '売上' || r.kind === '雑収入・家事消費'; }), function (r) { return r.amount; });
    var cost = A().sum(rows.filter(function (r) { return r.kind === '経費' || r.kind === '仕入'; }), function (r) { var x = r.ratio === '' || r.ratio === undefined ? 100 : num(r.ratio); return num(r.amount) * x / 100; });
    var month = Number(C.today().slice(5, 7)), inc = Math.max(0, sales - cost), est = Math.round(inc / month * 12), lim = St.rates().values.residentTaxExemptDisabled;
    return h('div', { class: 'limit-mini' }, h('h4', null, '制度の目安との距離（' + y + '年）'), h('div', { class: 'stats' }, U.stat('事業の所得（今まで）', yen(inc), '売上−経費（事業割合を反映）'), U.stat('1年の見込み', yen(est), month + 'か月分から単純に計算'),
      U.stat('住民税非課税（障害者等）の目安', yen(lim), est > lim ? '見込みが目安を ' + yen(est - lim) + ' 上回っています' : 'あと ' + yen(lim - est) + ' の余裕', est > lim ? 'warn' : 'good')),
      h('p', { class: 'small muted' }, '合計所得金額の目安との比較です（青色申告特別控除・給与・年金などは含めていません）。手当や年金の所得制限は制度ごとに違います。「年金・制度」と自治体の案内で確認してください。'));
  }
  function view() {
    var m = A().ui.month, v = h('div'), live = A().live;
    v.appendChild(A().viewHead('体調・通院', '体調の波・気圧・勤務・服薬・医療費を記録。診断や治療の判断はしません。', A().monthPicker()));
    v.appendChild(A().grid(
      U.card('今日の体調', { cls: 'accent' }, quick()),
      U.card('気圧のつらさと元気の残り', { desc: '記録のある日だけの平均。相関の目安で、原因の断定ではありません。' }, live(function () {
        var g = { '1': [], '2': [], '3': [] };
        St.rows('health').forEach(function (r) { if (g[r.pressure] && r.energy !== '') g[r.pressure].push(num(r.energy)); });
        return U.bars(Object.keys(g).map(function (k) { var a = g[k]; return { label: '気圧のつらさ ' + k + '（' + a.length + '日）', value: a.length ? Math.round(A().sum(a, function (x) { return x; }) / a.length * 10) / 10 : 0 }; }), function (x) { return '元気 ' + x; });
      })),
      U.card('勤務のようす（' + A().ymLabel(m) + '）', null, live(function () {
        var a = attendance(m);
        return h('div', null, U.bars([{ label: '出勤（フル＋半休＋在宅）', value: a.attended }, { label: 'フル出勤', value: a.full }, { label: '午前休', value: a.am }, { label: '午後休', value: a.pm }, { label: '在宅', value: a.home }, { label: '体調不良で休み', value: a.sick, tone: 'bad' }, { label: '休日', value: a.off }], function (x) { return x + '日'; }),
          h('p', { class: 'muted small' }, '未入力の日は数えません。'));
      })),
      U.card('表示月の体調の内訳', {desc:'本人が記録した日だけを集計。未入力は含めず、良し悪しで評価するためには使いません。'},live(function(){return root.Visuals.donut(['良い','普通','悪い'].map(function(c){return {label:c,value:St.rows('health').filter(function(r){return A().inMonth(r.date,m)&&r.cond===c;}).length};}),function(n){return n+'日';});})),
      U.card('体調と働き方（' + A().ymLabel(m) + '）', { wide: true, cls: 'overlay-card', desc: '体調の記録と' + (KD.defs.workdays ? '作業記録（業務・工数）' : '勤務の記録') + 'を、同じ日付で重ねて見ます。' }, live(function () { return h('div', null, overlay(m), limitDistance()); })),
      U.card('体調が悪かった日の共通点（直近90日）', { desc: '記録から、悪かった日とほかの日の違いを並べます。原因を決めるものではありません。気づきとして、受診のときの話の材料にどうぞ。' }, live(function () {
        var p = patterns(); return p.list.length ? h('ul', { class: 'list' }, p.list.map(function (x) { return h('li', null, x); })) : U.empty(p.n < 3 ? '体調「悪い」の記録が3日以上あると表示します。' : '目立った違いは見つかりませんでした。');
      })),
      U.card('受診のときに見せるまとめ', { desc: '表示月の体調・睡眠・勤務・服薬・通院を1枚に。印刷やPDF保存（印刷画面で選べます）で持っていけます。' }, h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', on: { click: function () { doctorSummary(m); } } }, A().ymLabel(m) + 'のまとめを印刷'))),
      U.card(A().ymLabel(m) + 'のカレンダー', { wide: true }, live(function () { return calendar(m); }))));
    v.appendChild(U.table('health', { filter: function (r) { return !r.date || A().inMonth(r.date, m); }, sort: function (a, b) { return String(a.date).localeCompare(String(b.date)); }, newRow: function () { return { date: C.today() }; } }));
    v.appendChild(U.table('meds', { filter: function (r) { return !r.date || C.daysUntil(r.date) >= -7; }, sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: C.today(), slot: '朝' }; },
      footer: live(function () { var t = St.rows('meds').filter(function (r) { return r.date === C.today(); }); return h('p', null, '今日：' + t.filter(function (r) { return r.taken; }).length + '/' + t.length + ' 回', h('span', { class: 'muted small' }, '（直近7日分を表示）')); }) }));
    v.appendChild(A().grid(U.card('医療費の上限チェック（高額療養費・自立支援医療）', { wide: true, cls:'limit-check' }, A().form([
      h('p',{class:'small muted'},'初期の区分と上限は操作例です。実際の所得区分・受給者証の額を確認して設定してください。受給資格を判定する機能ではありません。'),A().field('高額療養費の所得区分（70歳未満）', A().set('mod.health.kogakuCategory', 'select', { options: Object.keys(C.KOGAKU_LABELS).map(function (k) { return [k, C.KOGAKU_LABELS[k]]; }) })),
      A().field('自立支援医療の月額上限（受給者証の額）', A().set('mod.health.jiritsuCap', 'number', { min: 0 }))]), live(function () {
      var s = hs(), rows = St.rows('medical').filter(function (r) { return A().inMonth(r.date, m); }), total10 = A().sum(rows, function (r) { return r.total10; }), paid = A().sum(rows, function (r) { return r.paid; });
      var k = C.kogakuLimit(m, s.kogakuCategory, total10, false), jPaid = A().sum(rows.filter(function (r) { return r.jiritsu; }), function (r) { return r.paid; });
      var y = m.slice(0, 4), yr = St.rows('medical').filter(function (r) { return String(r.date).slice(0, 4) === y; }), yPaid = A().sum(yr, function (r) { return num(r.paid) + num(r.transport); });
      return h('div', null, h('div', { class: 'stats' }, U.stat(A().ymLabel(m) + 'の医療費(10割)', yen(total10)), U.stat('支払った額', yen(paid)),
        U.stat('高額療養費の上限（目安）', yen(k.limit), k.table === '2026-08' ? '2026年8月以降の表' : '2026年7月以前の表', paid > k.limit ? 'warn' : ''),
        U.stat('自立支援医療で支払った額', yen(jPaid), jPaid > num(s.jiritsuCap) ? '上限超え：受給者証と管理票を確認' : '上限内', jPaid > num(s.jiritsuCap) ? 'bad' : ''),
        U.stat('自立支援医療の月額上限',yen(s.jiritsuCap),'受給者証に記載された額'),
        U.stat(y + '年の医療費＋通院交通費', yen(yPaid), '医療費控除の目安は10万円（所得が200万円未満なら所得の5%）')),
        paid > k.limit ? h('p', { class: 'warn' }, '同じ月の支払いが上限を超えています。加入している健康保険に払い戻しを確認してください。') : null,
        h('p', { class: 'muted small' }, '高額療養費は医療機関ごと・入院外来ごとなど細かい条件があり、ここでは単純合計の目安です。'));
    }))));
    v.appendChild(U.table('medical', { filter: function (r) { return !r.date || A().inMonth(r.date, m); }, newRow: function () { return { date: C.today() }; } }));
    return v;
  }
  function home() {
    var m = A().ui.month;
    return [A().homeCard('今日の体調', { cls: 'accent', easy: true }, quick()), A().homeCard('体調と働き方（' + A().ymLabel(m) + '）', { wide: true, easy: true, action: A().navBtn('health', '詳しく見る') }, A().live(function () { return overlay(m); })), A().homeCard(A().ymLabel(m) + 'の体調・勤務・天気', { wide: true, action: A().navBtn('health', '記録する') }, A().live(function () { return calendar(m); }))];
  }
  KD.health = { quick: quick, overlay: overlay, doctorSummary: doctorSummary, patterns: patterns };
  KD.mod({ id: 'health', title: '体調・通院', icon: '体', order: 55, collections: cols, sample: sample, view: view, home: home, defaults: { kogakuCategory: 'e', jiritsuCap: 5000 } });
})(this);
