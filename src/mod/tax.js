/*
 * こもれびデスク — 帳簿・確定申告
 * 帳簿（税込経理）→ 年のまとめ → 収支内訳書・青色申告決算書に写す金額 → 税額の概算、までを1画面で。
 * 計算は概算。最終的な申告内容は国税庁の「確定申告書等作成コーナー」や会計ソフト・専門家で確認する。
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, yen = C.yen, KD = root.KD;
  function A() { return root.App; }

  var EXPENSES = ['租税公課', '荷造運賃', '水道光熱費', '旅費交通費', '通信費', '広告宣伝費', '接待交際費', '損害保険料', '修繕費', '消耗品費', '減価償却費', '福利厚生費',
    '給料賃金', '外注工賃', '利子割引料', '地代家賃', '貸倒金', '支払手数料', '研修費', '新聞図書費', '会議費', '車両費', '雑費'];
  var INCOMES = ['売上', '雑収入', '家事消費'];
  var KINDS = ['売上', '経費', '仕入', '雑収入・家事消費'];
  var JOBS = {
    writer: ['ライター・編集', '通信費、新聞図書費、消耗品費（PC周辺）、自宅の家賃・光熱費の按分', '原稿料・講演料は源泉徴収の対象。入金が請求額より少ないときは、差額を「源泉徴収税額」に入れる。'],
    designer: ['デザイナー・イラストレーター', '消耗品費（画材・素材）、支払手数料（素材サイト・ソフト）、減価償却費（PC・タブレット）', 'デザイン料・挿絵の報酬は源泉徴収の対象になることが多い。'],
    engineer: ['エンジニア・開発', '通信費（サーバー・ドメイン）、減価償却費（PC）、研修費、新聞図書費', 'システム開発の報酬は原則として源泉徴収の対象外（契約内容で異なる）。'],
    media: ['動画編集・写真', '減価償却費（カメラ・PC）、消耗品費、支払手数料（ソフト）、旅費交通費', '写真の撮影料は源泉徴収の対象。'],
    translator: ['翻訳・通訳', '新聞図書費（辞書）、通信費、研修費', '翻訳料・通訳料は源泉徴収の対象。'],
    teacher: ['講師・コーチ', '旅費交通費、会議費、広告宣伝費、地代家賃（会場）', '講演料・講師謝金は源泉徴収の対象。'],
    beauty: ['美容師・ネイル（業務委託・面貸し）', '消耗品費（ハサミ・道具）、研修費、旅費交通費、支払手数料', '源泉徴収されているかは支払明細で確認し、されていれば帳簿の「源泉徴収税額」に入れる。'],
    handmade: ['ハンドメイド・物販', '仕入（材料・商品）、荷造運賃、支払手数料（販売サイト）、広告宣伝費', '年末に在庫を数えて「期末棚卸」に入れると、売上原価が正しく出る。'],
    therapist: ['セラピスト・整体・ヨガ', '地代家賃（施術室）、消耗品費（タオル・オイル）、広告宣伝費、研修費', '自宅開業は家賃・光熱費を面積や使用時間で按分する。'],
    delivery: ['配達・運送（軽貨物など）', '車両費（燃料）、修繕費、損害保険料、減価償却費（車両）、通信費', '車を私用でも使うなら、走行距離などで按分する。'],
    office: ['事務代行・データ入力', '通信費、消耗品費、減価償却費（PC）', '在宅の作業スペースは按分する。'],
    shop: ['小売店・飲食店', '仕入、給料賃金、地代家賃、水道光熱費、消耗品費、支払手数料（キャッシュレス）', '軽減税率（8%）と標準税率（10%）の売上を分けて記録する。'],
    other: ['その他・個人経営', '業種に合わせて科目を選ぶ', '必要経費に該当するか確認し、証拠と按分根拠を保存してください。']
  };
  var thisYear = new Date().getFullYear(), defaultYear = new Date().getMonth() < 3 ? thisYear - 1 : thisYear;

  var cols = {
    ledger: {
      title: '帳簿（売上・経費）', desc: '金額は税込で入力（税込経理）。自宅と兼用の出費は「事業割合」を入れると、その分だけ経費になります。証憑（領収書・請求書・電子データ）の保管場所も書いておくと、税務調査や見直しのときに困りません。',
      fields: [
        { k: 'date', label: '日付', type: 'date' }, { k: 'kind', label: '区分', type: 'select', options: KINDS },
        { k: 'account', label: '科目', type: 'select', options: [''].concat(INCOMES, ['仕入'], EXPENSES) }, { k: 'partner', label: '取引先' },
        { k: 'item', label: '内容' }, { k: 'amount', label: '金額（税込）', type: 'yen' }, { k: 'taxRate', label: '税率', type: 'select', options: ['10', '8', '0', '対象外'] },
        { k: 'ratio', label: '事業割合%', type: 'pct' }, { k: 'withheld', label: '源泉徴収税額', type: 'yen' },
        { k: 'pay', label: '支払・受取', type: 'select', options: ['銀行振込', '現金', 'カード', '電子マネー', '未収', '未払'] }, { k: 'evidence', label: '証憑の保管場所' }, { k: 'source', label: '転記元' }
      ]
    },
    assets: {
      title: '固定資産（減価償却）', desc: '10万円以上のパソコン・カメラ・車など。定額法の概算と、その年の必要経費を出します。',
      fields: [
        { k: 'name', label: '名称' }, { k: 'acquired', label: '使い始めた日', type: 'date' }, { k: 'cost', label: '取得価額', type: 'yen' },
        { k: 'life', label: '耐用年数', type: 'number' }, { k: 'method', label: '方法', type: 'select', options: ['定額法', '一括償却（3年）', '少額特例（全額・青色のみ）'] },
        { k: 'businessRatio', label: '事業割合%', type: 'pct' }, { k: 'memo', label: 'メモ' }
      ]
    },
    taxDocs: {
      title: '申告の準備チェック', desc: '集める書類と期限。終わったらチェック。',
      fields: [{ k: 'item', label: '項目' }, { k: 'due', label: '期限', type: 'date' }, { k: 'done', label: '済', type: 'check' }, { k: 'memo', label: 'メモ' }]
    }
  };
  var METHOD = { '定額法': 'straight', '一括償却（3年）': 'lump3', '少額特例（全額・青色のみ）': 'small' };

  function ts() { return St.modSettings('tax'); }
  function yearOf(r) { return String(r.date || '').slice(0, 4); }
  function ratioOf(r) { var x = r.ratio === '' || r.ratio === undefined ? 100 : num(r.ratio); return Math.min(100, Math.max(0, x)) / 100; }
  function medicalOfYear(y) {
    if (!KD.has('health')) return { paid: num(ts().medicalManual), fromHealth: false };
    var list = St.rows('medical').filter(function (r) { return String(r.date).slice(0, 4) === String(y); });
    return { paid: A().sum(list, function (r) { return num(r.paid) + num(r.transport); }) + num(ts().medicalManual), fromHealth: true, rows: list };
  }
  function summary(y) {
    var list = St.rows('ledger').filter(function (r) { return yearOf(r) === String(y); }), s = ts();
    var out = { sales: 0, misc: 0, purchases: 0, exp: {}, withheld: 0, byPartner: {}, monthly: [], sales10: 0, sales8: 0, count: list.length };
    for (var i = 0; i < 12; i++) out.monthly.push({ sales: 0, purchases: 0 });
    list.forEach(function (r) {
      var amt = num(r.amount), m = +String(r.date).slice(5, 7) - 1;
      if (r.kind === '売上') {
        out.sales += amt; if (m >= 0) out.monthly[m].sales += amt;
        if (r.taxRate === '10') out.sales10 += amt; else if (r.taxRate === '8') out.sales8 += amt;
        var w = num(r.withheld); if (w) { out.withheld += w; out.byPartner[r.partner || '（未記入）'] = (out.byPartner[r.partner || '（未記入）'] || 0) + w; }
      } else if (r.kind === '雑収入・家事消費') { out.misc += amt; }
      else if (r.kind === '仕入') { var p = Math.floor(amt * ratioOf(r)); out.purchases += p; if (m >= 0) out.monthly[m].purchases += p; }
      else if (r.kind === '経費') { var a = r.account && EXPENSES.indexOf(r.account) >= 0 ? r.account : '雑費'; out.exp[a] = (out.exp[a] || 0) + Math.floor(amt * ratioOf(r)); }
    });
    var dep = 0;
    St.rows('assets').forEach(function (a) { dep += C.depreciation({ cost: a.cost, acquired: a.acquired, life: a.life, method: METHOD[a.method] || 'straight', businessRatio: a.businessRatio === '' ? 100 : a.businessRatio }, y).expense; });
    if (dep) out.exp['減価償却費'] = (out.exp['減価償却費'] || 0) + dep;
    out.depreciation = dep;
    out.cogs = Math.max(0, num(s.inventoryStart) + out.purchases - num(s.inventoryEnd));
    out.expTotal = Object.keys(out.exp).reduce(function (a, k) { return a + out.exp[k]; }, 0);
    out.revenue = out.sales + out.misc;
    out.profit = out.revenue - out.cogs - out.expTotal;
    return out;
  }
  function vatMethod(y) { var s = ts(); if (s.vatMethod !== 'auto') return s.vatMethod; var r = C.taxYearRule(y); return r.exact ? r.rule.vat.kind : (y >= 2027 && y <= 2028 ? '3wari' : 'simple'); }
  function estimate(y) {
    var s = ts(), sm = summary(y), med = medicalOfYear(y);
    return C.taxEstimate({ year: y, businessSales: sm.revenue, businessExpense: sm.cogs + sm.expTotal, blue: s.blue, salary: s.salary, pensionKind: s.pensionKind, pensionAnnual: s.pensionAnnual,
      over65: s.over65, socialInsurance: s.socialInsurance, otherDeductions: s.otherDeductions, medicalPaid: med.paid, medicalReimbursed: s.medicalReimbursed,
      disabilityKind: s.disabilityKind, dependentsDisabled: s.dependentsDisabled, businessTaxRate: s.businessTaxRate, withheld: sm.withheld + num(s.withheldManual) }, St.rates());
  }

  function sample(H) {
    var y = String(new Date().getFullYear()), rows = [], partners = ['サンプル商事（架空）', 'こもれび食堂（架空）', 'ひだまり工房（架空）', 'みどり公民館（架空）'];
    var start = new Date().getMonth();
    for (var m = 0; m <= start; m++) {
      var mm = y + '-' + C.pad(m + 1);
      partners.slice(0, H.int(2, 4)).forEach(function (p, i) {
        var amt = H.round(H.int(15000, 90000), 1000), w = i % 2 === 0 ? C.withholding(Math.round(amt / 1.1)) : 0;
        rows.push({ date: mm + '-' + C.pad(H.int(20, 28)), kind: '売上', account: '売上', partner: p, item: H.pick(['記事作成', 'バナー制作', 'サイト保守', '講座講師']) + '（' + (m + 1) + '月分）', amount: amt, taxRate: '10', ratio: 100, withheld: w, pay: '銀行振込', evidence: '請求書フォルダ', source: '' });
      });
      [['通信費', 'インターネット回線', 5500, 50], ['通信費', 'AIサービス（例）', 3000, 100], ['地代家賃', '自宅家賃（按分）', 60000, 20], ['水道光熱費', '電気代', H.int(6000, 11000), 30], ['荷造運賃','見本商品の発送',H.int(600,1500),100], ['広告宣伝費','架空の展示案内の印刷',H.int(2000,4500),100], ['消耗品費','梱包材の補充',H.int(900,2200),100], ['新聞図書費', '参考書籍', H.int(1500, 4000), 100], ['消耗品費', '文具・インク', H.int(800, 3500), 100]].forEach(function (e) {
        if (e[0] === '新聞図書費' && H.chance(0.5)) return;
        rows.push({ date: mm + '-' + C.pad(H.int(1, 27)), kind: '経費', account: e[0], partner: '', item: e[1], amount: e[2], taxRate: '10', ratio: e[3], withheld: 0, pay: e[0] === '地代家賃' ? '銀行振込' : 'カード', evidence: 'レシート箱・カード明細', source: '' });
      });
      if (H.chance(0.35)) rows.push({ date: mm + '-' + C.pad(H.int(1, 27)), kind: '経費', account: '旅費交通費', partner: '', item: '打ち合わせ交通費', amount: H.int(400, 1600), taxRate: '10', ratio: 100, withheld: 0, pay: '電子マネー', evidence: '交通系ICの履歴', source: '' });
    }
    var ny = +y + 1;
    return {
      ledger: rows,
      assets: [{ name: 'ノートパソコン（例）', acquired: y + '-02-10', cost: 165000, life: 4, method: '定額法', businessRatio: 80, memo: '' }, { name: 'タブレット（例）', acquired: y + '-05-20', cost: 98000, life: 4, method: '少額特例（全額・青色のみ）', businessRatio: 100, memo: '特例の適用期限・取得価額・対象者・年間上限を公式情報で確認' }],
      taxDocs: [
        { item: '国民年金保険料の控除証明書（11月ごろ届く）', due: y + '-12-31', done: false, memo: '' }, { item: '生命保険料・地震保険料の控除証明書', due: y + '-12-31', done: false, memo: '' },
        { item: '年末の在庫を数える（物販がある場合）', due: y + '-12-31', done: false, memo: '期末棚卸' }, { item: '医療費の領収書をまとめる', due: ny + '-02-10', done: false, memo: '体調・通院の画面からCSV' },
        { item: 'ふるさと納税の受領書（寄附金受領証明書）', due: ny + '-02-10', done: false, memo: '' }, { item: '給与の源泉徴収票', due: ny + '-02-10', done: false, memo: '' },
        { item: 'e-Taxの準備（マイナンバーカード・読み取りできるスマホ）', due: ny + '-02-15', done: false, memo: '' },
        { item: '所得税の確定申告（提出・納付）', due: ny + '-03-15', done: false, memo: '期限が土日なら翌平日' }, { item: '消費税の確定申告（課税事業者だけ）', due: ny + '-03-31', done: false, memo: '' }
      ]
    };
  }

  // ---- 画面 ----
  function yearSelect() {
    var opts = []; for (var y = 2027; y >= 2025; y--) opts.push([y, C.warekiYear(y) + '年分（' + y + '）']);
    return A().set('mod.tax.year', 'select', { options: opts, numeric: true, render: true });
  }
  function blueSelect(y) { return A().set('mod.tax.blue', 'select', { options: C.taxYearRule(y).rule.blue.map(function (b) { return [b[0], b[2]]; }) }); }
  function lineItems(sm) {
    var rows = [['売上（収入）金額', sm.sales], ['家事消費・雑収入', sm.misc], ['期首商品棚卸高', num(ts().inventoryStart)], ['仕入金額', sm.purchases], ['期末商品棚卸高', num(ts().inventoryEnd)], ['売上原価', sm.cogs]];
    EXPENSES.forEach(function (k) { if (sm.exp[k]) rows.push([k, sm.exp[k]]); });
    rows.push(['経費の合計', sm.expTotal], ['差引金額（青色申告特別控除前の所得）', sm.profit]);
    return rows;
  }
  function view() {
    var s = ts(), y = num(s.year) || defaultYear, v = h('div'), live = A().live, rule = C.taxYearRule(y);
    if (!rule.rule.blue.some(function (b) { return b[0] === String(s.blue); })) St.setSetting('mod.tax.blue', '0'); // 年分で区分が変わったとき
    v.appendChild(A().viewHead('帳簿・確定申告', '日々の帳簿から、申告書に写す金額まで。税込経理・概算です。', h('label', { class: 'month-pick' }, '年分 ', yearSelect())));
    if (!rule.exact) v.appendChild(h('p', { class: 'warn' }, C.warekiYear(y) + '年分のルールはまだ入っていません。' + rule.rule.label + 'のルールで計算しています。「最新情報に更新」か公式サイトで確認してください。'));
    var job = JOBS[s.job] || JOBS.other;
    v.appendChild(A().grid(
      U.card(C.warekiYear(y) + '年分のまとめ', { wide: true, cls: 'accent' }, live(function () {
        var sm = summary(y), e = estimate(y);
        return h('div', null, h('div', { class: 'stats' },
          U.stat('収入（売上＋雑収入）', yen(sm.revenue), sm.count + '件の記帳'), U.stat('売上原価＋経費', yen(sm.cogs + sm.expTotal), '按分後'),
          U.stat('所得（青色控除後）', yen(e.businessIncome), '青色申告特別控除 ' + yen(e.blueDeduction)),
          U.stat('源泉徴収された税額', yen(sm.withheld + num(s.withheldManual)), '申告で精算される'),
          U.stat('所得税（概算）', yen(e.incomeTax), e.incomeTaxDue < 0 ? '還付の見込み ' + yen(-e.incomeTaxDue) : '納付の見込み ' + yen(e.incomeTaxDue), e.incomeTaxDue < 0 ? 'good' : ''),
          U.stat('住民税（概算）', e.residentExempt ? '非課税の見込み' : yen(e.residentTax), '翌年度に課税')),
          h('p', { class: 'warn small' }, 'このツールは複式簿記・貸借対照表・優良な電子帳簿の要件を満たす会計ソフトではありません。青色申告控除は他の帳簿を含め適用要件を満たす場合だけ選択してください。令和9年分の10万円控除には前々年の収入要件等があります。税額は配偶者・扶養・住宅ローン・税額控除等を自動反映しない概算です。'), h('p', { class: 'muted small' }, e.yearLabel + 'のルール（基礎控除 ' + yen(e.basicDeduction) + '）で計算。国民健康保険料は市区町村ごとに違うため計算しません。'));
      })),
      U.card('申告のしかた', null, A().form([
        A().field('青色申告特別控除', blueSelect(y), y >= 2027 ? '令和9年分から75万・65万・10万円の区分に変わります' : '65万円はe-Tax（または優良な電子帳簿）が条件'),
        A().field('職種', A().set('mod.tax.job', 'select', { render: true, options: Object.keys(JOBS).map(function (k) { return [k, JOBS[k][0]]; }) }))]),
        h('p', { class: 'small' }, h('strong', null, 'よく使う経費：'), job[1]), h('p', { class: 'small' }, h('strong', null, '注意：'), job[2])),
      U.card('収支内訳書・青色申告決算書に写す金額', { wide: true, action: h('button', { type: 'button', class: 'btn small ghost', on: { click: function () {
        var sm = summary(y), rows = [['項目', '金額']].concat(lineItems(sm));
        sm.monthly.forEach(function (x, i) { rows.push([(i + 1) + '月 売上', x.sales], [(i + 1) + '月 仕入', x.purchases]); });
        Object.keys(sm.byPartner).forEach(function (p) { rows.push(['源泉徴収税額：' + p, sm.byPartner[p]]); });
        U.saveFile('確定申告まとめ_' + y + '.csv', C.toCSV(rows), 'text/csv').then(function (ok) { if (ok) U.toast(ok === true ? 'まとめをCSVで保存しました' : 'まとめCSVのダウンロードを開始しました（保存先はブラウザで確認）'); });
      } } }, 'まとめをCSV') }, live(function () {
        var sm = summary(y);
        return h('div', { class: 'two-col' },
          U.miniTable(['項目', '金額'], lineItems(sm).map(function (r) { return [r[0], yen(r[1])]; }), [1]),
          h('div', null, h('h4', null, '月別の売上・仕入'), U.miniTable(['月', '売上', '仕入'], sm.monthly.map(function (x, i) { return [(i + 1) + '月', yen(x.sales), yen(x.purchases)]; }), [1, 2]),
            h('h4', null, '取引先別の源泉徴収税額'), Object.keys(sm.byPartner).length ? U.miniTable(['取引先', '源泉徴収税額'], Object.keys(sm.byPartner).map(function (p) { return [p, yen(sm.byPartner[p])]; }), [1]) : U.empty('源泉徴収された売上はありません。')));
      }), h('p', { class: 'muted small' }, '確定申告書等作成コーナーや会計ソフトに、この表の金額を写してください。決算書の欄の並びに合わせています。'))));

    // 控除と税額
    var p = 'mod.tax.', F = A().field, S = A().set;
    v.appendChild(U.card('所得控除と税額の概算', { wide: true, desc: '障害年金・遺族年金は非課税なので所得に入れません。障害者控除・医療費控除にも対応。' }, A().form([
      F('給与収入（雇用契約・額面年間）', S(p + 'salary', 'number'), 'A型の給与など。B型工賃・事業収入はここに入れず所得区分を確認してください。'),
      F('受け取っている年金', S(p + 'pensionKind', 'select', { options: [['none', 'なし'], ['disability', '障害年金（非課税）'], ['survivor', '遺族年金（非課税）'], ['old', '老齢年金（課税）']] })),
      F('年金の年額', S(p + 'pensionAnnual', 'number')), F('65歳以上', S(p + 'over65', 'check')),
      F('社会保険料（実際に払った額）', S(p + 'socialInsurance', 'number'), '国民年金が免除ならその分は0'),
      F('その他の所得控除', S(p + 'otherDeductions', 'number'), '生命保険料・小規模企業共済・寄附金など'),
      F('医療費（体調・通院の記録以外の分）', S(p + 'medicalManual', 'number'), KD.has('health') ? '通院の記録の「支払った額＋交通費」は自動で合算' : '1年間に支払った医療費'),
      F('保険などで補てんされた額', S(p + 'medicalReimbursed', 'number')),
      F('本人の障害者控除', S(p + 'disabilityKind', 'select', { options: [['none', 'なし'], ['normal', '障害者（27万円）'], ['special', '特別障害者（40万円）']] })),
      F('障害がある扶養親族（人数）', S(p + 'dependentsDisabled', 'number', { min: 0 })),
      F('個人事業税の税率(%)', S(p + 'businessTaxRate', 'select', { numeric: true, options: [[0, '対象外・0%'], [3, '3%'], [4, '4%'], [5, '5%']] }), '業種で異なる'),
      F('帳簿以外の源泉徴収税額', S(p + 'withheldManual', 'number'), '給与の源泉徴収票の分など'),
      F('期首の在庫（棚卸高）', S(p + 'inventoryStart', 'number')), F('期末の在庫（棚卸高）', S(p + 'inventoryEnd', 'number'), KD.has('shop') ? '小売店の画面から反映できます' : '年末に数えた在庫の原価')
    ]), live(function () {
      var e = estimate(y), med = medicalOfYear(y);
      return h('div', null, h('div', { class: 'stats' },
        U.stat('合計所得金額', yen(e.totalIncome), '事業' + yen(e.businessIncome) + '＋給与' + yen(e.salaryIncome) + '＋雑' + yen(e.miscIncome)),
        U.stat('医療費控除', yen(e.medicalDeduction), '支払った医療費 ' + yen(med.paid)),
        U.stat('課税される所得', yen(e.taxableIncome)), U.stat('所得税（復興税込）', yen(e.incomeTax)),
        U.stat('個人事業税', yen(e.businessTax), '事業所得−290万円×税率'), U.stat('非課税の年金', yen(e.nonTaxablePension), '所得に含めていません')));
    })));
    // 消費税
    v.appendChild(U.card('消費税（インボイス登録した人）', { wide: true }, A().form([
      F('適格請求書発行事業者（課税事業者）', S(p + 'vatRegistered', 'check', { render: true })),
      F('計算方法', S(p + 'vatMethod', 'select', { options: [['auto', '年分から自動（' + (rule.rule.vat.label) + '）'], ['2wari', '2割特例'], ['3wari', '3割特例'], ['simple', '簡易課税'], ['general', '一般課税']] })),
      F('簡易課税の事業区分', S(p + 'simpleKind', 'select', { numeric: true, options: [[1, '第1種 卸売（90%）'], [2, '第2種 小売（80%）'], [3, '第3種 製造など（70%）'], [4, '第4種 飲食など（60%）'], [5, '第5種 サービス（50%）'], [6, '第6種 不動産（40%）']] })),
      F('一般課税の仕入税額', S(p + 'inputTax', 'number'))]),
      live(function () {
        if (!ts().vatRegistered) return h('p', { class: 'muted' }, '免税事業者は消費税の申告はありません（基準期間の課税売上が1,000万円以下で、登録していない場合）。');
        var sm = summary(y), m = vatMethod(y), t = C.consumptionTax(m, sm.sales10, sm.sales8, { kind: ts().simpleKind, inputTax: ts().inputTax });
        return h('div', { class: 'stats' }, U.stat('10%の売上（税込）', yen(sm.sales10)), U.stat('8%の売上（税込）', yen(sm.sales8)),
          U.stat('納める消費税（概算）', yen(t), { '2wari': '2割特例', '3wari': '3割特例', simple: '簡易課税', general: '一般課税' }[m] || m));
      }), h('p', { class: 'muted small' }, '2割特例は令和8年9月30日を含む課税期間まで（個人は令和8年分まで）。令和9・10年分は、基準期間の課税売上1,000万円以下の個人に3割特例（令和8年度税制改正）。')));

    v.appendChild(U.table('ledger', {
      filter: function (r) { return !r.date || yearOf(r) === String(y); },
      sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, csvName: '帳簿_' + y,
      newRow: function () { return { date: String(y) === C.today().slice(0, 4) ? C.today() : y + '-12-31', kind: '経費', taxRate: '10', ratio: 100, pay: 'カード' }; },
      extraCols: [{ label: '経費になる額', value: function (r) { return r.kind === '経費' || r.kind === '仕入' ? yen(Math.floor(num(r.amount) * ratioOf(r))) : '—'; } }]
    }));
    v.appendChild(U.table('assets', { newRow: function () { return { acquired: C.today(), life: 4, method: '定額法', businessRatio: 100 }; }, extraCols: [
      { label: y + '年の償却費', value: function (a) { return yen(C.depreciation({ cost: a.cost, acquired: a.acquired, life: a.life, method: METHOD[a.method], businessRatio: a.businessRatio }, y).amount); } },
      { label: '必要経費', value: function (a) { return yen(C.depreciation({ cost: a.cost, acquired: a.acquired, life: a.life, method: METHOD[a.method], businessRatio: a.businessRatio === '' ? 100 : a.businessRatio }, y).expense); } },
      { label: '年末の未償却残高', value: function (a) { return yen(C.depreciation({ cost: a.cost, acquired: a.acquired, life: a.life, method: METHOD[a.method] }, y).bookEnd); } }] }));
    v.appendChild(U.table('taxDocs', { sort: function (a, b) { return String(a.due).localeCompare(String(b.due)); }, extraCols: [{ label: '残り', value: function (r) { var d = C.daysUntil(r.due); return r.done ? '済' : d === null ? '—' : d < 0 ? (-d) + '日超過' : 'あと' + d + '日'; } }] }));
    if (KD.has('health')) v.appendChild(U.card('医療費控除の明細', { desc: '体調・通院の記録から、医療費控除の明細書に写す一覧をCSVで作ります。' }, h('button', { type: 'button', class: 'btn', on: { click: function () {
      var med = medicalOfYear(y), rows = [['日付', '医療機関・薬局', '区分', '支払った医療費', '通院交通費', '補てんされる金額']];
      (med.rows || []).forEach(function (r) { rows.push([r.date, r.place, r.kind, num(r.paid), num(r.transport), '']); });
      U.saveFile('医療費の明細_' + y + '.csv', C.toCSV(rows), 'text/csv').then(function (ok) { if (ok) U.toast(ok === true ? '医療費の明細を保存しました' : '医療費の明細のダウンロードを開始しました（保存先はブラウザで確認）'); });
    } } }, '医療費の明細をCSVで保存')));
    return v;
  }
  function home() {
    var y = num(ts().year) || defaultYear;
    return [A().homeCard('確定申告の準備（' + C.warekiYear(y) + '年分）', { action: A().navBtn('tax', '帳簿を開く'), easy: true }, A().live(function () {
      var sm = summary(y), e = estimate(y), docs = St.rows('taxDocs').filter(function (r) { return !r.done; }).sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
      return h('div', null, h('div', { class: 'stats' }, U.stat('所得の見込み', yen(e.businessIncome)), U.stat('所得税の見込み', yen(e.incomeTaxDue), e.incomeTaxDue < 0 ? '還付' : '納付', e.incomeTaxDue < 0 ? 'good' : '')),
        docs.length ? h('p', { class: 'small' }, '次の準備：' + docs[0].item + '（' + docs[0].due + '）') : null, h('p', { class: 'muted small' }, sm.count + '件の記帳から計算'));
    }))];
  }
  // 他の画面から帳簿へ転記する
  KD.toLedger = function (values) { if (!KD.has('tax')) return false; St.addRow('ledger', values); return true; };
  KD.tax = { summary: summary };
  KD.mod({ id: 'tax', title: '帳簿・確定申告', icon: '申', order: 40, usesRates: true, collections: cols, sample: sample, view: view, home: home,
    defaults: { year: defaultYear, blue: '0', job: 'other', salary: 0, pensionKind: 'none', pensionAnnual: 0, over65: false, socialInsurance: 0, otherDeductions: 0, medicalManual: 0, medicalReimbursed: 0,
      disabilityKind: 'none', dependentsDisabled: 0, businessTaxRate: 0, withheldManual: 0, vatRegistered: false, vatMethod: 'auto', simpleKind: 5, inputTax: 0, inventoryStart: 0, inventoryEnd: 0 } });
})(this);
