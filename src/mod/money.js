/*
 * こもれびデスク — お金（月別の収入・固定費・家計簿・月の目標額）
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, yen = C.yen, KD = root.KD;
  function A() { return root.App; }
  var welfareEdition=['full','facility','staff','user'].indexOf(KD.edition)>=0;
  var incomeLabel='売上・報酬', wageLabel=welfareEdition?'給与・工賃（福祉）':'給与';

  var cols = {
    monthlyIncome: {
      title: '月別の収入', desc: welfareEdition?'事業の売上・報酬、雇用の給与・福祉の工賃、年金・手当を分けて記録。就労支援事業所などの利用料は差し引きます。':'事業の売上・報酬、雇用の給与、年金・手当を分けて記録。フリーランスの案件報酬は売上・報酬へ入力します。',
      fields: [
        { k: 'month', label: '月', type: 'month' }, { k: 'unitSales', label: incomeLabel, type: 'yen' }, { k: 'wages', label: wageLabel, type: 'yen' },
        { k: 'pension', label: '年金', type: 'yen' }, { k: 'allowance', label: '手当', type: 'yen' }, { k: 'other', label: 'その他', type: 'yen' }, { k: 'serviceFee', label: '利用料（差引）', type: 'yen' }
      ]
    },
    fixed: {
      title: '固定費・保険料', desc: '周期（何か月ごと）と基準日から、その月に払うかを自動判定します。',
      fields: [
        { k: 'name', label: '名称' }, { k: 'kind', label: '区分', type: 'select', options: ['住居', '通信', 'サブスク', 'AI・ソフト', '保険', '返済', '分割', '医療', '日用品', 'その他'] },
        { k: 'cycle', label: '周期(月)', type: 'number' }, { k: 'amount', label: '1回の額', type: 'yen' }, { k: 'base', label: '支払基準日', type: 'date' },
        { k: 'end', label: '終了日', type: 'date' }, { k: 'business', label: '事業でも使う', type: 'check' }, { k: 'review', label: '見直し候補', type: 'check' }
      ]
    },
    household: {
      title: '家計簿（生活費）', desc: '固定費以外の生活費を月ごとに。固定費と医療費は他の表から自動で合算します。',
      fields: [
        { k: 'month', label: '月', type: 'month' }, { k: 'food', label: '食費', type: 'yen' }, { k: 'daily', label: '日用品', type: 'yen' },
        { k: 'utilities', label: '水道光熱', type: 'yen' }, { k: 'transport', label: '交通', type: 'yen' }, { k: 'fun', label: '楽しみ', type: 'yen' }, { k: 'other', label: 'その他', type: 'yen' }
      ]
    }
  };
  function ms() { return St.modSettings('money'); }
  function incomeMonth(m) {
    var r = St.rows('monthlyIncome').filter(function (x) { return x.month === m; })[0];
    if (!r) {
      var w = KD.work ? KD.work.workMonth(m) : { sales: 0, hourly: 0 };
      return { found: false, unitSales: w.sales + w.hourly, wages: 0, pension: 0, allowance: 0, other: 0, serviceFee: 0, total: w.sales + w.hourly };
    }
    var o = { found: true }; ['unitSales', 'wages', 'pension', 'allowance', 'other', 'serviceFee'].forEach(function (k) { o[k] = num(r[k]); });
    o.total = o.unitSales + o.wages + o.pension + o.allowance + o.other - o.serviceFee;
    return o;
  }
  function fixedMonth(m) {
    var due = 0, monthly = 0;
    St.rows('fixed').forEach(function (r) {
      if (!r.end || String(r.end).slice(0, 7) >= m) monthly += C.monthlyEquivalent(r.amount, r.cycle);
      if (C.dueInMonth(r.base, r.cycle, r.end, m)) due += num(r.amount);
    });
    return { due: due, monthly: Math.round(monthly) };
  }
  function medicalPaid(m) { return KD.has('health') ? A().sum(St.rows('medical').filter(function (r) { return A().inMonth(r.date, m); }), function (r) { return num(r.paid) + num(r.transport); }) : 0; }
  function householdMonth(m) { var r = St.rows('household').filter(function (x) { return x.month === m; })[0]; return r ? ['food', 'daily', 'utilities', 'transport', 'fun', 'other'].reduce(function (a, k) { return a + num(r[k]); }, 0) : 0; }

  function sample(H) {
    var inc = [], hh = [];
    for (var m = -11; m <= 0; m++) {
      inc.push({ month: H.month(m), unitSales: H.round(H.int(15000, 60000), 1000), wages: H.round(H.int(12000, 25000), 100), pension: m % 2 === 0 ? 141216 : 0, allowance: 0, other: 0, serviceFee: 0 });
      hh.push({ month: H.month(m), food: H.round(H.int(22000, 32000), 100), daily: H.round(H.int(2000, 6000), 100), utilities: H.round(H.int(7000, 13000), 100), transport: H.round(H.int(1000, 5000), 100), fun: H.round(H.int(2000, 8000), 100), other: H.round(H.int(0, 5000), 100) });
    }
    var b = H.dom(27);
    return {
      monthlyIncome: inc, household: hh,
      fixed: [
        { name: '家賃（例）', kind: '住居', cycle: 1, amount: 52000, base: H.dom(27), end: '', business: true, review: false },
        { name: 'スマホ（例）', kind: '通信', cycle: 1, amount: 2900, base: b, end: '', business: true, review: false },
        { name: '光回線（例）', kind: '通信', cycle: 1, amount: 5500, base: b, end: '', business: true, review: false },
        { name: 'AIサービス（例）', kind: 'AI・ソフト', cycle: 1, amount: 3000, base: b, end: '', business: true, review: false },
        { name: '動画配信（例）', kind: 'サブスク', cycle: 1, amount: 1200, base: b, end: '', business: false, review: true },
        { name: '音楽配信（例）', kind: 'サブスク', cycle: 1, amount: 1080, base: b, end: '', business: false, review: true },
        { name: '医療保険（例）', kind: '保険', cycle: 1, amount: 3800, base: b, end: '', business: false, review: false },
        { name: '奨学金の返済（例）', kind: '返済', cycle: 1, amount: 9000, base: b, end: '', business: false, review: false },
        { name: 'パソコン分割（例）', kind: '分割', cycle: 1, amount: 5000, base: b, end: C.addMonths(H.today, 14), business: true, review: false },
        { name: '火災保険（例・2年ごと）', kind: '保険', cycle: 24, amount: 16000, base: H.dom(10, -H.int(1, 20)), end: '', business: false, review: false }
      ]
    };
  }
  function view() {
    var m = A().ui.month, v = h('div'), live = A().live;
    v.appendChild(A().viewHead('お金', '収入・固定費・生活費の見通し。入金の証明ではなく、自分のための見通しです。', A().monthPicker()));
    v.appendChild(A().grid(U.card(A().ymLabel(m) + 'の収支', { wide: true }, live(function () {
      var inc = incomeMonth(m), fx = fixedMonth(m), med = medicalPaid(m), hh = householdMonth(m), out = inc.total - fx.due - med - hh;
      return h('div', null, h('div', { class: 'stats' }, U.stat('収入', yen(inc.total), inc.found ? '' : '月別収入が未登録（作業記録から概算）'), U.stat('固定費（支払予定）', yen(fx.due), '月換算 ' + yen(fx.monthly)),
        U.stat('医療費（支払った額）', yen(med)), U.stat('生活費', yen(hh)), U.stat('差引', yen(out), '', out < 0 ? 'bad' : 'good')),
        h('h4',{class:'chart-heading'},'支出の内訳'),root.Visuals.donut([{label:'固定費',value:fx.due},{label:'医療・通院',value:med},{label:'生活費',value:hh}],yen),h('h4',{class:'chart-heading'},'収入の内訳'),U.bars([{ label: incomeLabel, value: inc.unitSales }, { label: wageLabel, value: inc.wages }, { label: '年金', value: inc.pension }, { label: '手当', value: inc.allowance }, { label: 'その他', value: inc.other }, { label: '利用料（差引）', value: inc.serviceFee, tone: 'bad' }], yen));
    })),
      U.card('月の目標額', { desc: '固定費（月換算）＋自由に使うお金＋貯金で、毎月いくら必要か。' }, A().form([
        A().field('自由に使うお金（月）', A().set('mod.money.freeMoney', 'number', { min: 0 })), A().field('貯金の目標（カンマ区切り）', (function () {
          var i = h('input', { type: 'text', on: { change: function (e) { St.setSetting('mod.money.savings', e.target.value.split(/[,、\s]+/).map(Number).filter(isFinite).slice(0, 5)); A().softRefresh(); } } });
          i.value = (ms().savings || []).join(', '); return i;
        })())]), live(function () {
        var base = fixedMonth(m).monthly + num(ms().freeMoney);
        return h('div', { class: 'stats' }, (ms().savings || []).map(function (sv) { return U.stat('貯金 ' + yen(sv) + ' の月', yen(base + num(sv)), '固定費＋自由費＋貯金'); }));
      })),
      U.card('固定費の見直し候補', null, live(function () {
        var list = St.rows('fixed').filter(function (r) { return r.review; });
        var total = A().sum(list, function (r) { return C.monthlyEquivalent(r.amount, r.cycle); });
        return list.length ? h('div', null, h('ul', { class: 'list' }, list.map(function (r) { return h('li', null, r.name + '：月' + yen(C.monthlyEquivalent(r.amount, r.cycle))); })), h('p', null, 'やめると年 ', h('strong', null, yen(total * 12)), ' 浮きます。')) : U.empty('見直し候補はありません（固定費の表でチェック）。');
      }))));
    v.appendChild(U.table('monthlyIncome', { sort: function (a, b) { return String(b.month).localeCompare(String(a.month)); }, newRow: function () { return { month: m }; },
      extraCols: [{ label: '総収入', value: function (r) { return yen(num(r.unitSales) + num(r.wages) + num(r.pension) + num(r.allowance) + num(r.other) - num(r.serviceFee)); } }] }));
    v.appendChild(U.table('fixed', { newRow: function () { return { cycle: 1, base: m + '-27' }; }, extraCols: [
      { label: '月換算', value: function (r) { return yen(C.monthlyEquivalent(r.amount, r.cycle)); } },
      { label: A().ymLabel(m) + 'に払う', value: function (r) { return C.dueInMonth(r.base, r.cycle, r.end, m) ? '払う' : '—'; } }] }));
    v.appendChild(U.table('household', { sort: function (a, b) { return String(b.month).localeCompare(String(a.month)); }, newRow: function () { return { month: m }; },
      extraCols: [{ label: '固定費・医療費込みの支出', value: function (r) { var mm = r.month || m; return yen(householdMonth(mm) + fixedMonth(mm).due + medicalPaid(mm)); } }] }));
    return v;
  }
  function home() {
    var m = A().ui.month;
    return [A().homeCard('今月のお金', { action: A().navBtn('money', 'お金を開く'), easy: true }, A().live(function () {
      var inc = incomeMonth(m), fx = fixedMonth(m), med = medicalPaid(m), hh = householdMonth(m), out = inc.total - fx.due - med - hh;
      return h('div', { class: 'stats' }, U.stat('収入', yen(inc.total)), U.stat('固定費の支払', yen(fx.due)), U.stat('収入−支出', yen(out), '', out < 0 ? 'bad' : 'good'));
    }))];
  }
  KD.money = { fixedMonth: fixedMonth, incomeMonth: incomeMonth };
  KD.mod({ id: 'money', title: 'お金', icon: '金', order: 35, collections: cols, sample: sample, view: view, home: home, defaults: { freeMoney: 10000, savings: [0, 10000, 30000] } });
})(this);
