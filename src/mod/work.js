/*
 * こもれびデスク — 業務・工数（作業時間・単価売上・納品の月次管理）
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, yen = C.yen;
  function A() { return root.App; }

  var cols = {
    workdays: {
      title: '作業記録（工数）', desc: '1日1行でも1作業1行でも可。実働は開始・終了・休憩から自動計算。案件コードを入れると案件別に集計されます。案件報酬には単価×数量など合計額を入力し、1件あたりの単価は案件コードの金額欄へ入れます。',
      fields: [
        { k: 'date', label: '日付', type: 'date' }, { k: 'start', label: '開始', type: 'time' }, { k: 'end', label: '終了', type: 'time' },
        { k: 'breakMin', label: '休憩(分)', type: 'number' }, { k: 'code', label: '案件コード' }, { k: 'task', label: '作業内容' },
        { k: 'sales', label: '案件報酬（出来高分）', type: 'yen' }, { k: 'deliver', label: '納品', type: 'check' }
      ]
    },
    projectCodes: {
      title: '案件コード', desc: '案件ごとの単価や時給。作業記録の「案件コード」と同じ文字にすると集計されます。',
      fields: [
        { k: 'code', label: 'コード' }, { k: 'name', label: '案件名' }, { k: 'client', label: '取引先' },
        { k: 'kind', label: '種類', type: 'select', options: ['単価', '時給', '月額', '研修', 'その他'] }, { k: 'unit', label: '単位' }, { k: 'price', label: '単価・時給・月額（円）', type: 'yen' },
        { k: 'active', label: '進行中', type: 'check' }
      ]
    },
    kb: {
      title: '定例タスク・手順メモ', desc: '毎月・毎日の決まりごとや、手順のメモ。',
      fields: [{ k: 'no', label: 'No', type: 'number' }, { k: 'title', label: '項目' }, { k: 'cycle', label: '頻度', type: 'select', options: ['毎日', '毎週', '毎月', '年1回', '随時'] }, { k: 'memo', label: 'メモ', type: 'textarea' }]
    }
  };

  function codeMap() { var m = Object.create(null); St.rows('projectCodes').forEach(function (r) { m[r.code] = r; }); return m; }
  function workMonth(m) {
    var codes = codeMap(), rows = St.rows('workdays').filter(function (r) { return A().inMonth(r.date, m); });
    var minutes = 0, sales = 0, hourly = 0, delivered = 0, byCode = Object.create(null), days = Object.create(null);
    rows.forEach(function (r) {
      var min = C.workMinutes(r.start, r.end, r.breakMin), c = codes[r.code];
      minutes += min; sales += num(r.sales); if (r.deliver) delivered++;
      if (min > 0) days[r.date] = 1;
      if (c && c.kind === '時給') hourly += Math.round(min / 60 * num(c.price));
      var name = c ? c.name : (r.code || '未分類');
      byCode[name] = (byCode[name] || 0) + min;
    });
    return { rows: rows, minutes: minutes, sales: sales, hourly: hourly, delivered: delivered, byCode: byCode, days: Object.keys(days).length, perHour: minutes ? Math.round((sales + hourly) / (minutes / 60)) : 0 };
  }

  function sample(H) {
    var codes = [
      { code: 'W-01', name: '商品撮影（架空）', client: 'DEMO取引先-A', kind: '単価', unit: '1点', price: 6000, active: true },
      { code: 'W-02', name: 'データ整形（架空）', client: 'DEMO取引先-A', kind: '単価', unit: '1件', price: 2000, active: true },
      { code: 'D-01', name: '音源編集（架空）', client: 'DEMO取引先-B', kind: '単価', unit: '1点', price: 4000, active: true },
      { code: 'E-01', name: '備品点検（架空）', client: 'DEMO取引先-C', kind: '時給', unit: '1時間', price: 2500, active: true },
      { code: 'T-01', name: '資料製本（架空）', client: 'DEMO取引先-D', kind: '時給', unit: '1時間', price: 3000, active: H.chance(0.5) }
    ];
    var rows = [];
    for (var d = -119; d <= 0; d++) {
      var date = H.day(d), wd = H.weekday(date);
      if (wd === 0 || wd === 6 || H.chance(0.25)) continue;
      var c = H.pick(codes), sh = H.int(9, 13), len = H.int(2, 6);
      rows.push({ date: date, start: H.hm(sh, H.pick([0, 30])), end: H.hm(Math.min(sh + len, 23), H.pick([0, 15, 30, 45])), breakMin: len >= 5 ? 60 : 0, code: c.code,
        task: c.name.replace('（架空）', '') + H.pick(['：初回分の作成','：前回指摘の修正','：仕上げと確認','：納品用の整理']), sales: c.kind === '単価' ? c.price * H.int(1, 2) : 0, deliver: c.kind === '単価' && H.chance(0.8) });
    }
    return {
      projectCodes: codes, workdays: rows,
      kb: [{ no: 1, title: '日報を書く', cycle: '毎日', memo: '終業前に1行でよい' }, { no: 2, title: '工数を締めて請求書を作る', cycle: '毎月', memo: '月末。業務画面の集計を見て請求書へ' },
        { no: 3, title: '帳簿の入力漏れチェック', cycle: '毎週', memo: '領収書と帳簿を照合' }, { no: 5, title: '納品前のファイル確認', cycle: '毎週', memo: '架空例：ファイル名・文字の欠け・指定形式を照合' }, { no: 6, title: '見積りと実績を振り返る', cycle: '毎月', memo: '架空例：作業時間と売上を見て来月の予定を調整' }, { no: 4, title: '確定申告', cycle: '年1回', memo: '2月中旬〜3月15日。帳簿・確定申告の画面で準備' }]
    };
  }

  function view() {
    var m = A().ui.month, v = h('div'), live = A().live;
    v.appendChild(A().viewHead('業務・工数', '案件の単価・時給、作業時間、売上・報酬、納品を月別に管理します。', A().monthPicker()));
    v.appendChild(A().grid(
      U.card(A().ymLabel(m) + 'の数字', { wide: true }, live(function () {
        var w = workMonth(m);
        return h('div', { class: 'stats' }, U.stat('案件報酬', yen(w.sales)), U.stat('時給契約の報酬', yen(w.hourly), '案件コードの時給×時間'),
          U.stat('作業時間', C.hoursLabel(w.minutes), w.days + '日'), U.stat('平均時給', w.perHour ? yen(w.perHour) : '—', '(単価売上＋時給分)÷時間'), U.stat('納品件数', w.delivered + '件'));
      })),
      U.card('案件別の作業時間', null, live(function () {
        var w = workMonth(m), items = Object.keys(w.byCode).map(function (k) { return { label: k, value: w.byCode[k] }; }).sort(function (a, b) { return b.value - a.value; });
        return items.length ? U.bars(items, C.hoursLabel) : U.empty();
      })),
      U.card('日別の作業時間', null, live(function () {
        var w = workMonth(m), by = Object.create(null);
        w.rows.forEach(function (r) { by[r.date] = (by[r.date] || 0) + C.workMinutes(r.start, r.end, r.breakMin); });
        var items = Object.keys(by).sort().map(function (d) { return { label: Number(d.slice(8)) + '日(' + '日月火水木金土'[new Date(d + 'T00:00:00').getDay()] + ')', value: by[d] }; });
        return items.length ? U.bars(items, C.hoursLabel) : U.empty();
      }))));
    v.appendChild(U.table('workdays', {
      filter: function (r) { return !r.date || A().inMonth(r.date, m); },
      sort: function (a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.start).localeCompare(String(b.start)); },
      newRow: function () { return { date: A().inMonth(C.today(), m) ? C.today() : m + '-01', breakMin: 0 }; },
      extraCols: [{ label: '実働', value: function (r) { return C.hoursLabel(C.workMinutes(r.start, r.end, r.breakMin)); } }]
    }));
    v.appendChild(U.table('projectCodes', { newRow: function () { return { kind: '単価', active: true }; } }));
    v.appendChild(U.table('kb'));
    return v;
  }
  function home() {
    var m = A().ui.month;
    return [A().homeCard('今月の作業', { action: A().navBtn('work', '工数を開く'), easy: true }, A().live(function () {
      var w = workMonth(m);
      return h('div', { class: 'stats' }, U.stat('作業時間', C.hoursLabel(w.minutes), w.days + '日'), U.stat('売上・報酬（合計）', yen(w.sales + w.hourly)), U.stat('平均時給', w.perHour ? yen(w.perHour) : '—'));
    }))];
  }
  root.KD.work = { workMonth: workMonth };
  root.KD.mod({ id: 'work', title: '業務・工数', icon: '工', order: 20, collections: cols, sample: sample, view: view, home: home });
})(this);
