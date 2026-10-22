/*
 * こもれびデスク — 小売店（商品・入出庫・発注・レジ締め・棚卸・粗利）
 * 軽減税率（8%）と標準税率（10%）を分けて集計。サンプルの商品・取引先はすべて架空。
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, yen = C.yen, KD = root.KD;
  function A() { return root.App; }

  var cols = {
    products: {
      title: '商品', desc: '原価・売価は税込。「はじめの在庫」に入出庫を足し引きして、今の在庫を自動計算します。',
      fields: [
        { k: 'code', label: '商品コード' }, { k: 'name', label: '商品名' }, { k: 'category', label: '分類' }, { k: 'taxRate', label: '税率', type: 'select', options: ['8', '10'] },
        { k: 'cost', label: '原価', type: 'yen' }, { k: 'price', label: '売価', type: 'yen' }, { k: 'startStock', label: 'はじめの在庫', type: 'number' },
        { k: 'reorder', label: '発注点', type: 'number' }, { k: 'lot', label: '発注単位', type: 'number' }, { k: 'supplier', label: '仕入先' }
      ]
    },
    moves: {
      title: '入出庫', desc: '入荷・販売・廃棄・調整（棚卸の差など）。販売はレジの集計からまとめて入れてもOK。',
      fields: [{ k: 'date', label: '日付', type: 'date' }, { k: 'code', label: '商品コード' }, { k: 'kind', label: '種類', type: 'select', options: ['入荷', '販売', '廃棄', '調整'] }, { k: 'qty', label: '数量', type: 'number' }, { k: 'memo', label: 'メモ' }]
    },
    register: {
      title: 'レジ締め（日計）', desc: '税率別の売上と、現金の過不足を確認。過不足が続くときは原因をメモ。',
      fields: [
        { k: 'date', label: '日付', type: 'date' }, { k: 'sales10', label: '10%の売上（税込）', type: 'yen' }, { k: 'sales8', label: '8%の売上（税込）', type: 'yen' },
        { k: 'cash', label: 'うち現金', type: 'yen' }, { k: 'float', label: '釣り銭準備金', type: 'yen' }, { k: 'counted', label: '数えた現金', type: 'yen' }, { k: 'guests', label: '客数', type: 'number' }, { k: 'memo', label: 'メモ' }
      ]
    },
    suppliers: {
      title: '仕入先', desc: '会社名と発注の条件。',
      fields: [{ k: 'name', label: '仕入先' }, { k: 'how', label: '発注方法', type: 'select', options: ['電話', 'FAX', 'メール', 'Web発注', '訪問'] }, { k: 'lead', label: '納品までの日数', type: 'number' }, { k: 'regNo', label: '登録番号（インボイス）' }, { k: 'memo', label: 'メモ' }]
    }
  };
  var SIGN = { '入荷': 1, '販売': -1, '廃棄': -1, '調整': 1 };
  function stockMap() {
    var m = Object.create(null);
    St.rows('products').forEach(function (p) { m[p.code] = num(p.startStock); });
    St.rows('moves').forEach(function (r) { if (r.code in m) m[r.code] += (SIGN[r.kind] || 0) * num(r.qty); });
    return m;
  }
  function monthStats(m) {
    var reg = St.rows('register').filter(function (r) { return A().inMonth(r.date, m); });
    var s10 = A().sum(reg, function (r) { return r.sales10; }), s8 = A().sum(reg, function (r) { return r.sales8; }), g = A().sum(reg, function (r) { return r.guests; });
    var diff = A().sum(reg, function (r) { return r.counted === '' ? 0 : num(r.counted) - num(r.float) - num(r.cash); });
    var pm = Object.create(null); St.rows('products').forEach(function (p) { pm[p.code] = p; });
    var gross = 0, soldCost = 0, inCost = 0;
    St.rows('moves').filter(function (r) { return A().inMonth(r.date, m); }).forEach(function (r) {
      var p = pm[r.code]; if (!p) return;
      if (r.kind === '販売') { gross += (num(p.price) - num(p.cost)) * num(r.qty); soldCost += num(p.cost) * num(r.qty); }
      if (r.kind === '入荷') inCost += num(p.cost) * num(r.qty);
    });
    return { s10: s10, s8: s8, total: s10 + s8, guests: g, perGuest: g ? Math.round((s10 + s8) / g) : 0, cashDiff: diff, gross: gross, soldCost: soldCost, inCost: inCost, days: reg.length };
  }
  function inventoryValue() { var st = stockMap(); return A().sum(St.rows('products'), function (p) { return Math.max(0, st[p.code] || 0) * num(p.cost); }); }
  function sample(H) {
    var items = [['F-001', 'おにぎり（例）', '食品', '8', 90, 150], ['F-002', 'パン（例）', '食品', '8', 80, 140], ['F-003', 'お茶 500ml（例）', '飲料', '8', 60, 130], ['F-004', 'コーヒー豆 200g（例）', '食品', '8', 600, 1200], ['F-005', 'クッキー（例）', '菓子', '8', 120, 250],
      ['G-001', 'ノート（例）', '文具', '10', 90, 180], ['G-002', 'ボールペン（例）', '文具', '10', 50, 120], ['G-003', 'エコバッグ（例）', '雑貨', '10', 300, 680], ['G-004', 'マグカップ（例）', '雑貨', '10', 450, 1100], ['G-005', 'ハンドタオル（例）', '雑貨', '10', 200, 480], ['G-006', '乾電池 4本（例）', '日用品', '10', 220, 398], ['G-007', 'ハンドクリーム（例）', '日用品', '10', 300, 650], ['F-006','紅茶パック（例）','飲料','8',180,360], ['F-007','グラノーラ（例）','食品','8',280,560], ['F-008','ジャム（例）','食品','8',220,480], ['G-008','便せん（例）','文具','10',100,240], ['G-009','木製トレー（例）','雑貨','10',400,980], ['G-010','スポンジ（例）','日用品','10',60,150]];
    var sup = ['みなと食品（架空）', 'ひばり文具（架空）', 'こもれび雑貨卸（架空）'];
    var prods = items.map(function (x) { return { code: x[0], name: x[1], category: x[2], taxRate: x[3], cost: x[4], price: x[5], startStock: H.int(10, 40), reorder: H.int(5, 12), lot: H.pick([10, 12, 20]), supplier: x[2] === '食品' || x[2] === '飲料' || x[2] === '菓子' ? sup[0] : x[2] === '文具' ? sup[1] : sup[2] }; });
    var mv = [], reg = [];
    for (var d = -74; d <= -1; d++) {
      var date = H.day(d); if (H.weekday(date) === 3) continue; // 水曜定休（例）
      var s10 = 0, s8 = 0, guests = H.int(18, 45);
      prods.forEach(function (p) {
        if (H.chance(0.5)) { var q = H.int(1, p.category === '食品' || p.category === '飲料' ? 6 : 2); mv.push({ date: date, code: p.code, kind: '販売', qty: q, memo: '' }); if (p.taxRate === '8') s8 += q * p.price; else s10 += q * p.price; }
      });
      if (H.weekday(date) === 1) prods.forEach(function (p) { if (H.chance(0.5)) mv.push({ date: date, code: p.code, kind: '入荷', qty: p.lot, memo: '' }); });
      if (H.chance(0.06)) mv.push({ date: date, code: H.pick(['F-001', 'F-002']), kind: '廃棄', qty: H.int(1, 3), memo: '期限切れ' });
      var cash = Math.round((s10 + s8) * H.pick([0.4, 0.5, 0.6]));
      reg.push({ date: date, sales10: s10, sales8: s8, cash: cash, float: 30000, counted: 30000 + cash + (H.chance(0.12) ? H.pick([-100, -10, 10, 50]) : 0), guests: guests, memo: '' });
    }
    return { products: prods, moves: mv, register: reg, suppliers: sup.map(function (n, i) { return { name: n, how: ['電話', 'Web発注', 'メール'][i], lead: [2, 3, 5][i], regNo: '', memo: '' }; }) };
  }
  function transferRows(m){
    var src='SHOP-'+m,last=m+'-'+C.pad(C.daysInMonth(m)),s=monthStats(m),rows=[],map=Object.create(null),cost={'8':0,'10':0};
    St.rows('products').forEach(function(p){if(!p.code||map[p.code])throw new Error('商品コードの空欄・重複を修正してください');map[p.code]=p;});
    St.rows('moves').filter(function(r){return A().inMonth(r.date,m);}).forEach(function(r){var p=map[r.code];if(!p)throw new Error('入出庫に未登録の商品コードがあります');if(r.kind==='入荷'){if(!['8','10'].includes(p.taxRate))throw new Error('商品の税率を確認してください');if(num(r.qty)<0||num(p.cost)<0)throw new Error('入荷数と原価は0以上で記録してください');cost[p.taxRate]+=num(r.qty)*num(p.cost);}});
    function add(kind,rate,amount,evidence){if(amount)rows.push({date:last,kind:kind,account:kind,partner:kind==='仕入'?'各仕入先':'一般のお客様',item:A().ymLabel(m)+' '+kind+'（'+rate+'%）',amount:amount,taxRate:rate,ratio:100,withheld:0,pay:kind==='仕入'?'未払':'その他',evidence:evidence,source:src});}
    add('売上','10',s.s10,'レジ締め');add('売上','8',s.s8,'レジ締め');add('仕入','10',cost['10'],'納品書');add('仕入','8',cost['8'],'納品書');return rows;
  }
  function toLedger(m){
    var src='SHOP-'+m;if(St.rows('ledger').some(function(r){return r.source===src;})){U.toast('この月は転記済みです。帳簿で内容を確認してください');return;}
    var rows;try{rows=transferRows(m);}catch(e){U.toast(e.message);return;}if(!rows.length){U.toast('転記する金額がありません');return;}
    var before=JSON.stringify({products:St.rows('products'),moves:St.rows('moves'),register:St.rows('register'),ledger:St.rows('ledger')});
    U.ask('税率別に帳簿へ転記しますか',h('div',null,U.miniTable(['区分','税率','金額'],rows.map(function(r){return [r.kind,r.taxRate+'%',yen(r.amount)];})),h('p',null,'仕入は現在の商品原価×入荷数の概算です。原価変更前の仕入額は再現しません。納品書と照合してください。売上の決済内訳は別途帳簿で確認してください。')),[{label:'中止',value:false,tone:'ghost'},{label:'確認して転記',value:true}]).then(function(ok){if(!ok)return;if(before!==JSON.stringify({products:St.rows('products'),moves:St.rows('moves'),register:St.rows('register'),ledger:St.rows('ledger')})||St.saveFailed()||St.conflict()){U.toast('記録または保存状態が変わったため中止しました');return;}try{St.addRows('ledger',rows);St.flush().then(function(){U.toast('税率別に帳簿へ転記して保存しました');}).catch(function(){U.toast('保存に失敗しました。画面の記録をバックアップし、再転記せず保存状態を確認してください');});}catch(e){U.toast(e.message);}});
  }
  KD.shop={transferRows:transferRows,stockMap:stockMap};
  function orderList() {
    var st = stockMap();
    return St.rows('products').filter(function (p) { return p.code && (st[p.code] || 0) <= num(p.reorder); }).map(function (p) { return { p: p, now: st[p.code] || 0 }; });
  }
  // ---- 売れ筋（ABC分析）・曜日別・廃棄（R31） ----
  function analysis(m) {
    var pm = Object.create(null), sales = {}, waste = {}, wd = [0, 0, 0, 0, 0, 0, 0], wdDays = [0, 0, 0, 0, 0, 0, 0];
    St.rows('products').forEach(function (p) { pm[p.code] = p; });
    St.rows('moves').filter(function (r) { return A().inMonth(r.date, m); }).forEach(function (r) {
      var p = pm[r.code]; if (!p) return;
      if (r.kind === '販売') sales[r.code] = (sales[r.code] || 0) + num(r.qty) * num(p.price);
      if (r.kind === '廃棄') waste[r.code] = (waste[r.code] || 0) + num(r.qty);
    });
    St.rows('register').filter(function (r) { return A().inMonth(r.date, m); }).forEach(function (r) { var w = new Date(r.date + 'T00:00:00').getDay(); wd[w] += num(r.sales10) + num(r.sales8); wdDays[w]++; });
    var total = Object.keys(sales).reduce(function (a, k) { return a + sales[k]; }, 0), acc = 0;
    var abc = Object.keys(sales).sort(function (a, b) { return sales[b] - sales[a]; }).map(function (k) { acc += sales[k]; var share = total ? acc / total : 0; return { code: k, name: pm[k].name, sales: sales[k], pct: total ? Math.round(sales[k] / total * 1000) / 10 : 0, rank: share <= 0.7 ? 'A' : share <= 0.9 ? 'B' : 'C' }; });
    return { abc: abc, total: total, wd: wd, wdDays: wdDays, waste: Object.keys(waste).map(function (k) { var sold = 0; St.rows('moves').forEach(function (r) { if (r.code === k && r.kind === '販売' && A().inMonth(r.date, m)) sold += num(r.qty); }); return { code: k, name: pm[k].name, qty: waste[k], rate: sold + waste[k] ? Math.round(waste[k] / (sold + waste[k]) * 1000) / 10 : 0, cost: waste[k] * num(pm[k].cost) }; }).sort(function (a, b) { return b.cost - a.cost; }) };
  }
  // 仕入先ごとの発注書を印刷（送信はしない。FAX・メールは自分で）
  function printOrders() {
    var l = orderList(), by = {}; l.forEach(function (x) { var s = x.p.supplier || '仕入先未設定'; (by[s] = by[s] || []).push(x); });
    var keys = Object.keys(by); if (!keys.length) { U.toast('発注が必要な商品はありません'); return; }
    var shopName = St.modSettings('shop').shopName || '';
    U.printDoc(h('div', { class: 'shift-print' }, keys.map(function (s) {
      var sup = St.rows('suppliers').filter(function (x) { return x.name === s; })[0] || {};
      return h('section', { class: 'person-slip invoice' }, h('h1', null, '発注書'), h('p', null, s + '　御中'), h('p', null, '発注日：' + C.today() + (sup.lead ? '　納品までの目安：' + sup.lead + '日' : '') + (shopName ? '　発注元：' + shopName : '')),
        h('table', null, h('thead', null, h('tr', null, ['商品コード', '商品名', '数量', '単価（税込）', '金額'].map(function (x) { return h('th', null, x); }))),
          h('tbody', null, by[s].map(function (x) { var q = num(x.p.lot) || Math.max(1, num(x.p.reorder) * 2 - x.now); return h('tr', null, h('td', null, x.p.code), h('td', null, x.p.name), h('td', null, String(q)), h('td', null, yen(x.p.cost)), h('td', null, yen(q * num(x.p.cost)))); }))),
        h('p', { class: 'small' }, '数量・単価は発注前に確認してください。このツールから送信はしません（FAX・メール・Web発注は各自で）。'));
    })));
  }
  function view() {
    var m = A().ui.month, v = h('div'), live = A().live, t = C.today();
    v.appendChild(A().viewHead('お店', '商品・在庫・発注・レジ締め・棚卸・粗利。', A().monthPicker()));
    v.appendChild(A().grid(
      U.card(A().ymLabel(m) + 'の売上', { wide: true, cls: 'accent', action: KD.has('tax') ? h('button', { type: 'button', class: 'btn small ghost', on: { click: function () { toLedger(m); } } }, '帳簿へ転記') : null }, live(function () {
        var s = monthStats(m);
        return h('div', { class: 'stats' }, U.stat('売上（税込）', yen(s.total), s.days + '日'), U.stat('10%の売上', yen(s.s10)), U.stat('8%の売上（軽減）', yen(s.s8)), U.stat('客数・客単価', s.guests + '人', '客単価 ' + yen(s.perGuest)),
          U.stat('粗利の目安', yen(s.gross), '販売数×(売価−原価)'), U.stat('現金の過不足', yen(s.cashDiff), '', s.cashDiff !== 0 ? 'warn' : 'good'));
      })),
      U.card('発注リスト', { desc: '今の在庫が発注点以下の商品。', action: h('button', { type: 'button', class: 'btn small ghost', on: { click: printOrders } }, '仕入先ごとの発注書を印刷') }, live(function () {
        var l = orderList();
        return l.length ? U.miniTable(['商品', '在庫', '発注点', '発注数', '仕入先'], l.map(function (x) { return [x.p.name, x.now, x.p.reorder, x.p.lot || '', x.p.supplier]; }), [1, 2, 3]) : U.empty('発注が必要な商品はありません。');
      })),
      U.card('棚卸（在庫の金額）', { desc: '年末の在庫金額は、確定申告の「期末商品棚卸高」になります。' }, live(function () {
        var val = inventoryValue();
        return h('div', null, h('p', { class: 'big-num' }, yen(val)), h('p', { class: 'small muted' }, '今の在庫×原価の合計'),
          KD.has('tax') ? h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn small', on: { click: function () { St.setSetting('mod.tax.inventoryEnd', val); U.toast('確定申告の「期末の在庫」に ' + yen(val) + ' を入れました'); } } }, '期末棚卸として申告に反映')) : null,
          h('p', { class: 'small muted' }, '実際に数えた数と違うときは、入出庫に「調整」を入れて合わせます。'));
      }))));
    v.appendChild(A().grid(
      U.card('売れ筋（ABC分析・' + A().ymLabel(m) + '）', { wide: true, desc: '売上の多い順。上位で累計70%までがA（主力）、90%までがB、残りがC。Cでも、来店のきっかけになる商品は残す判断もあります。' }, live(function () {
        var a = analysis(m);
        return a.abc.length ? U.miniTable(['順位', '商品', '売上', '構成比', 'ランク'], a.abc.slice(0, 20).map(function (x, i) { return [i + 1, x.name, yen(x.sales), x.pct + '%', U.badge(x.rank, x.rank === 'A' ? 'good' : x.rank === 'C' ? 'warn' : '')]; }), [0, 2, 3]) : U.empty('表示月の販売の記録がありません。');
      })),
      U.card('曜日別の売上（1日あたり）', null, live(function () {
        var a = analysis(m), order = [1, 2, 3, 4, 5, 6, 0];
        return U.bars(order.map(function (w) { return { label: '日月火水木金土'[w] + '曜（' + a.wdDays[w] + '日）', value: a.wdDays[w] ? Math.round(a.wd[w] / a.wdDays[w]) : 0 }; }), yen);
      })),
      U.card('廃棄（ロス）', { desc: '廃棄数÷（販売数＋廃棄数）。原価ベースの損失額の多い順。' }, live(function () {
        var a = analysis(m);
        return a.waste.length ? U.miniTable(['商品', '廃棄数', '廃棄率', '損失（原価）'], a.waste.map(function (x) { return [x.name, x.qty, x.rate + '%', yen(x.cost)]; }), [1, 2, 3]) : U.empty('表示月の廃棄はありません。');
      })),
      U.card('お店の設定', null, A().form([A().field('発注書に出す店名', A().set('mod.shop.shopName', 'text'))]))));
    v.appendChild(U.table('register', { filter: function (r) { return !r.date || A().inMonth(r.date, m); }, sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: t, float: 30000 }; },
      extraCols: [{ label: '過不足', value: function (r) { if (r.counted === '') return '—'; var d = num(r.counted) - num(r.float) - num(r.cash); return d === 0 ? '0' : h('span', { class: 'badge warn' }, (d > 0 ? '+' : '') + d); } }] }));
    v.appendChild(U.table('products', { sort: function (a, b) { return String(a.code).localeCompare(String(b.code)); }, newRow: function () { return { taxRate: '10', startStock: 0 }; },
      extraCols: [{ label: '今の在庫', value: function (p) { var n = stockMap()[p.code] || 0; return n <= num(p.reorder) ? h('span', { class: 'badge warn' }, n) : String(n); } }, { label: '粗利率', value: function (p) { return num(p.price) ? Math.round((num(p.price) - num(p.cost)) / num(p.price) * 100) + '%' : '—'; } }] }));
    v.appendChild(U.table('moves', { filter: function (r) { return !r.date || A().inMonth(r.date, m); }, sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, limit: 60, newRow: function () { return { date: t, kind: '入荷' }; } }));
    v.appendChild(U.table('suppliers'));
    return v;
  }
  function home() {
    var m = A().ui.month;
    return [A().homeCard('お店：今月と発注', { action: A().navBtn('shop', 'お店を開く'), easy: true }, A().live(function () {
      var s = monthStats(m), l = orderList();
      return h('div', null, h('div', { class: 'stats' }, U.stat('今月の売上', yen(s.total)), U.stat('粗利の目安', yen(s.gross)), U.stat('発注が必要', l.length + '品', '', l.length ? 'warn' : '')));
    }))];
  }
  KD.mod({ id: 'shop', title: 'お店', icon: '店', order: 16, collections: cols, sample: sample, view: view, home: home, defaults: { shopName: '' } });
})(this);
