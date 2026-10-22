/*
 * こもれびデスク — 福祉事業所の運営（管理者・サービス管理責任者向け）v2.8
 * 利用者台帳（受給者証・支給量）、個別支援計画の流れとモニタリング期限、サービス提供実績（送迎・食事・施設外・在宅）、
 * 工賃の自動計算、原則の日数の確認、生産活動の収支、職員の常勤換算、委員会・研修・訓練の次回期限、
 * 月次の利用者別集計（CSV）、期間を指定した記録の一括印刷（実地指導の準備）。
 * 正式な記録・請求は、自治体・国保連の定める様式と方法で行う（ここは整理と期限管理のための台帳）。
 * 利用者は氏名ではなくIDで管理する。外部通信なし。サンプルはすべて架空。
 *
 * 期限・頻度の目安（v2.8作成時に自治体資料で確認。最終判断は各自治体の基準・手引きで）
 *  ・個別支援計画の見直し：就労移行支援・自立訓練・自立生活援助は少なくとも3か月に1回、
 *    就労継続支援A型・B型・生活介護・就労定着支援・共同生活援助などは少なくとも6か月に1回（秋田市の集団指導資料ほか）
 *  ・原則の日数：各月の日数から8日を引いた日数（北九州市ほか）
 *  ・虐待防止／身体拘束等適正化の委員会と研修：年1回以上（研修は新規採用時も）。感染症対策委員会：おおむね6か月に1回以上
 *    （サービスにより3か月）。感染症の研修・訓練、業務継続計画の研修・訓練：年1回以上（旭川市の資料ほか）
 *  ・欠席時対応加算：月4回が上限（厚生労働省資料）
 *  ・就労継続支援A型：生産活動の収入から必要経費を引いた額が、賃金の総額以上であること（広島市ほか）
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, yen = C.yen, KD = root.KD;
  function A() { return root.App; }
  var SERVICES = ['就労継続支援B型', '就労継続支援A型', '就労移行支援', '就労定着支援', '生活介護', '自立訓練（機能訓練）', '自立訓練（生活訓練）', '自立生活援助', '共同生活援助（グループホーム）', '短期入所', '放課後等デイサービス', '児童発達支援'];
  var THREE = { '就労移行支援': 1, '自立訓練（機能訓練）': 1, '自立訓練（生活訓練）': 1, '自立生活援助': 1 };
  var ROLES = ['管理者', 'サービス管理責任者', '児童発達支援管理責任者', '職業指導員', '生活支援員', '就労支援員', '目標工賃達成指導員', '看護職員', '世話人', '児童指導員・保育士', '送迎', '事務'];
  var TRAININGS = [
    ['虐待防止委員会', 12, '年1回以上'], ['虐待防止研修', 12, '年1回以上（新規採用時も）'], ['身体拘束等適正化委員会', 12, '年1回以上'], ['身体拘束等適正化研修', 12, '年1回以上（新規採用時も）'],
    ['感染症対策委員会', 6, 'おおむね6か月に1回以上（サービスにより3か月）'], ['感染症対策研修', 12, '年1回以上（新規採用時も）'], ['感染症対策訓練', 12, '年1回以上'],
    ['業務継続計画（BCP）研修', 12, '年1回以上'], ['業務継続計画（BCP）訓練', 12, '年1回以上'], ['避難訓練（消防計画による）', 6, '消防計画で定めた回数（目安：半年ごと）']
  ];
  function f(k, label, type, extra) { var o = { k: k, label: label, type: type || 'text' }; if (extra) Object.keys(extra).forEach(function (x) { o[x] = extra[x]; }); return o; }
  var ID = f('person', '利用者ID');

  var cols = {
    facilityBenefits: { title: '利用者台帳・受給者証', sensitive: true, desc: '受給者証・支給決定・計画の期限を一元管理。氏名や受給者証番号は入れず、IDで。期限が近いものは「気をつけること」に出ます。',
      fields: [ID, f('service', 'サービス', 'select', { options: SERVICES, free: true }), f('status', '状態', 'select', { options: ['利用中', '体験', '休止', '退所'], free: true }), f('days', '支給量（日/月）', 'number'),
        f('due', '受給者証の有効期限', 'date'), f('decisionEnd', '支給決定期間の終了', 'date'), f('capMonthly', '負担上限月額', 'yen'), f('planDate', '計画の作成日', 'date'),
        f('transportUse', '送迎あり', 'check'), f('mealUse', '食事提供あり', 'check'), f('staffId', '担当（職員ID）'), f('done', '更新確認済', 'check'), f('memo', 'メモ', 'textarea')] },
    facilityPlans: { title: '個別支援計画', sensitive: true, desc: 'アセスメント → 原案 → 担当者会議（本人参加）→ 説明・同意 → 交付 → 支援 → モニタリング の流れを記録します。',
      fields: [ID, f('made', '作成日', 'date'), f('start', '計画の開始', 'date'), f('end', '計画の終了', 'date'), f('wish', '本人の希望（本人の言葉）', 'textarea'),
        f('longGoal', '長期目標', 'textarea'), f('shortGoal', '短期目標', 'textarea'), f('support', '支援の内容', 'textarea'), f('meeting', '担当者会議', 'date'), f('consent', '説明・同意・交付', 'date'),
        f('status', '状態', 'select', { options: ['アセスメント', '原案', '会議済', '同意・交付済', '見直し中'] })] },
    facilityMonitors: { title: 'モニタリング記録', sensitive: true, desc: '計画の見直し：就労移行・自立訓練・自立生活援助は少なくとも3か月に1回、それ以外の多くは6か月に1回（目安）。',
      fields: [ID, f('date', '実施日', 'date'), f('progress', '目標の達成', 'select', { options: ['達成', '一部達成', '未達成', '目標を見直す'] }), f('voice', '本人の意見', 'textarea'),
        f('staffView', '支援者の見立て', 'textarea'), f('change', '計画の変更', 'select', { options: ['不要', '要'] }), f('next', '次回の期限', 'date')] },
    facilityActuals: { title: 'サービス提供の実績', sensitive: true, desc: '1日1人1行。開始・終了から時間を出し、送迎・食事・施設外・在宅もチェック。実績の確認票（簡易）印刷と工賃の計算に使います。',
      fields: [f('date', '日付', 'date'), ID, f('status', '状況', 'select', { options: ['利用', '欠席', '欠席時対応', '振替'] }), f('start', '開始', 'time'), f('end', '終了', 'time'), f('breakMin', '休憩(分)', 'number'),
        f('hours', '時間（開始・終了がないとき）', 'number'), f('pickup', '送迎（往）', 'check'), f('dropoff', '送迎（復）', 'check'), f('meal', '食事', 'check'), f('outside', '施設外', 'check'), f('home', '在宅', 'check'),
        f('wage', '工賃（手入力。空なら時給×時間）', 'yen'), f('memo', '備考')] },
    facilityWageAdj: { title: '工賃の調整（出来高・手当など）', desc: '時給×時間で計算した工賃に足し引きする分。',
      fields: [f('month', '対象月', 'month'), ID, f('kind', '種類', 'select', { options: ['出来高', '皆勤', '調整', 'その他'] }), f('amount', '金額', 'yen'), f('memo', 'メモ')] },
    facilityProduction: { title: '生産活動の収支', desc: '作業の種類ごとの売上と経費。就労継続支援では、生産活動の収支と工賃・賃金の総額の関係を確認します。',
      fields: [f('month', '対象月', 'month'), f('work', '作業の種類'), f('sales', '売上', 'yen'), f('expense', '必要経費', 'yen'), f('memo', 'メモ')] },
    facilityWorkers: { title: '職員の勤務（常勤換算の目安）', desc: '職員はIDで。対象月の勤務時間から常勤換算を出します。',
      fields: [f('code', '職員ID'), f('role', '職種', 'select', { options: ROLES, free: true }), f('month', '対象月', 'month'), f('hours', '対象月の勤務時間', 'number'), f('memo', '算入の根拠')] },
    facilityTrainings: { title: '委員会・研修・訓練の記録', desc: '実施日を記録すると、種類ごとに次の期限を自動で出します。',
      fields: [f('date', '実施日', 'date'), f('kind', '種類', 'select', { options: TRAININGS.map(function (t) { return t[0]; }).concat(['その他']), free: true }), f('people', '参加人数', 'number'),
        f('content', '内容', 'textarea'), f('record', '議事録・資料の保管場所')] },
    facilityTasks: { title: 'そのほかの点検・期限', desc: '設備点検・書類の提出・契約の更新など。',
      fields: [f('title', '項目'), f('owner', '担当（職員ID）'), f('due', '期限', 'date'), f('done', '済', 'check'), f('memo', '記録の保管先', 'textarea')] },
    transport: { title: '送迎の確認', sensitive: true, desc: '便ごとの運転者と乗降の確認。住所は入れないでください。',
      fields: [f('date', '日付', 'date'), ID, f('route', '便', 'select', { options: ['迎え1便', '迎え2便', '送り1便', '送り2便'], free: true }), f('driver', '運転者（職員ID）'), f('check', '乗降・所在を確認', 'check'), f('memo', '配慮事項（住所は入れない）')] }
  };

  function fs() { return St.modSettings('facility'); }
  function monitorMonths(service) { return THREE[service] ? 3 : 6; }
  function lastPlan(person) { return St.rows('facilityPlans').filter(function (p) { return p.person === person; }).sort(function (a, b) { return String(b.made || b.start).localeCompare(String(a.made || a.start)); })[0]; }
  function lastMonitor(person) { return St.rows('facilityMonitors').filter(function (p) { return p.person === person && p.date; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0]; }
  function nextMonitorOf(u) {
    var m = lastMonitor(u.person); if (m && m.next) return m.next;
    var base = (m && m.date) || (lastPlan(u.person) || {}).start || u.planDate;
    return base ? C.addMonths(base, monitorMonths(u.service)) : '';
  }
  function minutesOf(r) {
    if (r.status !== '利用') return 0;
    var m = r.start && r.end ? C.workMinutes(r.start, r.end, r.breakMin) : 0;
    return m || Math.round(num(r.hours) * 60);
  }
  function wageOf(r) { return r.wage !== '' && r.wage !== undefined ? num(r.wage) : Math.floor(minutesOf(r) / 60 * num(fs().hourlyWage)); }
  function monthStats(m) {
    var rows = St.rows('facilityActuals').filter(function (r) { return A().inMonth(r.date, m); }), by = {}, days = {};
    rows.forEach(function (r) {
      var k = r.person || 'ID未入力', u = by[k] = by[k] || { att: 0, abs: 0, absSup: 0, trans: 0, min: 0, pick: 0, drop: 0, meal: 0, outside: 0, home: 0, wage: 0 };
      if (r.status === '利用') { u.att++; days[r.date] = (days[r.date] || 0) + 1; } else if (r.status === '欠席時対応') u.absSup++; else if (r.status === '振替') u.trans++; else u.abs++;
      u.min += minutesOf(r); u.wage += r.status === '利用' ? wageOf(r) : 0;
      if (r.pickup) u.pick++; if (r.dropoff) u.drop++; if (r.meal) u.meal++; if (r.outside) u.outside++; if (r.home) u.home++;
    });
    St.rows('facilityWageAdj').filter(function (r) { return r.month === m; }).forEach(function (r) { var k = r.person || 'ID未入力'; (by[k] = by[k] || { att: 0, abs: 0, absSup: 0, trans: 0, min: 0, pick: 0, drop: 0, meal: 0, outside: 0, home: 0, wage: 0 }).wage += num(r.amount); });
    var openDays = Object.keys(days).length, total = Object.keys(days).reduce(function (a, d) { return a + days[d]; }, 0);
    var wageTotal = Object.keys(by).reduce(function (a, k) { return a + by[k].wage; }, 0);
    return { by: by, openDays: openDays, avgUsers: openDays ? total / openDays : 0, wageTotal: wageTotal, rule: C.daysInMonth(m) - 8 };
  }
  function ledger() { var o = {}; St.rows('facilityBenefits').forEach(function (u) { if (u.person) o[u.person] = u; }); return o; }
  function trainingDue() {
    var last = {}; St.rows('facilityTrainings').forEach(function (r) { if (r.date && (!last[r.kind] || r.date > last[r.kind])) last[r.kind] = r.date; });
    return TRAININGS.map(function (t) { var l = last[t[0]] || '', next = l ? C.addMonths(l, t[1]) : ''; return { kind: t[0], rule: t[2], last: l, next: next, d: next ? C.daysUntil(next) : null }; });
  }
  function alerts() {
    var out = [];
    St.rows('facilityBenefits').forEach(function (u) {
      if (u.status === '退所') return;
      [['受給者証の有効期限', u.due, 60, u.done], ['支給決定期間の終了', u.decisionEnd, 60, false], ['計画の見直し（モニタリング）', nextMonitorOf(u), 30, false]].forEach(function (x) {
        if (x[3]) return; var d = C.daysUntil(x[1]); if (d !== null && d <= x[2]) out.push({ d: d, due: true, text: (u.person || 'ID未入力') + '：' + x[0] + '（' + x[1] + '）' });
      });
    });
    St.rows('facilityPlans').forEach(function (p) { if (p.status && p.status !== '同意・交付済' && p.status !== '見直し中') out.push({ d: 500, text: (p.person || 'ID未入力') + '：個別支援計画が「' + p.status + '」（同意・交付がまだ）' }); });
    trainingDue().forEach(function (t) { if (t.d === null) out.push({ d: 600, text: t.kind + '：記録がありません（' + t.rule + '）' }); else if (t.d <= 30) out.push({ d: t.d, due: true, text: t.kind + '：次の期限 ' + t.next }); });
    if (KD.defs.incidents) St.rows('incidents').forEach(function (r) { if (r.reported === '未') out.push({ d: -1, text: (r.date || '') + ' のヒヤリハット・事故：報告が「未」' }); });
    var s = monthStats(A().ui.month), led = ledger();
    Object.keys(s.by).forEach(function (k) { var u = s.by[k], cap = led[k] && num(led[k].days); if (cap && u.att > cap) out.push({ d: 0, text: k + '：利用日数が支給量（' + cap + '日）を超えています' }); else if (u.att > s.rule) out.push({ d: 0, text: k + '：利用日数が原則の日数（' + s.rule + '日）を超えています。特例の届出を確認' }); if (u.absSup > 4) out.push({ d: 0, text: k + '：欠席時対応が月4回を超えています（加算は月4回まで）' }); });
    return out.sort(function (a, b) { return a.d - b.d; });
  }
  function badge(x) { return !x.due ? U.badge('要確認', 'warn') : x.d < 0 ? U.badge((-x.d) + '日超過', 'bad') : U.badge('あと' + x.d + '日', x.d <= 14 ? 'warn' : ''); }

  // ---- 月次の利用者別集計（請求ソフトへ転記する前の確認用。請求はしない） ----
  function monthRows(m, onlyPerson) {
    var s = monthStats(m), led = ledger();
    return Object.keys(s.by).filter(function (k) { return !onlyPerson || k === onlyPerson; }).sort().map(function (k) {
      var u = s.by[k], cap = led[k] ? num(led[k].days) : 0, warn = cap && u.att > cap ? '支給量超え' : u.att > s.rule ? '原則日数超え' : u.absSup > 4 ? '欠席時対応5回以上' : '';
      return { id: k, service: led[k] ? led[k].service : '', att: u.att, abs: u.abs, absSup: u.absSup, trans: u.trans, pick: u.pick, drop: u.drop, meal: u.meal, outside: u.outside, home: u.home, min: u.min, wage: u.wage, cap: cap, rule: s.rule, warn: warn };
    });
  }
  function monthCSV(m) {
    var rows = monthRows(m);
    var head = ['対象月', '利用者ID', 'サービス', '利用日数', '欠席', '欠席時対応', '振替', '送迎（往）', '送迎（復）', '食事', '施設外', '在宅', '時間（分）', '工賃（円）', '支給量', '原則の日数', '確認'];
    return C.toCSV([head].concat(rows.map(function (r) { return [m, r.id, r.service, r.att, r.abs, r.absSup, r.trans, r.pick, r.drop, r.meal, r.outside, r.home, r.min, r.wage, r.cap || '', r.rule, r.warn || 'OK']; })));
  }
  function printRecord(person, m) {
    var f0 = fs(), rows = St.rows('facilityActuals').filter(function (r) { return r.person === person && A().inMonth(r.date, m); }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var u = ledger()[person] || {};
    U.printDoc(h('div', { class: 'invoice' }, h('h1', { class: 'small-title' }, 'サービス提供実績の確認票（' + A().ymLabel(m) + '）'),
      h('p', null, '事業所：' + (f0.name || '') + '　サービス：' + (u.service || f0.service || '') + '　利用者ID：' + person),
      h('table', null, h('thead', null, h('tr', null, ['日付', '曜日', '状況', '開始', '終了', '送迎往', '送迎復', '食事', '施設外', '在宅', '備考', '確認'].map(function (x) { return h('th', null, x); }))),
        h('tbody', null, rows.map(function (r) { return h('tr', null, h('td', null, r.date.slice(5)), h('td', null, '日月火水木金土'[new Date(r.date + 'T00:00:00').getDay()]), h('td', null, r.status), h('td', null, r.start), h('td', null, r.end),
          ['pickup', 'dropoff', 'meal', 'outside', 'home'].map(function (k) { return h('td', null, r[k] ? '○' : ''); }), h('td', null, r.memo), h('td', null, '')); }))),
      h('p', { class: 'small' }, '※確認用の簡易版です。正式な実績記録票は、自治体・国保連の指定様式で作成してください。')));
  }
  // ---- 期間を指定して記録をまとめて印刷（実地指導・監査の準備） ----
  var PERIOD_KEYS = [['facilityPlans', '個別支援計画', 'made'], ['facilityMonitors', 'モニタリング記録', 'date'], ['facilityActuals', 'サービス提供の実績', 'date'], ['facilityTrainings', '委員会・研修・訓練', 'date'],
    ['supportRecords', '支援記録', 'date'], ['incidents', 'ヒヤリハット・事故', 'date'], ['staffHandover', '申し送り', 'date'], ['transport', '送迎の確認', 'date']];
  function periodPrint() {
    var from = h('input', { type: 'date', 'aria-label': '開始日' }), to = h('input', { type: 'date', 'aria-label': '終了日' }), who = h('input', { type: 'text', maxlength: '40', 'aria-label': '利用者ID（空ならすべて）', placeholder: '利用者ID（空ならすべて）' });
    from.value = C.addMonths(C.today(), -6); to.value = C.today();
    var boxes = PERIOD_KEYS.filter(function (x) { return KD.defs[x[0]]; }).map(function (x) { return h('label', { class: 'field check' }, h('input', { type: 'checkbox', value: x[0], checked: true }), h('span', null, x[1])); });
    U.ask('期間を指定して印刷', h('div', null, h('p', null, '実地指導などの準備用に、期間内の記録を種類ごとにまとめて印刷します。要配慮情報を含むため、印刷物の保管に注意してください。'),
      h('div', { class: 'form' }, A().field('開始日', from), A().field('終了日', to), A().field('利用者ID', who)), h('div', { class: 'pin-list' }, boxes)),
      [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '内容を確認して印刷', value: true }]).then(function (ok) {
      if (!ok) return;
      var a = from.value || '0000-01-01', b = to.value || '9999-12-31', p = who.value.trim(), parts = [h('h1', null, '記録のまとめ（' + a + '〜' + b + (p ? '／' + p : '') + '）'), h('p', null, '作成日：' + C.today())];
      boxes.forEach(function (bx) {
        var inp = bx.querySelector('input'); if (!inp.checked) return;
        var meta = PERIOD_KEYS.filter(function (x) { return x[0] === inp.value; })[0], def = St.def(meta[0]);
        var list = St.rows(meta[0]).filter(function (r) { var d = r[meta[2]] || ''; return d >= a && d <= b && (!p || r.person === p); }).sort(function (x, y) { return String(x[meta[2]]).localeCompare(String(y[meta[2]])); });
        parts.push(h('h2', null, meta[1] + '（' + list.length + '件）'));
        if (list.length) parts.push(U.miniTable(def.fields.map(function (q) { return q.label; }), list.slice(0, 500).map(function (r) { return def.fields.map(function (q) { return q.type === 'check' ? (r[q.k] ? '○' : '') : String(r[q.k] === undefined ? '' : r[q.k]); }); })));
      });
      U.printDoc(h('div', { class: 'period-print' }, parts));
    });
  }

  function sample(H) {
    var ids = [], svc = [];
    for (var i = 1; i <= 18; i++) { ids.push('DEMO-U' + C.pad(i)); svc.push(i <= 8 ? '就労継続支援B型' : i <= 10 ? '生活介護' : '就労移行支援'); }
    var tr = [], plans = [], mons = [], act = [], adj = [], prod = [], workers = [], trn = [], tasks = [], tp = [];
    var wishes = ['週4日通えるようになりたい', 'パソコンの作業に挑戦したい', '一人暮らしの練習をしたい', '工賃を上げて趣味に使いたい', '人と話すのに慣れたい', '自分のペースで続けたい'];
    var users = ids.map(function (id, i) {
      var plan = H.day(-H.int(20, 160));
      plans.push({ person: id, made: plan, start: plan, end: C.addMonths(plan, monitorMonths(svc[i])), wish: '「' + H.pick(wishes) + '」', longGoal: H.pick(['生活リズムを整えて通所を続ける', '一般就労を目指す', '自分に合う作業を見つける']), shortGoal: H.pick(['休まず午前の作業を終える', '困ったときに職員へ伝える', '検品の手順を一人でできる']),
        support: H.pick(['作業手順を写真付きで示す', '休憩のタイミングを一緒に決める', '週1回の振り返り面談']), meeting: C.addDays(plan, -3), consent: i === 4 ? '' : plan, status: i === 4 ? '原案' : '同意・交付済' });
      if (i % 3 !== 2) mons.push({ person: id, date: C.addDays(plan, -H.int(1, 5)), progress: H.pick(['達成', '一部達成', '一部達成', '未達成']), voice: H.pick(['「作業に慣れてきた」', '「朝がつらい日がある」', '「もっと難しい作業もしたい」']), staffView: H.pick(['集中が続く時間が伸びている', '体調の波に合わせて休憩を調整', '次の目標に進めそう']), change: H.pick(['不要', '要']), next: C.addMonths(plan, monitorMonths(svc[i])) });
      return { person: id, service: svc[i], status: i === 17 ? '休止' : '利用中', days: C.daysInMonth(H.month(0)) - 8, due: H.day([18, 45, 70, 95, 120, 150, 180, 210, 250, 280, 300, 330][i % 12]), decisionEnd: H.day(H.int(40, 360)), capMonthly: H.pick([0, 0, 0, 9300]), planDate: plan,
        transportUse: i % 2 === 0, mealUse: i % 3 !== 0, staffId: 'DEMO-S0' + (2 + i % 3), done: false, memo: i === 0 ? '更新申請の案内を本人に渡す' : '' };
    });
    for (var d = -59; d <= 0; d++) {
      var date = H.day(d), wd = H.weekday(date); if (wd === 0 || wd === 6) continue;
      users.forEach(function (u, i) {
        if (u.status !== '利用中' || H.chance(0.08)) return;
        var st = d === 0 ? '利用' : H.chance(0.86) ? '利用' : H.chance(0.5) ? '欠席時対応' : '欠席', on = st === '利用';
        act.push({ date: date, person: u.person, status: st, start: on ? H.pick(['09:30', '10:00', '10:00', '13:00']) : '', end: on ? H.pick(['12:00', '15:00', '15:30', '15:30']) : '', breakMin: on ? 45 : '', hours: '',
          pickup: on && u.transportUse, dropoff: on && u.transportUse && d < 0, meal: on && u.mealUse, outside: on && H.chance(0.08), home: false, wage: '', memo: st === '欠席時対応' ? '電話で体調を確認し、次回の予定を相談' : '' });
      });
    }
    ids.slice(0, 8).forEach(function (id) { if (H.chance(0.5)) adj.push({ month: H.month(0), person: id, kind: '出来高', amount: H.round(H.int(300, 2000), 100), memo: '' }); });
    ['軽作業（検品・袋詰め）', 'パン・焼き菓子', 'データ入力', '清掃用品セット', '季節のカード'].forEach(function (w) { for (var m = -2; m <= 0; m++) prod.push({ month: H.month(m), work: w, sales: H.round(H.int(60000, 180000), 1000), expense: H.round(H.int(15000, 50000), 1000), memo: '' }); });
    [['DEMO-S01', '管理者', 80], ['DEMO-S02', 'サービス管理責任者', 160], ['DEMO-S03', '職業指導員', 160], ['DEMO-S04', '生活支援員', 160], ['DEMO-S05', '生活支援員', 96], ['DEMO-S06', '目標工賃達成指導員', 80], ['DEMO-S07', '看護職員', 40], ['DEMO-S08','生活支援員',160], ['DEMO-S09','生活支援員',96], ['DEMO-S10','世話人',80]].forEach(function (w) { workers.push({ code: w[0], role: w[1], month: H.month(0), hours: w[2], memo: '勤務表から算入（架空）' }); });
    TRAININGS.forEach(function (t, k) { if (k === 6) return; trn.push({ date: H.day(-H.int(20, t[1] * 30 - 5)), kind: t[0], people: H.int(5, 9), content: t[0] + 'を実施（架空の記録）', record: '事業所の共有フォルダ「委員会・研修」' }); });
    tasks.push({ title: '消防設備の点検', owner: 'DEMO-S01', due: H.day(12), done: false, memo: '' }, { title: '運営規程の見直し', owner: 'DEMO-S02', due: H.day(40), done: false, memo: '' }, { title: '車両の法定点検', owner: 'DEMO-S03', due: H.day(-2), done: false, memo: '' });
    for (var t2 = 0; t2 <= 10; t2++) { var td = H.day(t2); if (H.weekday(td) === 0 || H.weekday(td) === 6) continue; users.filter(function (u) { return u.transportUse; }).slice(0, 5).forEach(function (u, i) { tp.push({ date: td, person: u.person, route: i < 3 ? '迎え1便' : '迎え2便', driver: i < 3 ? 'DEMO-S03' : 'DEMO-S04', check: t2 === 0 && i < 3, memo: i === 1 ? '乗降時に手すりを使う' : '' }); }); }
    return { facilityBenefits: users, facilityPlans: plans, facilityMonitors: mons, facilityActuals: act, facilityWageAdj: adj, facilityProduction: prod, facilityWorkers: workers, facilityTrainings: trn, facilityTasks: tasks, transport: tp };
  }

  function view() {
    var m = A().ui.month, v = h('div'), live = A().live, F = A().field, S = A().set, fu = A().ui.fUid || '';
    var uidSel = h('select', { 'aria-label': '利用者で絞り込み', on: { change: function (e) { A().ui.fUid = e.target.value; A().render(); } } }, h('option', { value: '' }, 'すべての利用者'),
      St.rows('facilityBenefits').map(function (u) { return h('option', { value: u.person, selected: fu === u.person }, u.person); }));
    function byP(r) { return !fu || r.person === fu; }
    v.appendChild(A().viewHead('福祉事業所の運営', '期限・実績・工賃・職員配置・委員会と研修を、管理者とサービス管理責任者の目線でまとめます。請求や配置基準の適合判定はしません。', h('div', { class: 'btn-row tight' }, A().monthPicker(), uidSel)));
    v.appendChild(A().grid(
      U.card('気をつけること', { cls: 'accent', desc: '期限が近いもの・未対応のもの。' }, live(function () {
        var a = alerts();
        return a.length ? h('ul', { class: 'list' }, a.slice(0, 14).map(function (x) { return h('li', null, badge(x), ' ', x.text); })) : U.empty('期限が近いものはありません。');
      })),
      U.card('事業所の設定', null, A().form([F('事業所名（印刷用）', S('mod.facility.name', 'text')), F('主なサービス', S('mod.facility.service', 'select', { options: SERVICES.map(function (s) { return [s, s]; }) })),
        F('工賃の時給（円）', S('mod.facility.hourlyWage', 'number', { min: 0 }), 'A型は最低賃金以上'), F('常勤の月の勤務時間', S('mod.facility.standardHours', 'number', { min: 1 }), '常勤換算に使用'), F('定員', S('mod.facility.capacity', 'number', { min: 1 }))])),
      U.card(A().ymLabel(m) + 'の利用と工賃', { wide: true, action: h('div', { class: 'btn-row tight' },
        h('button', { type: 'button', class: 'btn small ghost', on: { click: function () { U.ask('月次集計をCSVで保存しますか', h('p', null, '利用者ID別の利用日数・送迎・食事・工賃などを保存します。要配慮情報のため、保存先に注意してください。請求データではありません。'), [{ label: '中止', value: false, tone: 'ghost' }, { label: '保存', value: true }]).then(function (ok) { if (ok) U.saveFile('komorebi-monthly-' + m + '.csv', monthCSV(m), 'text/csv'); }); } } }, '月次集計CSV'),
        h('button', { type: 'button', class: 'btn small ghost', on: { click: periodPrint } }, '期間を指定して印刷')) }, live(function () {
        var s = monthStats(m), rows = monthRows(m, fu);
        var prodNet = A().sum(St.rows('facilityProduction').filter(function (r) { return r.month === m; }), function (r) { return num(r.sales) - num(r.expense); });
        return h('div', null, h('div', { class: 'stats' }, U.stat('開所日数', s.openDays + '日'), U.stat('1日の平均利用者', (Math.round(s.avgUsers * 10) / 10) + '人', '定員 ' + (fs().capacity || '—') + '人'),
          U.stat('工賃の合計', yen(s.wageTotal), '時給 ' + yen(fs().hourlyWage) + '×時間＋調整'), U.stat('生産活動の収支', yen(prodNet), prodNet < s.wageTotal ? '工賃の合計を下回っています' : '工賃の合計以上', prodNet < s.wageTotal ? 'warn' : 'good'),
          U.stat('原則の日数', s.rule + '日', 'その月の日数−8日')),
          rows.length ? U.miniTable(['利用者ID', '利用', '欠席', '欠席時対応', '送迎往/復', '食事', '施設外', '時間', '工賃', '確認', '確認票'], rows.map(function (r) {
            return [r.id, r.att, r.abs, r.absSup, r.pick + '/' + r.drop, r.meal, r.outside, C.hoursLabel(r.min), yen(r.wage), r.warn ? U.badge(r.warn, 'warn') : 'OK',
              h('button', { type: 'button', class: 'btn tiny ghost', on: { click: function () { printRecord(r.id, m); } } }, '印刷')];
          }), [1, 2, 3, 5, 6, 8]) : U.empty('表示月の実績がありません。'),
          h('p', { class: 'muted small' }, '原則の日数・支給量・欠席時対応加算（月4回まで）などの扱いは、サービスと自治体の決まりで確認してください。'));
      })),
      U.card('職員配置（常勤換算の目安）', null, live(function () {
        var rows = St.rows('facilityWorkers').filter(function (r) { return r.month === m; }), by = {};
        rows.forEach(function (r) { by[r.role || '職種未入力'] = (by[r.role || '職種未入力'] || 0) + num(r.hours); });
        var fth = num(fs().standardHours) || 160, direct = ((by['職業指導員'] || 0) + (by['生活支援員'] || 0)) / fth, s = monthStats(m);
        return h('div', null, rows.length ? U.miniTable(['職種', '時間', '常勤換算'], Object.keys(by).map(function (k) { return [k, by[k] + 'h', (Math.round(by[k] / fth * 100) / 100)]; }), [1, 2]) : U.empty('表示月の勤務がありません。'),
          h('p', null, '職業指導員＋生活支援員：常勤換算 ', h('strong', null, Math.round(direct * 100) / 100), direct ? '（平均利用者 ' + (Math.round(s.avgUsers / direct * 10) / 10) + '：1）' : ''),
          h('p', { class: 'muted small' }, '配置基準は前年度の平均利用者数などで判定します。ここは月の途中経過の目安です。'));
      })),
      U.card('委員会・研修・訓練の期限', null, live(function () {
        return U.miniTable(['種類', '前回', '次の期限', '目安'], trainingDue().map(function (t) { return [t.kind, t.last || '—', t.next ? (t.d < 0 ? U.badge(t.next + '（超過）', 'bad') : t.d <= 30 ? U.badge(t.next, 'warn') : t.next) : U.badge('記録なし', 'bad'), t.rule]; }));
      }))));
    v.appendChild(U.table('facilityBenefits', { filter: byP, sort: function (a, b) { return String(a.person).localeCompare(String(b.person)); }, newRow: function () { return { status: '利用中', service: fs().service, days: C.daysInMonth(m) - 8 }; },
      extraCols: [{ label: '次の見直し（自動）', value: function (u) { var n = nextMonitorOf(u), d = C.daysUntil(n); return n ? n + (d < 0 ? '（超過）' : '') : '計画の作成日を入力'; } }] }));
    v.appendChild(U.table('facilityPlans', { filter: byP, sort: function (a, b) { return String(b.made).localeCompare(String(a.made)); }, newRow: function () { return { person: fu, made: C.today(), start: C.today(), status: 'アセスメント' }; },
      extraCols: [{ label: '流れ', value: function (p) { return ['アセスメント', '原案', '会議済', '同意・交付済'].map(function (s, i, all) { return all.indexOf(p.status) >= i ? '●' : '○'; }).join(''); } }] }));
    v.appendChild(U.table('facilityMonitors', { filter: byP, sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { var u = ledger()[fu]; return { person: fu, date: C.today(), change: '不要', next: C.addMonths(C.today(), monitorMonths(u && u.service)) }; } }));
    v.appendChild(U.table('facilityActuals', { filter: function (r) { return (!r.date || A().inMonth(r.date, m)) && byP(r); }, sort: function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(a.person).localeCompare(String(b.person)); }, limit: 60,
      newRow: function () { var u = ledger()[fu] || {}; return { date: C.today(), person: fu, status: '利用', start: '10:00', end: '15:00', breakMin: 45, pickup: !!u.transportUse, dropoff: !!u.transportUse, meal: !!u.mealUse }; },
      header: h('div', { class: 'btn-row tight' }, h('button', { type: 'button', class: 'btn small', on: { click: function () {
        var t = C.today(), done = {}; St.rows('facilityActuals').forEach(function (r) { if (r.date === t) done[r.person] = 1; });
        var add = St.rows('facilityBenefits').filter(function (u) { return u.status === '利用中' && u.person && !done[u.person]; }).map(function (u) { return { date: t, person: u.person, status: '利用', start: '10:00', end: '15:00', breakMin: 45, pickup: u.transportUse, dropoff: u.transportUse, meal: u.mealUse }; });
        if (!add.length) { U.toast('今日の行はすべてあります'); return; }
        St.addRows('facilityActuals', add); U.toast(add.length + '人分の今日の行を追加しました（欠席の人は直してください）', { label: '元に戻す', fn: function () { St.undo(); } });
      } } }, '今日の行を利用者全員分つくる')),
      extraCols: [{ label: '時間', value: function (r) { return C.hoursLabel(minutesOf(r)); } }, { label: '工賃', value: function (r) { return r.status === '利用' ? yen(wageOf(r)) + (r.wage === '' || r.wage === undefined ? '（自動）' : '') : '—'; } }] }));
    v.appendChild(U.table('facilityWageAdj', { filter: function (r) { return (!r.month || r.month === m) && byP(r); }, newRow: function () { return { month: m, person: fu, kind: '出来高' }; } }));
    v.appendChild(U.table('facilityProduction', { filter: function (r) { return !r.month || r.month === m; }, newRow: function () { return { month: m }; }, extraCols: [{ label: '収支', value: function (r) { return yen(num(r.sales) - num(r.expense)); } }] }));
    v.appendChild(U.table('facilityWorkers', { filter: function (r) { return !r.month || r.month === m; }, newRow: function () { return { month: m }; } }));
    v.appendChild(U.table('facilityTrainings', { sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: C.today() }; } }));
    v.appendChild(U.table('facilityTasks', { sort: function (a, b) { return String(a.due).localeCompare(String(b.due)); } }));
    v.appendChild(U.table('transport', { filter: function (r) { return (!r.date || C.daysUntil(r.date) >= -7) && byP(r); }, sort: function (a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.route).localeCompare(String(b.route)); }, newRow: function () { return { date: C.today(), route: '迎え1便', person: fu }; } }));
    return v;
  }
  function home() {
    var t = C.today();
    return [A().homeCard('事業所：気をつけること', { action: A().navBtn('facility', '運営を開く'), easy: true }, A().live(function () {
      var a = alerts(); return a.length ? h('ul', { class: 'list' }, a.slice(0, 6).map(function (x) { return h('li', null, badge(x), ' ', x.text); })) : U.empty('期限が近いものはありません。');
    })), A().homeCard('今日の出欠', null, A().live(function () {
      var rows = St.rows('facilityActuals').filter(function (r) { return r.date === t; });
      if (!rows.length) return U.empty('今日の実績はまだありません。');
      var att = rows.filter(function (r) { return r.status === '利用'; }).length;
      return h('div', { class: 'stats' }, U.stat('利用', att + '人'), U.stat('欠席など', (rows.length - att) + '人'), U.stat('送迎（往）', rows.filter(function (r) { return r.pickup; }).length + '人'));
    }))];
  }
  KD.facility = { users: function () { return St.rows('facilityBenefits').filter(function (u) { return u.status !== '退所' && u.person; }).map(function (u) { return u.person; }); }, monthStats: monthStats, monthCSV: monthCSV, nextMonitorOf: nextMonitorOf, trainingDue: trainingDue };
  KD.mod({ id: 'facility', title: '福祉事業所', icon: '福', order: 7, collections: cols, sample: sample, view: view, home: home,
    defaults: { name: 'サンプル事業所（架空）', service: '就労継続支援B型', hourlyWage: 300, standardHours: 160, capacity: 20 } });
})(this);
