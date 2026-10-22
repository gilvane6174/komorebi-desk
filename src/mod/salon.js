/*
 * こもれびデスク — 美容師・サロン（予約・お客様カルテ・メニュー・店販・材料在庫・回数券）
 * オーナーでも、業務委託（面貸し）の美容師でも使える。お客様は呼び名とIDで管理する。サンプルはすべて架空。
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, yen = C.yen, KD = root.KD;
  function A() { return root.App; }

  var cols = {
    salonHygiene:{title:'衛生点検・対応メモ',desc:'日々の設備・器具・清掃の確認を残す補助表です。法定要件の充足・消毒方法の適否を保証しません。事業所の手順と管轄保健所の案内を確認してください。',fields:[{k:'date',label:'日付',type:'date'},{k:'owner',label:'確認者ID'},{k:'area',label:'点検対象'},{k:'result',label:'結果',type:'select',options:['未確認','良好','要対応']},{k:'action',label:'対応内容',type:'textarea'},{k:'due',label:'対応期限',type:'date'},{k:'done',label:'対応完了',type:'check'}]},
    reservations: {
      title: '予約・来店', desc: '来店したら状態を「来店」に。売上・客数・再来店の計算に使います。金額は税込。',
      fields: [
        { k: 'date', label: '日付', type: 'date' }, { k: 'time', label: '時刻', type: 'time' }, { k: 'cid', label: 'お客様ID' }, { k: 'menu', label: 'メニュー' },
        { k: 'staff', label: '担当' }, { k: 'nominated', label: '指名', type: 'check' }, { k: 'minutes', label: '所要(分)', type: 'number' }, { k: 'price', label: '料金（税込）', type: 'yen' },
        { k: 'status', label: '状態', type: 'select', options: ['予約', '来店', 'キャンセル', '無断キャンセル'] }, { k: 'pay', label: '支払', type: 'select', options: ['', '現金', 'カード', 'QR決済', '電子マネー', '回数券'] }, { k: 'memo', label: 'メモ' }
      ]
    },
    customers: {
      title: 'お客様カルテ', sensitive: true, desc: '本名・電話番号・住所は入れず、呼び名とIDで。アレルギーなど健康に関わることは要配慮情報です（本人の同意を得て、必要なことだけ）。お客様の顔・髪型などの写真も、本人の同意を得てから登録してください。',
      fields: [
        { k: 'cid', label: 'お客様ID' }, { k: 'name', label: '呼び名' }, { k: 'first', label: '初回来店', type: 'date' }, { k: 'hair', label: '髪の状態・好み', type: 'textarea' },
        { k: 'chem', label: '薬剤の履歴', type: 'textarea' }, { k: 'patch', label: 'パッチテスト日', type: 'date' }, { k: 'caution', label: '気をつけること', type: 'textarea' },
        { k: 'next', label: '次回のおすすめ' }, { k: 'hairImage', label: '髪型の写真・手描きイラスト画像', type: 'image' }, { k: 'photo', label: '写真の保管場所（端末のアルバム名など）' }, { k: 'dm', label: 'お知らせOK', type: 'check' }
      ]
    },
    menus: {
      title: 'メニュー表', desc: '予約のメニュー名と同じにすると、メニュー別の集計ができます。',
      fields: [{ k: 'name', label: 'メニュー' }, { k: 'category', label: '分類', type: 'select', options: ['カット', 'カラー', 'パーマ', 'トリートメント', 'ヘッドスパ', 'セット', 'その他'] }, { k: 'minutes', label: '所要(分)', type: 'number' }, { k: 'price', label: '料金（税込）', type: 'yen' }]
    },
    retail: {
      title: '店販（物販）', desc: 'シャンプーなどの販売。',
      fields: [{ k: 'date', label: '日付', type: 'date' }, { k: 'item', label: '商品' }, { k: 'qty', label: '数量', type: 'number' }, { k: 'price', label: '単価（税込）', type: 'yen' }, { k: 'pay', label: '支払', type: 'select', options: ['現金', 'カード', 'QR決済', '電子マネー'] }]
    },
    stock: {
      title: '材料・在庫', desc: '残りが発注点以下になると、ホームでお知らせします。',
      fields: [{ k: 'name', label: '品名' }, { k: 'qty', label: '残り', type: 'number' }, { k: 'reorder', label: '発注点', type: 'number' }, { k: 'unit', label: '単位' }, { k: 'supplier', label: '仕入先' }]
    },
    tickets: {
      title: '回数券・前受金', desc: '先にいただいたお金（前受金）の残りを管理。',
      fields: [{ k: 'cid', label: 'お客様ID' }, { k: 'kind', label: '内容' }, { k: 'bought', label: '購入日', type: 'date' }, { k: 'total', label: '回数', type: 'number' }, { k: 'used', label: '使用済', type: 'number' }, { k: 'amount', label: '金額', type: 'yen' }, { k: 'expires', label: '有効期限', type: 'date' }]
    }
  };
  function ss() { return St.modSettings('salon'); }
  function lastVisits() { var m = Object.create(null); St.rows('reservations').forEach(function (r) { if (r.status === '来店' && r.cid && (!m[r.cid] || r.date > m[r.cid])) m[r.cid] = r.date; }); return m; }
  // ---- お客様ごとの来店周期（来店の間隔の平均。2回以上の来店があるときだけ） ----
  function visitHistory() { var o = Object.create(null); St.rows('reservations').forEach(function (r) { if (r.status === '来店' && r.cid && r.date) (o[r.cid] = o[r.cid] || []).push(r.date); }); Object.keys(o).forEach(function (k) { o[k].sort(); }); return o; }
  function cycleOf(list) { if (!list || list.length < 2) return 0; var s = 0, n = 0; for (var i = Math.max(1, list.length - 6); i < list.length; i++) { s += (Date.parse(list[i]) - Date.parse(list[i - 1])) / 86400000; n++; } return n ? Math.round(s / n) : 0; }
  function dueCustomers() {
    var vh = visitHistory(), base = num(ss().revisitDays) || 60, out = [];
    St.rows('customers').forEach(function (c) { var l = vh[c.cid]; if (!c.dm || !l || !l.length) return; var cyc = Math.max(14, cycleOf(l) || base), last = l[l.length - 1], since = -C.daysUntil(last);
      var booked = St.rows('reservations').some(function (r) { return r.cid === c.cid && r.status === '予約' && r.date >= C.today(); });
      if (!booked && since >= Math.round(cyc * 1.1)) out.push({ c: c, last: last, since: since, cycle: cyc, auto: !!cycleOf(l) }); });
    return out.sort(function (a, b) { return b.since / b.cycle - a.since / a.cycle; });
  }
  function message(x) {
    var tpl = ss().msgTemplate || '{名前}さん、こんにちは。{店名}です。前回のご来店から{日数}日ほどたちました。{おすすめ}ご都合のよい日があれば、お気軽にご予約ください。';
    return tpl.replace(/\{名前\}/g, x.c.name || '').replace(/\{店名\}/g, ss().salonName || 'サロン').replace(/\{日数\}/g, x.since).replace(/\{おすすめ\}/g, x.c.next ? x.c.next + 'の時期です。' : '');
  }
  function showText(t) { var ta = h('textarea', { rows: 6, 'aria-label': 'お知らせ文' }); ta.value = t; U.ask('お知らせ文', h('div', null, h('p', null, '下の文を選んでコピーしてください。自分のLINEやメールに貼って送ります（このツールからは送りません）。'), ta), [{ label: '閉じる', value: true }], { focus: ta }); }
  function copyText(t) {
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) return root.navigator.clipboard.writeText(t).then(function () { U.toast('お知らせ文をコピーしました。LINEなどに自分で貼って送ってください'); }, function () { showText(t); });
    showText(t); return Promise.resolve();
  }
  function nextBooking(r) {
    var vh = visitHistory(), cyc = cycleOf(vh[r.cid]) || num(ss().revisitDays) || 60;
    var row = St.addRow('reservations', { date: C.addDays(r.date || C.today(), cyc), time: r.time, cid: r.cid, menu: r.menu, staff: r.staff, nominated: r.nominated, minutes: r.minutes, price: r.price, status: '予約' });
    U.toast('次回予約の行を作りました（' + cyc + '日後）。日時を確認してください');
    U.openForm('reservations', row, { isNew: true });
  }
  function staffSales(m) {
    var by = {}; St.rows('reservations').forEach(function (r) { if (!A().inMonth(r.date, m) || r.status !== '来店') return; var k = r.staff || '担当なし', o = by[k] = by[k] || { sales: 0, guests: 0, nom: 0 }; o.sales += r.pay === '回数券' ? 0 : num(r.price); o.guests++; if (r.nominated) o.nom++; });
    return by;
  }
  var resActions = [{ label: '来店にする', onClick: function (r) { St.setRow('reservations', r._id, { status: '来店' }); U.toast('来店にしました', { label: '元に戻す', fn: function () { St.undo(); } }); } }, { label: '次回予約へ', onClick: function (r) { nextBooking(r); } }];
  function calItems(from, to) {
    var cs = {}; St.rows('customers').forEach(function (c) { cs[c.cid] = c; });
    return St.rows('reservations').filter(function (r) { return r.date >= from && r.date <= to && r.status !== 'キャンセル' && r.status !== '無断キャンセル'; }).map(function (r) {
      var a = root.Cal.mins(r.time), c = cs[r.cid] || {};
      return { date: r.date, start: r.time, end: a === null ? '' : root.Cal.hm(a + (num(r.minutes) || 60)), lane: r.staff || '', title: (c.name || r.cid || '予約') + '・' + (r.menu || ''), sub: (r.minutes || '') + '分' + (c.caution ? '・注意あり' : ''), cls: r.status === '来店' ? 'done' : '', open: function () { U.openForm('reservations', r, { rowActions: resActions }); } };
    });
  }
  function monthSales(m) {
    var res = St.rows('reservations').filter(function (r) { return A().inMonth(r.date, m); }), visit = res.filter(function (r) { return r.status === '来店'; });
    var tech = A().sum(visit, function (r) { return r.pay === '回数券' ? 0 : r.price; }), retail = A().sum(St.rows('retail').filter(function (r) { return A().inMonth(r.date, m); }), function (r) { return num(r.qty) * num(r.price); });
    var firsts = {}; St.rows('customers').forEach(function (c) { if (A().inMonth(c.first, m)) firsts[c.cid] = 1; });
    var cancel = res.filter(function (r) { return r.status === 'キャンセル' || r.status === '無断キャンセル'; }).length, byMenu = {};
    visit.forEach(function (r) { byMenu[r.menu || '未設定'] = (byMenu[r.menu || '未設定'] || 0) + num(r.price); });
    var guests = visit.length, newG = visit.filter(function (r) { return firsts[r.cid]; }).length;
    return { tech: tech, retail: retail, guests: guests, newG: newG, perGuest: guests ? Math.round((tech + retail) / guests) : 0, cancelRate: res.length ? Math.round(cancel / res.length * 100) : 0, byMenu: byMenu,
      mine: ss().mode === 'commission' ? Math.floor((tech + retail) * num(ss().rate) / 100) : tech + retail };
  }
  function sample(H) {
    var menus = [['カット', 'カット', 60, 4400], ['カット＋カラー', 'カラー', 120, 9900], ['リタッチカラー', 'カラー', 90, 6600], ['パーマ', 'パーマ', 120, 9900], ['縮毛矯正', 'パーマ', 180, 16500], ['トリートメント', 'トリートメント', 30, 3300], ['ヘッドスパ', 'ヘッドスパ', 40, 4400], ['前髪カット', 'カット', 15, 1100]];
    var names = Array.from({length:36},function(_,i){return 'サンプル客'+C.pad(i+1);});
    var cust = names.map(function (n, i) { return { cid: H.id('C-', i + 1), name: n + 'さん', first: H.day(-H.int(5, 700)), hair: H.pick(['くせ毛・広がりやすい', '細くやわらかい', '多くて硬め', '乾燥しやすい']) + '／' + H.pick(['短めが好き', '前髪は長め', '結べる長さ']),
      chem: H.pick(['', 'カラー 7トーン', 'ブリーチ1回', '縮毛矯正（半年前）']), patch: H.chance(0.3) ? H.day(-H.int(1, 300)) : '', caution: H.pick(['', '', '頭皮が敏感（本人より）', '首を後ろに倒すのがつらい']), next: H.pick(['', 'トリートメントを提案', '2か月後にリタッチ']), dm: H.chance(0.7) }; });
    var res = [], staffs = ['店長', 'スタッフA'];
    // 定休日の例。サンプルを開いた日が定休日にならないようにずらす（今日の予約が必ず見える）
    var closed = H.weekday(H.today) === 2 ? 1 : 2, regular = cust.slice(0, 32);
    cust.slice(32).forEach(function (c, i) { var mn = H.pick(menus); res.push({ date: H.day(-H.int(70, 120)), time: H.hm(11 + i, 0), cid: c.cid, menu: mn[0], staff: H.pick(staffs), minutes: mn[2], price: mn[3], status: '来店', pay: 'カード', memo: '' }); });
    for (var d = -89; d <= 21; d++) {
      var date = H.day(d); if (H.weekday(date) === closed) continue;
      var n = H.int(3, 7), tt = 10;
      for (var k = 0; k < n && tt < 19; k++) {
        var mn = H.pick(menus), c = H.pick(regular), st = d < 0 ? (H.chance(0.92) ? '来店' : H.pick(['キャンセル', '無断キャンセル'])) : d === 0 ? (tt < 13 ? '来店' : '予約') : '予約';
        res.push({ date: date, time: H.hm(tt, H.pick([0, 30])), cid: c.cid, menu: mn[0], staff: H.pick(staffs), nominated: H.chance(0.45), minutes: mn[2], price: mn[3], status: st, pay: st === '来店' ? H.pick(['現金', 'カード', 'QR決済', 'QR決済', '電子マネー']) : '', memo: H.pick(['架空例：長さは前回より2cm短く','架空例：仕上げを一緒に確認','架空例：次回は色味を相談','']) });
        tt += Math.ceil(mn[2] / 60) + (H.chance(0.3) ? 1 : 0);
      }
    }
    var rt = []; for (var j = 0; j < 50; j++) rt.push({ date: H.day(-H.int(0, 60)), item: H.pick(['シャンプー（例）', 'トリートメント（例）', 'ヘアオイル（例）', 'ワックス（例）']), qty: H.int(1, 2), price: H.pick([2420, 2860, 3300, 1980]), pay: H.pick(['現金', 'カード', 'QR決済']) });
    return { salonHygiene:[{date:H.today,owner:'DEMO-S01',area:'器具・清掃（架空）',result:'良好',action:'架空サンプル：点検内容の記入例',due:'',done:true},{date:H.today,owner:'DEMO-S02',area:'備品の補充（架空）',result:'要対応',action:'架空サンプル：担当への確認例',due:H.day(1),done:false}],menus: menus.map(function (m) { return { name: m[0], category: m[1], minutes: m[2], price: m[3] }; }), customers: cust, reservations: res, retail: rt,
      stock: [['カラー剤 7トーン（例）', 4, 5, '本', '美容ディーラー（架空）'], ['カラー剤 9トーン（例）', 9, 5, '本', '美容ディーラー（架空）'], ['パーマ液（例）', 3, 3, '本', '美容ディーラー（架空）'], ['シャンプー業務用（例）', 2, 2, '本', '美容ディーラー（架空）'], ['ケープ（例）', 30, 20, '枚', '美容ディーラー（架空）'], ['タオル（例）', 40, 30, '枚', 'リネン業者（架空）']].map(function (s) { return { name: s[0], qty: s[1], reorder: s[2], unit: s[3], supplier: s[4] }; }),
      tickets: [{ cid: 'C-003', kind: 'ヘッドスパ5回券（例）', bought: H.day(-40), total: 5, used: 2, amount: 19800, expires: H.day(140) }, { cid: 'C-011', kind: 'トリートメント3回券（例）', bought: H.day(-90), total: 3, used: 3, amount: 8800, expires: H.day(90) }] };
  }
  function toLedger(m) {
    var src = 'SALON-' + m;
    if (St.rows('ledger').some(function (r) { return r.source === src; })) { U.toast(A().ymLabel(m) + 'の売上は転記済みです'); return; }
    var s = monthSales(m), last = m + '-' + C.pad(C.daysInMonth(m));
    if (ss().mode === 'commission') KD.toLedger({ date: last, kind: '売上', account: '売上', partner: ss().salonName || 'サロン（業務委託先）', item: A().ymLabel(m) + ' 業務委託報酬（売上×' + ss().rate + '%）', amount: s.mine, taxRate: '10', ratio: 100, withheld: 0, pay: '銀行振込', evidence: '報酬明細', source: src });
    else { KD.toLedger({ date: last, kind: '売上', account: '売上', partner: '一般のお客様', item: A().ymLabel(m) + ' 技術売上（' + s.guests + '名）', amount: s.tech, taxRate: '10', ratio: 100, withheld: 0, pay: '現金', evidence: '予約・レジ記録', source: src });
      if (s.retail) KD.toLedger({ date: last, kind: '売上', account: '売上', partner: '一般のお客様', item: A().ymLabel(m) + ' 店販', amount: s.retail, taxRate: '10', ratio: 100, withheld: 0, pay: '現金', evidence: '予約・レジ記録', source: src }); }
    U.toast(A().ymLabel(m) + 'の売上を帳簿へ転記しました');
  }
  var SALON_TPL='お客様カルテ・ヘアスタイル記録\nお客様ID：{cid}\n呼び名：{name}\n初回来店：{first}\n髪の状態・希望：{hair}\n薬剤履歴：{chem}\n注意事項：{caution}\n次回のご提案：{next}';
  function salonPrintCard(){
    return U.card('お客様カルテ・髪型の個別印刷',{wide:true,desc:'カルテ内の写真・手描きイラストを選択して保存できます。帳票は編集でき、一件ずつ印刷します。'},
       root.KDReports.editor('salon','cardTemplate','カルテ印刷テンプレート',SALON_TPL),
       h('div',{class:'btn-row'},St.rows('customers').map(function(r){return h('button',{type:'button',class:'btn small ghost',on:{click:function(){root.KDReports.report('お客様カルテ',root.KDReports.format(St.modSettings('salon').cardTemplate||SALON_TPL,r),r.hairImage);}}},(r.name||r.cid||'未入力')+' 印刷');})));
  }
  function view() {
    var m = A().ui.month, v = h('div'), live = A().live, t = C.today();
    v.appendChild(A().viewHead('サロン', '予約・カルテ・メニュー・店販・在庫・回数券。オーナーでも業務委託の美容師でも。', A().monthPicker()));
    var staffs = Array.from(new Set(St.rows('reservations').filter(function (r) { return r.staff && C.daysUntil(r.date) >= -30; }).map(function (r) { return r.staff; }))).sort();
    v.appendChild(U.card('予約表', { wide: true, cls: 'cal-card', desc: '担当ごとの列で1日の予約を見ます。空いている時間を押すと、その時間で予約を追加できます。' }, root.Cal.view({ id: 'salon', lanes: staffs, from: 9, to: 21, step: 15, items: calItems,
      onAdd: function (d, time, lane) { var mn = St.rows('menus')[0] || {}; var r = St.addRow('reservations', { date: d, time: time || '10:00', staff: lane, menu: mn.name, minutes: mn.minutes, price: mn.price, status: '予約' }); U.openForm('reservations', r, { rowActions: resActions, isNew: true }); } })));
    v.appendChild(A().grid(
      U.card('きょうの予約', { cls: 'accent' }, live(function () {
        var l = St.rows('reservations').filter(function (r) { return r.date === t && r.status !== 'キャンセル'; }).sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); }), cs = {};
        St.rows('customers').forEach(function (c) { cs[c.cid] = c; });
        return l.length ? h('ul', { class: 'list' }, l.map(function (r) { var c = cs[r.cid] || {}; return h('li', null, h('strong', null, r.time), ' ', (c.name || r.cid) + '：' + r.menu + '（' + r.minutes + '分）', c.caution ? U.badge('注意あり', 'warn') : null, r.status === '来店' ? U.badge('来店') : null); })) : U.empty('きょうの予約はありません。');
      })),
      U.card(A().ymLabel(m) + 'の売上', { wide: true, action: KD.has('tax') ? h('button', { type: 'button', class: 'btn small ghost', on: { click: function () { toLedger(m); } } }, '帳簿へ転記') : null }, live(function () {
        var s = monthSales(m);
        return h('div', null, h('div', { class: 'stats' }, U.stat('技術売上', yen(s.tech)), U.stat('店販', yen(s.retail)), U.stat('客数', s.guests + '名', '新規 ' + s.newG + '名'), U.stat('客単価', yen(s.perGuest)), U.stat('キャンセル率', s.cancelRate + '%'),
          ss().mode === 'commission' ? U.stat('自分の取り分', yen(s.mine), '歩合 ' + ss().rate + '%', 'good') : null),
          U.bars(Object.keys(s.byMenu).map(function (k) { return { label: k, value: s.byMenu[k] }; }).sort(function (a, b) { return b.value - a.value; }), yen));
      })),
      U.card('働き方', null, A().form([A().field('働き方', A().set('mod.salon.mode', 'select', { render: true, options: [['owner', 'オーナー・個人サロン'], ['commission', '業務委託（面貸し・歩合）']] })),
        A().field('歩合（自分の取り分 %）', A().set('mod.salon.rate', 'number', { min: 0 })), A().field('業務委託先のサロン名', A().set('mod.salon.salonName', 'text')), A().field('再来店のお知らせ（日）', A().set('mod.salon.revisitDays', 'number', { min: 14 }), '来店が1回だけの方に使う目安'), A().field('お知らせ文のひな形', A().set('mod.salon.msgTemplate', 'textarea'), '{名前}{店名}{日数}{おすすめ} が置き換わります')])),
      U.card('そろそろ再来店のお客様', { desc: 'お客様ごとの来店の間隔から自動で判定（来店が1回だけの方は設定の日数で）。お知らせ文はコピーして自分で送ります。自動送信はしません。' }, live(function () {
        var list = dueCustomers();
        return list.length ? h('ul', { class: 'list' }, list.slice(0, 8).map(function (x) { return h('li', null, h('strong', null, x.c.name || x.c.cid), '：前回 ' + x.last + '（' + x.since + '日前・周期 約' + x.cycle + '日' + (x.auto ? '' : '・設定値') + '）', x.c.next ? '・' + x.c.next : '', ' ',
          h('button', { type: 'button', class: 'btn tiny ghost', on: { click: function () { copyText(message(x)); } } }, 'お知らせ文をコピー')); })) : U.empty('いま、お知らせの時期のお客様はいません。');
      })),
      U.card('スタッフ別（' + A().ymLabel(m) + '）', null, live(function () {
        var by = staffSales(m), keys = Object.keys(by).sort(function (a, b) { return by[b].sales - by[a].sales; });
        return keys.length ? U.miniTable(['担当', '技術売上', '客数', '指名'], keys.map(function (k) { return [k, yen(by[k].sales), by[k].guests + '名', by[k].nom + '名']; }), [1, 2, 3]) : U.empty('表示月の来店がありません。');
      })),
      U.card('発注が必要な材料', null, live(function () {
        var l = St.rows('stock').filter(function (s) { return s.name && num(s.qty) <= num(s.reorder); });
        return l.length ? h('ul', { class: 'list' }, l.map(function (s) { return h('li', null, s.name + '：残り' + s.qty + (s.unit || '') + '（発注点 ' + s.reorder + '）'); })) : U.empty('いまは足りています。');
      }))));
    v.appendChild(U.table('reservations', { filter: function (r) { return !r.date || A().inMonth(r.date, m); }, sort: function (a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)); }, limit: 60,
      rowActions: resActions, newRow: function () { var mn = St.rows('menus')[0] || {}; return { date: t, time: '10:00', menu: mn.name, minutes: mn.minutes, price: mn.price, status: '予約' }; } }));
    v.appendChild(U.table('salonHygiene',{newRow:function(){return {date:C.today(),result:'未確認'};}}));
    v.appendChild(salonPrintCard());
    v.appendChild(U.table('customers', { sort: function (a, b) { return String(a.cid).localeCompare(String(b.cid)); }, newRow: function () { return { cid: 'C-' + ('00' + (St.rows('customers').length + 1)).slice(-3), first: t, dm: false }; },
      extraCols: [{ label: '前回の来店', value: function (c) { return lastVisits()[c.cid] || '—'; } }, { label: 'パッチテスト', value: function (c) { var d = C.daysUntil(c.patch); return c.patch ? (d < -180 ? h('span', { class: 'badge warn' }, '半年以上前') : '済') : '—'; } }] }));
    v.appendChild(U.table('menus'));
    v.appendChild(U.table('retail', { filter: function (r) { return !r.date || A().inMonth(r.date, m); }, newRow: function () { return { date: t, qty: 1, pay: '現金' }; } }));
    v.appendChild(U.table('stock'));
    v.appendChild(U.table('tickets', { extraCols: [{ label: '残り', value: function (r) { return Math.max(0, num(r.total) - num(r.used)) + '回'; } }, { label: '前受金の残り', value: function (r) { return yen(num(r.total) ? Math.round(num(r.amount) * Math.max(0, num(r.total) - num(r.used)) / num(r.total)) : 0); } }] }));
    return v;
  }
  function home() {
    var m = A().ui.month;
    return [A().homeCard('サロン：きょうと今月', { action: A().navBtn('salon', 'サロンを開く'), easy: true }, A().live(function () {
      var t = C.today(), n = St.rows('reservations').filter(function (r) { return r.date === t && (r.status === '予約' || r.status === '来店'); }).length, s = monthSales(m);
      var low = St.rows('stock').filter(function (x) { return x.name && num(x.qty) <= num(x.reorder); }).length;
      return h('div', { class: 'stats' }, U.stat('きょうの予約', n + '件'), U.stat('今月の売上', yen(s.tech + s.retail), s.guests + '名'), U.stat('発注が必要', low + '品', '', low ? 'warn' : ''));
    }))];
  }
  KD.mod({ id: 'salon', title: 'サロン', icon: '髪', order: 15, collections: cols, sample: sample, view: view, home: home, defaults: { mode: 'owner', rate: 50, salonName: '', revisitDays: 60, msgTemplate: '' } });
})(this);
