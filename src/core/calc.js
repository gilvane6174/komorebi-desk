/*
 * こもれびデスク — 計算（純粋関数だけ・外部通信なし）
 * ブラウザでは window.Calc、Node では require('./calc.js')。
 * 制度の金額は年度で変わる。既定値は「最新情報に更新」か「制度の基準値」で上書きできる。
 * ここでの結果はすべて概算。正式な額は年金事務所・税務署・市区町村・保険者で確認する。
 */
(function (root) {
  'use strict';

  // ---- 制度の既定値（2026-10-20 に公表値を確認） ----
  var DEFAULT_RATES = {
    format: 'komorebi-rates-v1',
    label: '令和8年度（2026年度）の既定値',
    checkedAt: '2026-10-20',
    values: {
      disabilityGrade1: 1059125,       // 障害基礎年金1級（年額・令和8年4月分から）
      disabilityGrade2: 847300,        // 同2級
      childAdd1and2: 243800,           // 子の加算（1・2人目）
      childAdd3: 81300,                // 子の加算（3人目以降）
      nationalPensionMonthly: 17920,   // 国民年金保険料（月額・令和8年度）
      nationalPensionMonthlyNext: 18290,
      specialDisabilityAllowance: 30450, // 特別障害者手当（月額）
      residentTaxExemptDisabled: 1350000, // 住民税：障害者等の非課税限度（合計所得）
      residentPerCapita: 5000,         // 住民税の均等割（森林環境税を含む標準額）
      withholdingRate: 10.21           // 報酬の源泉徴収税率（100万円以下の部分・%）
    }
  };
  // 取り込める値の範囲（「最新情報に更新」で受け取った値の検査に使う）
  var RATE_LIMITS = {
    disabilityGrade1: [500000, 3000000], disabilityGrade2: [400000, 2500000],
    childAdd1and2: [100000, 600000], childAdd3: [30000, 300000],
    nationalPensionMonthly: [10000, 40000], nationalPensionMonthlyNext: [10000, 40000],
    specialDisabilityAllowance: [10000, 80000], residentTaxExemptDisabled: [500000, 3000000],
    residentPerCapita: [1000, 20000], withholdingRate: [5, 30]
  };
  var RATE_LABELS = {
    disabilityGrade1: '障害基礎年金 1級（年額）', disabilityGrade2: '障害基礎年金 2級（年額）',
    childAdd1and2: '子の加算 1・2人目', childAdd3: '子の加算 3人目以降',
    nationalPensionMonthly: '国民年金保険料（月額）', nationalPensionMonthlyNext: '国民年金保険料（翌年度・月額）',
    specialDisabilityAllowance: '特別障害者手当（月額）', residentTaxExemptDisabled: '住民税非課税（障害者）の所得限度',
    residentPerCapita: '住民税の均等割', withholdingRate: '源泉徴収税率（%）'
  };
  // 公式情報の確認先。取り込みで追加できるのはこのドメインだけ
  var OFFICIAL_DOMAINS = ['nenkin.go.jp', 'nta.go.jp', 'mhlw.go.jp', 'mof.go.jp', 'jftc.go.jp', 'digital.go.jp', 'e-gov.go.jp', 'cao.go.jp', 'ipa.go.jp', 'npa.go.jp', 'soumu.go.jp'];
  var SOURCES = [
    { title: '日本年金機構：令和8年4月分からの年金額等', url: 'https://www.nenkin.go.jp/oshirase/taisetu/kojin/2026/202604/0401.html' },
    { title: '日本年金機構（障害年金・国民年金保険料の免除）', url: 'https://www.nenkin.go.jp/' },
    { title: '国税庁（確定申告・タックスアンサー）', url: 'https://www.nta.go.jp/' },
    { title: '国税庁：令和8年度税制改正（インボイス制度の見直し）', url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice-review/index.htm' },
    { title: '財務省：令和8年度税制改正の大綱の概要', url: 'https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/08taikou_gaiyou.pdf' },
    { title: '厚生労働省（高額療養費・障害福祉サービス）', url: 'https://www.mhlw.go.jp/' },
    { title: '公正取引委員会：フリーランス法', url: 'https://www.jftc.go.jp/freelancelaw_2026/index.html' }
  ];

  function isOfficialUrl(u) {
    var m = /^https:\/\/([a-z0-9.-]+)(\/[^\s"'<>]*)?$/i.exec(String(u || ''));
    if (!m) return false;
    var host = m[1].toLowerCase();
    return OFFICIAL_DOMAINS.some(function (d) { return host === d || host.slice(-(d.length + 1)) === '.' + d; });
  }

  // ---- 基本 ----
  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    var n = Number(String(v).replace(/[,，¥円\s]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function floorTo(n, unit) { return Math.floor(n / unit) * unit; }
  function yen(n) { n = Math.round(num(n)); return (n < 0 ? '-¥' : '¥') + Math.abs(n).toLocaleString('ja-JP'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function addDays(dateStr, n) { var d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
  function addMonths(dateStr, n) {
    var d = new Date(dateStr + 'T00:00:00'), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last)); return ymd(d);
  }
  function daysUntil(dateStr, base) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null;
    var d = new Date(dateStr + 'T00:00:00'), t = base ? new Date(base + 'T00:00:00') : new Date(today() + 'T00:00:00');
    return Math.round((d - t) / 86400000);
  }
  function daysInMonth(ym) { return new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(); }
  // 年度（4月始まり）
  function fiscalYear(dateStr) { var y = +dateStr.slice(0, 4), m = +dateStr.slice(5, 7); return m >= 4 ? y : y - 1; }
  function warekiYear(y) { return y >= 2019 ? '令和' + (y - 2018) : '平成' + (y - 1988); }

  // ---- 時間 ----
  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    return h > 47 || mi > 59 ? null : h * 60 + mi;
  }
  function workMinutes(start, end, breakMin) {
    var a = parseHM(start), b = parseHM(end);
    if (a === null || b === null) return 0;
    if (b < a) b += 1440;
    var m = b - a - num(breakMin);
    return m > 0 ? m : 0;
  }
  function hoursLabel(min) { min = Math.round(num(min)); return Math.floor(min / 60) + '時間' + (min % 60 ? (min % 60) + '分' : ''); }

  // ---- 障害年金 ----
  function disabilityPension(opts, rates) {
    var v = (rates || DEFAULT_RATES).values, g = num(opts.grade), ch = Math.max(0, Math.floor(num(opts.children)));
    var basic = g === 1 ? v.disabilityGrade1 : g === 2 ? v.disabilityGrade2 : 0;
    var child = (g === 1 || g === 2) ? Math.min(ch, 2) * v.childAdd1and2 + Math.max(ch - 2, 0) * v.childAdd3 : 0;
    var employee = Math.max(0, num(opts.employeeAnnual));
    var annual = basic + child + employee;
    return { basic: basic, child: child, employee: employee, annual: annual, monthly: Math.round(annual / 12), perPayment: Math.floor(annual / 6) };
  }
  // 年金の支払日：偶数月15日（土日は直前の平日・祝日は考慮しない目安）
  function pensionPaydays(from, n) {
    var d = new Date(from.getFullYear(), from.getMonth(), 1), out = [], base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    while (out.length < n) {
      var m = d.getMonth() + 1;
      if (m % 2 === 0) {
        var p = new Date(d.getFullYear(), d.getMonth(), 15);
        while (p.getDay() === 0 || p.getDay() === 6) p.setDate(p.getDate() - 1);
        if (p >= base) out.push({ date: p, covers: (m - 2 || 12) + '月・' + (m - 1) + '月分' });
      }
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }

  // ---- 高額療養費（70歳未満）。2026年8月診療分から新しい表 ----
  var KOGAKU = [
    { from: '2026-08', rows: { a: [270300, 901000, 140100, 1680000], b: [179100, 597000, 93000, 1110000], c: [85800, 286000, 44400, 530000], d: [61500, 0, 44400, 530000], e: [36900, 0, 24600, 290000] } },
    { from: '0000-00', rows: { a: [252600, 842000, 140100, null], b: [167400, 558000, 93000, null], c: [80100, 267000, 44400, null], d: [57600, 0, 44400, null], e: [35400, 0, 24600, null] } }
  ];
  var KOGAKU_LABELS = { a: 'ア：年収約1,160万円〜', b: 'イ：年収約770〜1,160万円', c: 'ウ：年収約370〜770万円', d: 'エ：〜年収約370万円', e: 'オ：住民税非課税' };
  function kogakuLimit(ym, cat, total10, many) {
    var t = KOGAKU[0].from <= ym ? KOGAKU[0] : KOGAKU[1], r = t.rows[cat] || t.rows.d;
    if (many) return { limit: r[2], table: t.from, annualCap: r[3] };
    var over = r[1] ? Math.max(0, num(total10) - r[1]) : 0;
    return { limit: Math.round(r[0] + over * 0.01), table: t.from, annualCap: r[3] };
  }

  // ---- 所得税・住民税（年分ごとのルール） ----
  // 対応年分：令和7年分(2025)〜令和9年分(2027)。それ以外は最も近い年分で計算し、画面で注意を出す。
  var TAX_YEARS = {
    2025: { label: '令和7年分', basic: [[1320000, 950000], [3360000, 880000], [4890000, 680000], [6550000, 630000], [23500000, 580000]], salaryMin: 650000, resSalaryMin: 650000,
      blue: [['65', 650000, '65万円（e-Taxまたは優良な電子帳簿）'], ['55', 550000, '55万円（複式簿記・紙で提出）'], ['10', 100000, '10万円（簡易な帳簿）'], ['0', 0, '白色申告']],
      vat: { kind: '2wari', label: '2割特例（令和8年9月30日を含む課税期間まで）' } },
    2026: { label: '令和8年分', basic: [[4890000, 1040000], [6550000, 670000], [23500000, 620000]], salaryMin: 740000, resSalaryMin: 740000,
      blue: [['65', 650000, '65万円（e-Taxまたは優良な電子帳簿）'], ['55', 550000, '55万円（複式簿記・紙で提出）'], ['10', 100000, '10万円（簡易な帳簿）'], ['0', 0, '白色申告']],
      vat: { kind: '2wari', label: '2割特例（令和8年9月30日を含む課税期間＝個人は令和8年分まで）' } },
    2027: { label: '令和9年分', basic: [[4890000, 1040000], [6550000, 670000], [23500000, 620000]], salaryMin: 740000, resSalaryMin: 740000,
      blue: [['75', 750000, '75万円（e-Tax＋優良な電子帳簿など）'], ['65', 650000, '65万円（複式簿記＋e-Tax）'], ['10', 100000, '10万円（紙・簡易な帳簿）'], ['0', 0, '白色申告']],
      vat: { kind: '3wari', label: '3割特例（令和9・10年分、基準期間の課税売上1,000万円以下の個人）' } }
  };
  var BASIC_HIGH = [[24000000, 480000], [24500000, 320000], [25000000, 160000]];
  function taxYearRule(y) {
    y = Math.floor(num(y));
    if (TAX_YEARS[y]) return { year: y, rule: TAX_YEARS[y], exact: true };
    var keys = Object.keys(TAX_YEARS).map(Number).sort(), near = y < keys[0] ? keys[0] : keys[keys.length - 1];
    return { year: near, rule: TAX_YEARS[near], exact: false };
  }
  function basicDeduction(total, y) {
    var t = num(total), list = taxYearRule(y).rule.basic.concat(BASIC_HIGH);
    for (var i = 0; i < list.length; i++) if (t <= list[i][0]) return list[i][1];
    return 0;
  }
  function basicDeductionResident(total) { var t = num(total); return t <= 24000000 ? 430000 : t <= 24500000 ? 290000 : t <= 25000000 ? 150000 : 0; }
  function salaryDeduction(income, y, resident) {
    income = num(income);
    if (income <= 0) return 0;
    var r = taxYearRule(y).rule, min = resident ? r.resSalaryMin : r.salaryMin, d;
    if (income <= (y >= 2026 ? 2200000 : 1900000)) d = min;
    else if (income <= 3600000) d = income * 0.3 + 80000;
    else if (income <= 6600000) d = income * 0.2 + 440000;
    else if (income <= 8500000) d = income * 0.1 + 1100000;
    else d = 1950000;
    return Math.min(Math.floor(Math.max(d, min)), income);
  }
  function publicPensionDeduction(p, over65) {
    p = num(p);
    if (p <= 0) return 0;
    var d;
    if (over65 && p <= 3300000) d = 1100000;
    else if (!over65 && p <= 1300000) d = 600000;
    else if (p <= 4100000) d = p * 0.25 + 275000;
    else if (p <= 7700000) d = p * 0.15 + 685000;
    else if (p <= 10000000) d = p * 0.05 + 1455000;
    else d = 1955000;
    return Math.min(Math.floor(d), p);
  }
  function incomeTaxRaw(taxable) {
    var t = floorTo(Math.max(0, num(taxable)), 1000), x;
    if (t <= 1950000) x = t * 0.05;
    else if (t <= 3300000) x = t * 0.1 - 97500;
    else if (t <= 6950000) x = t * 0.2 - 427500;
    else if (t <= 9000000) x = t * 0.23 - 636000;
    else if (t <= 18000000) x = t * 0.33 - 1536000;
    else if (t <= 40000000) x = t * 0.4 - 2796000;
    else x = t * 0.45 - 4796000;
    return Math.max(0, x);
  }
  var DISABILITY_DED = { none: [0, 0], normal: [270000, 260000], special: [400000, 300000], specialLiving: [750000, 530000] };
  function blueAmount(code, y) {
    var b = taxYearRule(y).rule.blue.filter(function (x) { return x[0] === String(code); })[0];
    return b ? b[1] : 0;
  }
  function medicalDeduction(paid, reimbursed, totalIncome) {
    var net = Math.max(0, num(paid) - num(reimbursed));
    return Math.min(2000000, Math.max(0, net - Math.min(100000, Math.floor(Math.max(0, num(totalIncome)) * 0.05))));
  }

  /*
   * 確定申告の概算
   * in: {year, businessSales, businessExpense, blue, salary, pensionKind, pensionAnnual, over65,
   *      socialInsurance, otherDeductions, medicalPaid, medicalReimbursed, disabilityKind, dependentsDisabled, businessTaxRate, withheld}
   */
  function taxEstimate(inp, rates) {
    var v = (rates || DEFAULT_RATES).values, y = num(inp.year) || 2026, yr = taxYearRule(y);
    var bizBefore = num(inp.businessSales) - num(inp.businessExpense);
    var blue = Math.min(blueAmount(inp.blue, y), Math.max(0, bizBefore));
    var biz = bizBefore - blue;
    var salaryIncome = Math.max(0, num(inp.salary) - salaryDeduction(inp.salary, y));
    var salaryIncomeRes = Math.max(0, num(inp.salary) - salaryDeduction(inp.salary, y, true));
    var old = inp.pensionKind === 'old';
    var misc = old ? Math.max(0, num(inp.pensionAnnual) - publicPensionDeduction(inp.pensionAnnual, !!inp.over65)) : 0;
    var total = Math.max(0, biz + salaryIncome + misc), totalRes = Math.max(0, biz + salaryIncomeRes + misc);
    var dis = DISABILITY_DED[inp.disabilityKind] || DISABILITY_DED.none, depDis = Math.max(0, Math.floor(num(inp.dependentsDisabled)));
    var med = medicalDeduction(inp.medicalPaid, inp.medicalReimbursed, total);
    var common = num(inp.socialInsurance) + num(inp.otherDeductions) + med;
    var dedI = basicDeduction(total, y) + common + dis[0] + depDis * 270000;
    var taxable = floorTo(Math.max(0, total - dedI), 1000);
    var incomeTax = Math.floor(incomeTaxRaw(taxable) * 1.021 / 100) * 100;
    var exempt = !!(inp.disabilityKind && inp.disabilityKind !== 'none' && totalRes <= v.residentTaxExemptDisabled);
    var dedR = basicDeductionResident(totalRes) + common + dis[1] + depDis * 260000;
    var taxableR = floorTo(Math.max(0, totalRes - dedR), 1000);
    var residentTax = exempt ? 0 : Math.floor(taxableR * 0.1 / 100) * 100 + (totalRes > 0 ? v.residentPerCapita : 0);
    var bizTax = bizBefore - 2900000 > 0 ? Math.floor((bizBefore - 2900000) * num(inp.businessTaxRate) / 100 / 100) * 100 : 0;
    return {
      year: yr.year, yearExact: yr.exact, yearLabel: yr.rule.label,
      businessIncomeBeforeBlue: bizBefore, blueDeduction: blue, businessIncome: biz, salaryIncome: salaryIncome, miscIncome: misc,
      nonTaxablePension: old ? 0 : num(inp.pensionAnnual), totalIncome: total, medicalDeduction: med,
      basicDeduction: basicDeduction(total, y), deductionsIncomeTax: dedI, taxableIncome: taxable,
      incomeTax: incomeTax, incomeTaxDue: incomeTax - num(inp.withheld), residentExempt: exempt, residentTax: residentTax,
      businessTax: bizTax, totalTax: incomeTax + residentTax + bizTax
    };
  }

  // ---- 消費税（概算） ----
  var SIMPLE_RATES = { 1: 0.9, 2: 0.8, 3: 0.7, 4: 0.6, 5: 0.5, 6: 0.4 };
  function salesTax(sales10Incl, sales8Incl) { return num(sales10Incl) * 10 / 110 + num(sales8Incl) * 8 / 108; }
  // method: '2wari' | '3wari' | 'simple'（簡易課税）| 'general'（一般：仕入税額を入力）
  function consumptionTax(method, sales10Incl, sales8Incl, opt) {
    opt = opt || {};
    var out = salesTax(sales10Incl, sales8Incl), pay;
    if (method === '2wari') pay = out * 0.2;
    else if (method === '3wari') pay = out * 0.3;
    else if (method === 'simple') pay = out * (1 - (SIMPLE_RATES[opt.kind] || 0.5));
    else pay = out - num(opt.inputTax);
    return Math.max(0, Math.floor(pay / 100) * 100);
  }

  // ---- 源泉徴収（報酬・料金。100万円以下10.21%、超える部分20.42%） ----
  function withholding(amount, rates) {
    var a = Math.max(0, Math.floor(num(amount))), r = ((rates || DEFAULT_RATES).values.withholdingRate || 10.21) / 100;
    return a <= 1000000 ? Math.floor(a * r) : Math.floor(1000000 * r + (a - 1000000) * r * 2);
  }

  // ---- 減価償却（定額法・その年分の必要経費の概算） ----
  var STRAIGHT = { 2: 0.5, 3: 0.334, 4: 0.25, 5: 0.2, 6: 0.167, 7: 0.143, 8: 0.125, 9: 0.112, 10: 0.1, 11: 0.091, 12: 0.084, 13: 0.077, 14: 0.072, 15: 0.067, 16: 0.063, 17: 0.059, 18: 0.056, 19: 0.053, 20: 0.05 };
  // method: 'straight'（定額法）| 'lump3'（一括償却資産・3年）| 'small'（少額減価償却資産の特例・全額）
  function depreciation(asset, year) {
    var cost = num(asset.cost), d = String(asset.acquired || ''), ratio = Math.min(100, Math.max(0, (asset.businessRatio === '' || asset.businessRatio === undefined ? 100 : num(asset.businessRatio)))) / 100;
    if (!cost || !/^\d{4}-\d{2}/.test(d)) return { amount: 0, expense: 0, bookEnd: cost };
    var y0 = +d.slice(0, 4), m0 = +d.slice(5, 7), y = num(year);
    if (y < y0) return { amount: 0, expense: 0, bookEnd: cost };
    var method = asset.method || 'straight';
    if (method === 'small') { var a = y === y0 ? cost : 0; return { amount: a, expense: Math.floor(a * ratio), bookEnd: 0 }; }
    if (method === 'lump3') { var b = y - y0 < 3 ? Math.floor(cost / 3) : 0; return { amount: b, expense: Math.floor(b * ratio), bookEnd: Math.max(0, cost - Math.floor(cost / 3) * Math.min(3, y - y0 + 1)) }; }
    var life = Math.min(20, Math.max(2, Math.floor(num(asset.life) || 4))), rate = STRAIGHT[life], book = cost, amt = 0;
    for (var yy = y0; yy <= y; yy++) {
      var months = yy === y0 ? 13 - m0 : 12;
      amt = Math.min(Math.ceil(cost * rate * months / 12), Math.max(0, book - 1));
      book -= amt;
    }
    return { amount: amt, expense: Math.floor(amt * ratio), bookEnd: book };
  }

  // ---- フリーランス法：支払期日（受領日から60日以内） ----
  function paymentDueCheck(received, due) {
    var limit = /^\d{4}-\d{2}-\d{2}$/.test(String(received || '')) ? addDays(received, 59) : '';
    return { limit: limit, over: !!(limit && due && due > limit) };
  }

  // ---- 収支 ----
  function monthlyEquivalent(amount, cycle) { return num(amount) / Math.max(1, num(cycle) || 1); }
  function dueInMonth(base, cycle, end, ym) {
    if (!/^\d{4}-\d{2}/.test(String(base || ''))) return false;
    if (end && String(end).slice(0, 7) < ym) return false;
    var diff = (+ym.slice(0, 4) - +base.slice(0, 4)) * 12 + (+ym.slice(5, 7) - +base.slice(5, 7)), c = Math.max(1, num(cycle) || 1);
    return diff >= 0 && diff % c === 0;
  }

  // ---- CSV（表計算ソフトでの数式実行を防ぐ） ----
  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if ((/^[\s\u0000-\u001f]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) { return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); }

  var Calc = {
    DEFAULT_RATES: DEFAULT_RATES, RATE_LIMITS: RATE_LIMITS, RATE_LABELS: RATE_LABELS, SOURCES: SOURCES, OFFICIAL_DOMAINS: OFFICIAL_DOMAINS,
    KOGAKU_LABELS: KOGAKU_LABELS, TAX_YEARS: TAX_YEARS, SIMPLE_RATES: SIMPLE_RATES,
    isOfficialUrl: isOfficialUrl, num: num, yen: yen, pad: pad, ymd: ymd, today: today, addDays: addDays, addMonths: addMonths,
    daysUntil: daysUntil, daysInMonth: daysInMonth, fiscalYear: fiscalYear, warekiYear: warekiYear,
    parseHM: parseHM, workMinutes: workMinutes, hoursLabel: hoursLabel, disabilityPension: disabilityPension, pensionPaydays: pensionPaydays,
    kogakuLimit: kogakuLimit, taxYearRule: taxYearRule, basicDeduction: basicDeduction, salaryDeduction: salaryDeduction,
    publicPensionDeduction: publicPensionDeduction, incomeTaxRaw: incomeTaxRaw, blueAmount: blueAmount, medicalDeduction: medicalDeduction,
    taxEstimate: taxEstimate, salesTax: salesTax, consumptionTax: consumptionTax, withholding: withholding, depreciation: depreciation,
    paymentDueCheck: paymentDueCheck, monthlyEquivalent: monthlyEquivalent, dueInMonth: dueInMonth, csvCell: csvCell, toCSV: toCSV
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(this);
