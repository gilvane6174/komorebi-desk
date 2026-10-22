/*
 * こもれびデスク — 年金・制度（障害年金・国民年金の免除・手当・更新期限）
 * 受け取れるかどうかの判定はしない。金額は概算。
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, yen = C.yen, KD = root.KD;
  function A() { return root.App; }

  var cols = {
    benefits: {
      title: '年金・手当の受給記録', desc: '振込を確認した額だけを記録。年金は原則、偶数月に前2か月分が振り込まれます。',
      fields: [
        { k: 'date', label: '受取日', type: 'date' },
        { k: 'kind', label: '種類', type: 'select', options: ['障害基礎年金', '障害厚生年金', '老齢年金', '遺族年金', '特別障害者手当', '自治体の手当', '児童手当', '児童扶養手当', '生活保護', '住宅扶助', 'その他'] },
        { k: 'amount', label: '金額', type: 'yen' }, {k:'scheme',label:'関連制度名（制度メモと同じ名前）'}, { k: 'covers', label: '何月分' }, { k: 'memo', label: 'メモ' }
      ]
    },
    deadlines: {
      title: '書類・更新の期限', desc: '更新を忘れると止まる手続きをまとめて管理。残り日数が少ない順にホームへ表示します。',
      fields: [
        { k: 'item', label: '手続き' }, {k:'scheme',label:'関連制度名（制度メモと同じ名前）'}, { k: 'due', label: '期限', type: 'date' }, { k: 'where', label: '窓口（例）' },
        { k: 'docs', label: '必要なもの', type: 'textarea' }, { k: 'status', label: '状態', type: 'select', options: ['未着手', '準備中', '提出済', '完了'] }
      ]
    },
    supports: {
      title: '使える制度のメモ', desc: '一般的な制度名の例です。対象かどうか・金額は窓口で必ず確認してください。',
      fields: [{ k: 'name', label: '制度' }, {k:'official',label:'確認先の公式URL',type:'url'}, { k:'amount',label:'受取額・軽減額（確認済のみ）',type:'yen' }, {k:'due',label:'次回確認日',type:'date'}, { k: 'status', label: '状態', type: 'select', options: ['利用中', '確認中', '対象外', '未確認'] }, { k: 'where', label: '相談先' }, { k: 'memo', label: 'メモ', type: 'textarea' }]
    }
  };
  function ps() { return St.modSettings('pension'); }

  function sample(H) {
    var p = C.disabilityPension({ grade: 2 }), b = [];
    for (var i = 1; i <= 4; i++) { var d = C.pensionPaydays(new Date(Date.now() - (i * 62 + 10) * 86400000), 1)[0]; b.push({ date: C.ymd(d.date), kind: '障害基礎年金', amount: p.perPayment, covers: d.covers, memo: '金額は令和8年度2級の例' }); }
    var ny = new Date().getFullYear() + 1;
    return {
      benefits: b,
      deadlines: [
        { item: '障害年金の診断書（障害状態確認届）の提出', due: H.day(H.int(30, 90)), where: '年金事務所（郵送）', docs: '届いた様式、主治医の記入', status: '未着手' },
        { item: '自立支援医療（精神通院）の更新', due: H.day(H.int(40, 120)), where: '市区町村の担当窓口', docs: '申請書、診断書（2回に1回）、保険証の写しなど', status: '未着手' },
        { item: '障害者手帳の更新', due: H.day(H.int(90, 300)), where: '市区町村の担当窓口', docs: '申請書、診断書、写真', status: '未着手' },
        { item: '障害福祉サービス受給者証の更新', due: H.day(H.int(20, 80)), where: '市区町村の障害福祉の窓口', docs: '申請書、サービス等利用計画（相談支援事業所と相談）', status: '準備中' },
        { item: '国民年金 法定免除の届出（該当時）', due: H.day(H.int(-10, 30)), where: '市区町村・年金事務所', docs: '年金証書など', status: '提出済' },
        { item:'受け取った通知の控えを整理する（架空例）',due:H.day(7),where:'自分の保管フォルダ',docs:'通知と受取日のメモ',status:'準備中'},{item:'提出書類の控えを保存する（架空例）',due:H.day(14),where:'自分の保管フォルダ',docs:'提出内容と受付の控え',status:'未着手'},{ item: '確定申告', due: ny + '-03-15', where: '税務署（e-Tax可）', docs: '帳簿のまとめ、控除証明書', status: '未着手' }
      ],
      supports: [
        { name: '障害年金（基礎・厚生）', official:'https://www.nenkin.go.jp/service/jukyu/shougainenkin/', status: '利用中', where: '年金事務所', memo: '更新時期を期限表へ' },
        { name: '国民年金の法定免除', status: '利用中', where: '年金事務所・市区町村', memo: '障害基礎年金1・2級の受給者が対象。将来の年金額への影響と追納も確認' },
        { name: '自立支援医療', status: '確認中', where: '市区町村', memo: '自己負担の月額上限は受給者証の額を入力' },
        { name: '障害者控除（税）', status: '利用中', where: '確定申告・年末調整', memo: '手帳などで対象を確認' },
        { name: '住民税の非課税（障害者）', status: '確認中', where: '市区町村', memo: '前年の合計所得金額が135万円以下なら対象になり得る' },
        { name: '就労継続支援・就労移行支援', status: '未確認', where: '市区町村・相談支援事業所', memo: '工賃と利用料を月別収入に分けて記録' },
        { name: '特別障害者手当', status: '未確認', where: '市区町村', memo: '在宅で重度の障害が重複する20歳以上。所得制限あり' },
        {name:'障害児福祉手当',status:'未確認',where:'市区町村',memo:'年齢・障害程度・所得等の要件を確認'},
        {name:'特別児童扶養手当',status:'未確認',where:'市区町村',memo:'児童の障害状態・所得等を確認'},
        {name:'児童養育加算（生活保護）',status:'未確認',where:'福祉事務所',memo:'生活保護の加算区分。世帯の状況と認定を確認'},
        {name:'母子父子寡婦福祉資金貸付金',status:'未確認',where:'自治体のひとり親支援窓口',memo:'貸付金。要件と返済条件を確認'},
        {name:'高等職業訓練促進給付金',status:'未確認',where:'自治体のひとり親支援窓口',memo:'対象資格・修業期間・所得等の要件を確認'},
        {name:'ひとり親家庭等日常生活支援事業',status:'未確認',where:'自治体のひとり親支援窓口',memo:'実施していない自治体もある'},
        {name:'補装具費支給・日常生活用具給付',status:'未確認',where:'障害福祉窓口',memo:'対象品目と自己負担、自治体要件を確認'},
        {name:'精神障害者保健福祉手帳',status:'未確認',where:'障害福祉窓口',memo:'更新日や利用できる減免等を確認'},
        {name:'難病医療費助成・小児慢性特定疾病医療費助成',status:'未確認',where:'保健所等',memo:'指定疾病・診断書等の要件を確認'},
        { name: '児童扶養手当（ひとり親家庭等）',status:'未確認',where:'市区町村の子育て窓口',memo:'所得・養育状況等による条件あり。受給可否は窓口で確認' },
        {name:'生活保護の母子加算',status:'未確認',where:'福祉事務所',memo:'生活保護制度の加算項目。児童扶養手当とは別。該当・金額は福祉事務所で確認'},
        {name:'ひとり親家庭等医療費助成',status:'未確認',where:'自治体の医療助成窓口',memo:'自治体により制度・条件が異なる'},
        {name:'就学援助・教育扶助',status:'未確認',where:'学校・教育委員会・福祉事務所',memo:'制度の区分と併用条件を確認'},
        {name:'住居確保給付金',status:'未確認',where:'自立相談支援機関',memo:'離職・収入減等の条件を要確認'},
        {name:'高額介護サービス費・介護保険負担限度額認定',status:'未確認',where:'介護保険窓口',memo:'認定・所得条件を要確認'},
        { name: '高額療養費・限度額適用認定', status: '確認中', where: '加入している健康保険', memo: '窓口負担を上限までにできる（マイナ保険証なら申請不要の場合あり）' }
      ]
    };
  }

  function manualRates() {
    var cur = St.rates().values;
    return A().form(Object.keys(C.RATE_LABELS).map(function (k) {
      var i = h('input', { type: 'number', class: 'num', step: 'any', on: { change: function (e) {
        var r = St.get().rates ? JSON.parse(JSON.stringify(St.get().rates)) : { label: '手入力した値', checkedAt: C.today(), values: {}, sources: [] };
        r.values[k] = Number(e.target.value); r.label = '手入力した値';
        var lim = C.RATE_LIMITS[k];
        if (!(r.values[k] >= lim[0] && r.values[k] <= lim[1])) { U.toast('値の範囲が正しくありません（' + lim[0] + '〜' + lim[1] + '）'); A().render(); return; }
        St.setRates(r);
      } } });
      i.value = cur[k]; return A().field(C.RATE_LABELS[k], i);
    }));
  }
  function view() {
    var v = h('div'), live = A().live, F = A().field, S = A().set;
    v.appendChild(A().viewHead('年金・制度', '障害年金・国民年金の免除・手当・更新期限をひとまとめに。金額は概算で、受け取れるかどうかの判定はしません。'));
    v.appendChild(A().grid(
      U.card('障害年金の見込み額', { desc: '等級は年金の法令で決まり、障害者手帳の等級とは別です。障害厚生年金は通知書の額を手入力してください。' }, A().form([
        F('障害年金の等級', S('mod.pension.grade', 'select', { numeric: true, options: [[0, 'なし・申請前'], [1, '1級'], [2, '2級'], [3, '3級（厚生年金のみ）']] })),
        F('加算の対象になる子（人数）', S('mod.pension.children', 'number', { min: 0 }), '18歳到達年度末まで、または20歳未満で1・2級の子'),
        F('障害厚生年金（年額・通知書の額）', S('mod.pension.employeeAnnual', 'number'))]), live(function () {
        var r = C.disabilityPension(ps(), St.rates());
        return h('div', { class: 'stats' }, U.stat('年額', yen(r.annual), '基礎' + yen(r.basic) + '＋子' + yen(r.child) + '＋厚生' + yen(r.employee)), U.stat('月あたり', yen(r.monthly)), U.stat('1回の振込（2か月分）', yen(r.perPayment)), U.stat('税金', '非課税', '所得税・住民税の所得に含めない'));
      })),
      U.card('国民年金の保険料', null, live(function () {
        var v2 = St.rates().values, g = Number(ps().grade);
        return h('div', null, h('div', { class: 'stats' }, U.stat('今年度の月額', yen(v2.nationalPensionMonthly), '来年度 ' + yen(v2.nationalPensionMonthlyNext)), U.stat('年額', yen(v2.nationalPensionMonthly * 12))),
          g === 1 || g === 2 ? h('p', { class: 'ok' }, '障害基礎年金1・2級の受給者は「法定免除」の対象です。届出が必要な場合があります。免除期間は将来の老齢基礎年金が減るため、追納や「納付申出」も窓口で確認を。')
            : h('p', { class: 'muted' }, '収入が少ない時は申請免除・納付猶予の制度があります。未納のままにせず窓口へ。'));
      })),
      U.card('年金の振込予定（次の3回）', { cls: 'easy' }, live(function () {
        var r = C.disabilityPension(ps(), St.rates());
        return h('ul', { class: 'list' }, C.pensionPaydays(new Date(), 3).map(function (x) { var d = x.date; return h('li', null, h('strong', null, (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'[d.getDay()] + '）'), ' ', x.covers, r.annual ? '　見込み ' + yen(r.perPayment) : ''); }));
      })),
      U.card('ほかの手当・制度（例）', null, live(function () {
        var rt = St.rates().values;
        return h('ul', { class: 'list' }, h('li', null, '特別障害者手当：月額 ' + yen(rt.specialDisabilityAllowance) + '（在宅で重度の障害が重複する20歳以上・所得制限あり）'),
          h('li', null, '住民税の非課税：障害者で前年の合計所得 ' + yen(rt.residentTaxExemptDisabled) + ' 以下'), h('li', null, '自立支援医療：自己負担は原則1割、月の上限は受給者証の額'));
      }))));
    v.appendChild(U.table('benefits', { sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: C.today(), kind: '障害基礎年金' }; },
      footer: live(function () { var y = String(new Date().getFullYear()); return h('p', null, y + '年の受取合計：', h('strong', null, yen(A().sum(St.rows('benefits').filter(function (r) { return String(r.date).slice(0, 4) === y; }), function (r) { return r.amount; })))); }) }));
    v.appendChild(U.table('deadlines', { sort: function (a, b) { return String(a.due).localeCompare(String(b.due)); }, extraCols: [{ label: '残り', value: function (r) { var d = C.daysUntil(r.due); return d === null ? '—' : d < 0 ? (-d) + '日超過' : 'あと' + d + '日'; } }] }));
    v.appendChild(U.table('supports'));
    v.appendChild(U.card('制度と入金・期限の紐付け',{wide:true,desc:'受取記録・期限の「関連制度名」と、制度メモの「制度」を同じ文字列にすると集計を紐付けられます。受給資格の判定は行いません。'},live(function(){return U.miniTable(['制度','管理状態','受取記録の合計','次回の期限'],St.rows('supports').map(function(x){var got=St.rows('benefits').filter(function(r){return r.scheme===x.name;}),due=St.rows('deadlines').filter(function(r){return r.scheme===x.name&&r.due&&r.status!=='完了';}).sort(function(a,b){return String(a.due).localeCompare(String(b.due));});return [x.name,x.status,got.length?yen(A().sum(got,function(r){return r.amount;})):'—',due.length?due[0].due:'—'];}));})));

    v.appendChild(U.card('制度の基準値を手で直す', { wide: true, desc: '「設定・バックアップ」の「最新情報に更新」を使うか、公式サイトで確認した値をここに入れます。' }, manualRates()));
    return v;
  }
  function home() {
    return [A().homeCard('次の年金の振込', { easy: true }, A().live(function () {
      var r = C.disabilityPension(ps(), St.rates()), d = C.pensionPaydays(new Date(), 1)[0];
      return h('div', null, h('p', { class: 'big-num' }, (d.date.getMonth() + 1) + '月' + d.date.getDate() + '日（' + '日月火水木金土'[d.date.getDay()] + '）'), h('p', null, d.covers + (r.annual ? '・見込み ' + yen(r.perPayment) : '')),
        h('p', { class: 'muted small' }, '偶数月の15日（土日は直前の平日）。祝日は考慮していない目安です。'));
    })), A().homeCard('近い期限（書類・更新）', { action: A().navBtn('pension', '期限を開く'), easy: true }, A().live(function () {
      var list = St.rows('deadlines').filter(function (r) { return r.status !== '完了' && r.due; }).map(function (r) { return { r: r, d: C.daysUntil(r.due) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 5);
      return list.length ? h('ul', { class: 'list' }, list.map(function (x) { return h('li', null, U.badge(x.d < 0 ? (-x.d) + '日超過' : 'あと' + x.d + '日', x.d < 0 ? 'bad' : x.d <= 14 ? 'warn' : ''), ' ', x.r.item, h('span', { class: 'muted' }, '（' + x.r.status + '）')); })) : U.empty('近い期限はありません。');
    }))];
  }
  KD.mod({ id: 'pension', title: '年金・制度', icon: '年', order: 60, usesRates: true, collections: cols, sample: sample, view: view, home: home, defaults: { grade: 0, children: 0, employeeAnnual: 0 } });
})(this);
