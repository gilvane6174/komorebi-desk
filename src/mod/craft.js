/*
 * こもれびデスク — 受注制作・材料（ハンドメイド作家・受注制作）v2.8
 * 注文の進捗と原価、材料の残量と単価、作品のレシピ（材料×数量）から原価を自動計算、
 * 販売先ごとの手数料・送料を引いた利益と、目標の利益を残すための最低価格。配送先はここに保存しない。外部通信なし。サンプルはすべて架空。
 */
(function (root) {
  'use strict';
  var KD = root.KD, U = root.UI, C = root.Calc, St = root.Store, h = U.h, R = KD.rec, f = R.f, date = R.date, note = R.note, num = C.num, yen = C.yen;
  function A() { return root.App; }
  function cs() { return St.modSettings('craft'); }
  function matCost() { var o = {}; St.rows('craftMaterials').forEach(function (m) { if (m.code) o[m.code] = num(m.unitCost); }); return o; }
  // 作品1つの材料費（レシピ×材料の単価）
  function recipeCost(product) {
    var mc = matCost(), lines = St.rows('craftRecipes').filter(function (r) { return r.product === product; });
    return { cost: Math.round(lines.reduce(function (a, r) { return a + num(r.qty) * (mc[r.material] || 0); }, 0)), lines: lines.length, missing: lines.filter(function (r) { return !(r.material in mc) || !mc[r.material]; }).length };
  }
  function laborCost(p) { return Math.round(num(p.laborMin) / 60 * num(cs().hourly)); }
  // 販売先ごとの利益（価格−手数料−固定手数料−送料−材料費）と、目標利益を残す最低価格
  function profitTable(p) {
    var rc = recipeCost(p.code), labor = laborCost(p), target = num(cs().targetMargin) / 100;
    return St.rows('craftChannels').filter(function (c) { return c.name; }).map(function (c) {
      var rate = num(c.feeRate) / 100, fee = Math.round(num(p.price) * rate) + num(c.feeFixed), ship = num(c.shipping), profit = num(p.price) - fee - ship - rc.cost;
      var min = rate + target < 1 ? Math.ceil((rc.cost + labor + ship + num(c.feeFixed)) / (1 - rate - target) / 10) * 10 : 0;
      return [c.name, yen(fee), yen(ship), yen(profit), labor ? yen(profit - labor) : '—', min ? yen(min) : '—'];
    });
  }
  R.register({
    id: 'craft', title: '受注制作・材料', icon: '材', order: 19,
    lead: 'ハンドメイド作家・受注制作向け。注文ごとの進捗と原価、材料の残量、作品の原価と販売先ごとの利益を整理します。配送先はここに保存しません。',
    defaults: { hourly: 1000, targetMargin: 20 },
    cards: function (m) {
      var live = A().live, pick = A().ui.craftProduct || '';
      var products = St.rows('craftProducts').filter(function (p) { return p.code; });
      return [
        U.card('作品の原価と販売先ごとの利益', { wide: true, cls: 'accent', desc: '材料費はレシピ（材料×数量）と材料の単価から自動計算。最低価格は、材料費・作業時間（時給）・送料・手数料をまかない、目標の利益率が残る価格の目安です。' },
          h('div', { class: 'btn-row tight' }, (function () { var s = h('select', { 'aria-label': '作品を選ぶ', on: { change: function (e) { A().ui.craftProduct = e.target.value; A().render(); } } }, h('option', { value: '' }, '作品を選ぶ'), products.map(function (p) { return h('option', { value: p.code, selected: p.code === pick }, p.code + '：' + (p.item || '')); })); return s; })()),
          live(function () {
            var p = products.filter(function (x) { return x.code === pick; })[0];
            if (!p) return U.miniTable(['作品', '価格', '材料費（自動）', '作業時間', '材料の不足データ'], products.map(function (x) { var rc = recipeCost(x.code); return [x.code + '：' + (x.item || ''), yen(x.price), rc.lines ? yen(rc.cost) : 'レシピなし', (num(x.laborMin) || 0) + '分', rc.missing ? U.badge(rc.missing + '件の材料に単価がありません', 'warn') : '—']; }), [1, 2]);
            var rc = recipeCost(p.code);
            return h('div', null, h('div', { class: 'stats' }, U.stat('価格', yen(p.price)), U.stat('材料費（レシピから）', yen(rc.cost), rc.lines + '種類の材料'), U.stat('作業時間の目安', (num(p.laborMin) || 0) + '分', '時給 ' + yen(cs().hourly) + ' で ' + yen(laborCost(p)))),
              U.miniTable(['販売先', '手数料', '送料', '利益（材料費まで）', '作業代を引いた残り', '最低価格の目安'], profitTable(p), [1, 2, 3, 4, 5]));
          }),
          A().form([A().field('作業の時給（自分の目標）', A().set('mod.craft.hourly', 'number', { min: 0 })), A().field('目標の利益率（%）', A().set('mod.craft.targetMargin', 'number', { min: 0 }))]),
          h('p', { class: 'small muted' }, '税・設備費・材料のロスは含みません。販売サイトの手数料は、契約・規約の最新の率を入れてください。'))
      ];
    },
    summary: function (m) {
      var orders = St.rows('craftOrders').filter(function (r) { return A().inMonth(r.date, m) && r.status !== '取消'; }), margin = orders.reduce(function (n, r) { return n + num(r.price) - num(r.material) - num(r.fee) - num(r.shipping); }, 0),
        low = St.rows('craftMaterials').filter(function (r) { return num(r.bought) - num(r.used) <= num(r.reorder); });
      return U.miniTable(['受注件数', '受注額から入力費用を引いた額', '材料の補充候補'], [[orders.length, yen(margin), low.length + '種類']]);
    },
    tables: [
      { key: 'craftOrders', title: '受注・原価・発送確認', desc: '金額は注文1件の総額を入力。材料費が空なら、作品コードのレシピから自動で出します（右の列）。人件費・設備費・税は含みません。',
        sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); },
        extraCols: [{ label: '材料費（レシピ）', value: function (r) { var p = St.rows('craftProducts').filter(function (x) { return x.code && (x.code === r.product || x.item === r.item); })[0]; if (!p) return '—'; var rc = recipeCost(p.code); return rc.lines ? yen(rc.cost * (num(r.qty) || 1)) : '—'; } },
          { label: '差額の目安', value: function (r) { return yen(num(r.price) - num(r.material) - num(r.fee) - num(r.shipping)); } }],
        fields: [date(), f('code', '注文ID'), f('product', '作品コード'), f('item', '作品'), f('qty', '数量', 'number'), f('channel', '販売先'), f('price', '受注総額', 'yen'), f('material', '材料費総額', 'yen'), f('fee', '販売手数料', 'yen'), f('shipping', '負担送料', 'yen'),
          f('status', '工程', 'select', ['受付', '制作中', '検品', '発送済', '取消']), f('due', '納期・発送期限', 'date'), f('done', '対応完了', 'check'), note()] },
      { key: 'craftProducts', title: '作品（商品）', desc: '作品コードごとの価格と作業時間。レシピと販売先から原価と利益を出します。',
        extraCols: [{ label: '材料費（自動）', value: function (p) { var rc = recipeCost(p.code); return rc.lines ? yen(rc.cost) : 'レシピなし'; } }],
        fields: [f('code', '作品コード'), f('item', '作品名'), f('price', '価格（税込）', 'yen'), f('laborMin', '作業時間（分）', 'number'), note()] },
      { key: 'craftRecipes', title: 'レシピ（作品1つに使う材料）', desc: '作品コード・材料ID・数量。材料の単価が変わると、原価も自動で変わります。',
        sort: function (a, b) { return String(a.product).localeCompare(String(b.product)); },
        extraCols: [{ label: '金額', value: function (r) { var mc = matCost(); return mc[r.material] ? yen(Math.round(num(r.qty) * mc[r.material])) : '単価なし'; } }],
        fields: [f('product', '作品コード'), f('material', '材料ID'), f('qty', '数量', 'number'), note()] },
      { key: 'craftMaterials', title: '材料の残量と単価', desc: '残量は累計入庫−累計使用。単価は1単位あたり（例：1枚・1個）。発注・外部ショップへの連携はしません。',
        extraCols: [{ label: '残量（自動）', value: function (r) { return num(r.bought) - num(r.used); } }, { label: '確認', value: function (r) { var n = num(r.bought) - num(r.used); return n < 0 ? '使用超過・入力を確認' : n <= num(r.reorder) ? '補充候補' : '—'; } }],
        fields: [f('code', '材料ID'), f('title', '材料'), f('unit', '単位'), f('unitCost', '単価（円／単位）', 'number'), f('bought', '累計入庫', 'number'), f('used', '累計使用', 'number'), f('reorder', '補充する残量', 'number'), note()] },
      { key: 'craftChannels', title: '販売先と手数料', desc: '販売サイト・委託先・イベントなど。手数料率と1件ごとの固定手数料、こちらが負担する送料。率は規約の最新値を自分で確認して入れてください。',
        fields: [f('name', '販売先'), f('feeRate', '手数料率（%）', 'number'), f('feeFixed', '1件ごとの固定手数料', 'yen'), f('shipping', '負担する送料', 'yen'), note()] }
    ],
    sample: function (H) {
      var prods = [['P01', '布のがま口ポーチ', 2800, 90, [['DEMO-M01', 1], ['DEMO-M02', 1], ['DEMO-M06', 1]]], ['P02', '刺しゅうブローチ', 3500, 150, [['DEMO-M03', 3], ['DEMO-M06', 1]]], ['P03', 'レザーのキーケース', 4800, 120, [['DEMO-M04', 1], ['DEMO-M06', 1]]], ['P04', 'ビーズのピアス', 2200, 45, [['DEMO-M05', 1], ['DEMO-M06', 1]]], ['P05','リネンの巾着袋',1800,60,[['DEMO-M07',1],['DEMO-M08',1],['DEMO-M06',1]]], ['P06','革のしおり',1200,30,[['DEMO-M04',1],['DEMO-M06',1]]], ['P07','花柄コースター2枚組',1600,50,[['DEMO-M01',2],['DEMO-M09',1],['DEMO-M06',1]]], ['P08','木製キーホルダー',2000,60,[['DEMO-M10',1],['DEMO-M06',1]]]];
      var chans = [['販売サイトA（架空）', 10, 0, 185], ['委託販売の店（架空）', 30, 0, 0], ['自分のネットショップ（架空）', 3.6, 40, 230], ['手づくり市（架空）', 0, 0, 0]];
      var sts = ['受付', '制作中', '制作中', '検品', '発送済', '発送済'], orders = [];
      for (var i = 0; i < 36; i++) { var p = H.pick(prods), c = H.pick(chans), s = H.pick(sts), qty = H.pick([1, 1, 1, 2]); orders.push({ date: H.day(-H.int(0, 28)), code: 'DEMO-O' + C.pad(i + 1), product: p[0], item: p[1], qty: qty, channel: c[0], price: p[2] * qty, material: '', fee: Math.round(p[2] * qty * c[1] / 100) + c[2], shipping: c[3], status: s, due: H.day(H.int(-2, 14)), done: s === '発送済', memo: H.pick(['架空例：色の指定を制作前に確認','架空例：検品で縫い目と金具を確認','架空例：発送前に数量を照合','']) }); }
      var recipes = []; prods.forEach(function (p) { p[4].forEach(function (x) { recipes.push({ product: p[0], material: x[0], qty: x[1], memo: '' }); }); });
      return {
        craftOrders: orders,
        craftProducts: prods.map(function (p) { return { code: p[0], item: p[1], price: p[2], laborMin: p[3], memo: '' }; }),
        craftRecipes: recipes,
        craftMaterials: [['DEMO-M01', '帆布（綿）', '枚', 180, 20, 15, 4], ['DEMO-M02', '口金 12cm', '個', 220, 30, 27, 5], ['DEMO-M03', '刺しゅう糸', '束', 90, 40, 22, 10], ['DEMO-M04', '牛革（端切れ）', '枚', 650, 12, 9, 3], ['DEMO-M05', 'ピアス金具', '組', 120, 50, 18, 10], ['DEMO-M06', '梱包袋', '枚', 15, 100, 64, 20], ['DEMO-M07','リネン生地','枚',250,30,18,8], ['DEMO-M08','ひも','本',40,60,35,15], ['DEMO-M09','裏地','枚',80,40,22,10], ['DEMO-M10','木製パーツ','個',240,20,14,6]].map(function (m) { return { code: m[0], title: m[1], unit: m[2], unitCost: m[3], bought: m[4], used: m[5], reorder: m[6], memo: '' }; }),
        craftChannels: chans.map(function (c) { return { name: c[0], feeRate: c[1], feeFixed: c[2], shipping: c[3], memo: '架空の率。実際は規約で確認' }; })
      };
    }
  });
})(this);
