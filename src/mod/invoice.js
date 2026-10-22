/*
 * こもれびデスク — 請求・見積・領収書と取引条件の記録（フリーランス法の60日ルールのチェック付き）
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, yen = C.yen, KD = root.KD;
  function A() { return root.App; }

  var cols = {
    invoices: {
      title: '請求書・見積書・領収書（明細）', desc: '1明細1行。同じ番号の行が1枚にまとまります。単価は税抜。源泉徴収ありの明細は、差引請求額を自動計算します。',
      fields: [
        { k: 'no', label: '番号' }, { k: 'doc', label: '種類', type: 'select', options: ['請求書', '見積書', '領収書'] }, { k: 'date', label: '発行日', type: 'date' },
        { k: 'client', label: '宛先' }, { k: 'item', label: '品目' }, { k: 'qty', label: '数量', type: 'number' }, { k: 'price', label: '単価（税抜）', type: 'yen' },
        { k: 'taxRate', label: '税率', type: 'select', options: ['10', '8', '0'] }, { k: 'withholding', label: '源泉徴収', type: 'check' },
        { k: 'delivered', label: '納品日', type: 'date' }, { k: 'due', label: '支払期限', type: 'date' },
        { k: 'status', label: '状態', type: 'select', options: ['下書き', '送付済', '入金済', '取消'] }, { k: 'posted', label: '帳簿転記済', type: 'check' }
      ]
    },
    clients: {
      title: '取引先', desc: '会社名と支払条件。担当者の個人の連絡先は書かない運用を推奨します。',
      fields: [{ k: 'name', label: '取引先' }, { k: 'terms', label: '支払条件' }, { k: 'withhold', label: '源泉徴収あり', type: 'check' }, { k: 'regNo', label: '先方の登録番号（仕入側）' }, { k: 'memo', label: 'メモ' }]
    },
    contracts: {
      title: '取引条件の記録（フリーランス法）', desc: '発注を受けたら、相手から示された条件をここに残す。支払期日が納品（受領）日から60日を超えていないか自動でチェックします。',
      fields: [
        { k: 'date', label: '依頼日', type: 'date' }, { k: 'client', label: '発注者' }, { k: 'content', label: '業務の内容', type: 'textarea' }, { k: 'amount', label: '報酬額', type: 'yen' },
        { k: 'deadline', label: '納期', type: 'date' }, { k: 'received', label: '納品（受領）日', type: 'date' }, { k: 'payDue', label: '支払期日', type: 'date' },
        { k: 'how', label: '条件の示され方', type: 'select', options: ['メール', '書面', 'チャット・SNS', '発注システム', '口頭のみ'] }, { k: 'memo', label: 'メモ' }
      ]
    }
  };
  function inv() { return St.modSettings('invoice'); }
  function groups() {
    var g = Object.create(null);
    St.rows('invoices').forEach(function (r) { if (!r.no) return; (g[r.no] = g[r.no] || []).push(r); });
    return Object.keys(g).sort().reverse().map(function (no) { return totals(no, g[no]); });
  }
  function totals(no, lines) {
    var byRate = Object.create(null), sub = 0, wBase = 0;
    lines.forEach(function (r) { var a = Math.round(num(r.qty) * num(r.price)); sub += a; byRate[r.taxRate || '10'] = (byRate[r.taxRate || '10'] || 0) + a; if (r.withholding) wBase += a; });
    var tax = Object.keys(byRate).reduce(function (t, k) { return t + Math.floor(byRate[k] * Number(k) / 100); }, 0);
    var w = wBase ? C.withholding(wBase, St.rates()) : 0;
    var f = lines[0];
    return { no: no, lines: lines, doc: f.doc || '請求書', date: f.date, client: f.client, due: f.due, status: f.status, posted: lines.every(function (r) { return r.posted; }), sub: sub, byRate: byRate, tax: tax, total: sub + tax, withholding: w, net: sub + tax - w };
  }
  function printOne(t) {
    var s = inv(), title = t.doc;
    U.printDoc(h('div', { class: 'invoice' }, h('h1', null, title),
      h('div', { class: 'inv-top' }, h('div', null, h('p', { class: 'inv-to' }, (t.client || '') + ' 御中'),
        h('p', null, title === '見積書' ? '下記のとおりお見積り申し上げます。' : title === '領収書' ? '下記のとおり領収いたしました。' : '下記のとおりご請求申し上げます。'),
        h('p', { class: 'inv-total' }, (title === '領収書' ? '金額 ' : title === '見積書' ? 'お見積金額 ' : 'ご請求金額 ') + yen(title === '請求書' ? t.net : t.total) + '（税込）')),
        h('div', { class: 'inv-from' }, h('p', null, '番号：' + t.no), h('p', null, '発行日：' + (t.date || '')), h('p', null, s.sellerName), s.invoiceRegNo ? h('p', null, '登録番号：' + s.invoiceRegNo) : null)),
      h('table', null, h('thead', null, h('tr', null, ['品目', '数量', '単価', '税率', '金額'].map(function (x) { return h('th', null, x); }))),
        h('tbody', null, t.lines.map(function (r) { return h('tr', null, h('td', null, r.item + (r.withholding ? '（源泉徴収対象）' : '')), h('td', null, r.qty), h('td', null, yen(r.price)), h('td', null, (r.taxRate || '10') + '%'), h('td', null, yen(Math.round(num(r.qty) * num(r.price))))); }))),
      h('table', { class: 'inv-sum' }, h('tbody', null, h('tr', null, h('th', null, '小計（税抜）'), h('td', null, yen(t.sub))),
        Object.keys(t.byRate).map(function (k) { return h('tr', null, h('th', null, k + '%対象 ' + yen(t.byRate[k]) + ' の消費税'), h('td', null, yen(Math.floor(t.byRate[k] * Number(k) / 100)))); }),
        h('tr', null, h('th', null, '合計（税込）'), h('td', null, yen(t.total))),
        t.withholding && title === '請求書' ? [h('tr', null, h('th', null, '源泉徴収税額'), h('td', null, '-' + yen(t.withholding))), h('tr', null, h('th', null, '差引ご請求額'), h('td', null, yen(t.net)))] : null)),
      title === '請求書' ? h('p', null, 'お支払期限：' + (t.due || '')) : null,
      s.note ? h('p', { class: 'inv-note' }, s.note) : null,
      title === '領収書' && t.total >= 50000 ? h('p', { class: 'small' }, '※紙で発行する5万円以上の領収書には、収入印紙が必要な場合があります（電子データで渡す場合は不要）。') : null));
  }
  function post(t) {
    if (!KD.has('tax')) { U.toast('この版には帳簿がありません'); return; }
    if (t.lines.some(function(r){return r.doc !== '請求書' || r.status !== '入金済';})) { U.toast('すべての明細が入金済の請求書だけ転記できます。'); return; }
    if (t.lines.some(function(r){return r.client !== t.client || r.date !== t.date;})) { U.toast('同じ番号の宛先・発行日が一致しません。番号を分けてください。'); return; }
    var source='invoice:'+t.no;
    if (t.posted || St.rows('ledger').some(function(r){return r.source === source || r.source === t.no;})) { U.toast('同じ請求番号は既に転記済みです。変更は帳簿と照合してください。'); return; }
    var rateKeys=Object.keys(t.byRate), list=rateKeys.map(function(rate,i){var gross=t.byRate[rate]+Math.floor(t.byRate[rate]*Number(rate)/100);return {date:t.date || C.today(),kind:'売上',account:'売上',partner:t.client,item:t.no+' '+rate+'%対象',amount:gross,taxRate:rate,ratio:100,withheld:i===0?t.withholding:0,pay:'銀行振込',evidence:'請求書 '+t.no,source:source};});
    U.ask('帳簿へ転記しますか？',h('div',null,h('p',null,'売上計上日は発行日です。役務提供日・検収日などに応じて帳簿の日付を必ず確認してください。税率ごとに分けて転記します。'),h('p',null,'番号：'+t.no+'／税込合計：'+yen(t.total))),[{label:'やめる',value:false,tone:'ghost'},{label:'転記する',value:true}]).then(function(ok){if(!ok)return;if(St.rows('ledger').some(function(r){return r.source===source||r.source===t.no;})){U.toast('転記済みです');return;}if(St.conflict()){U.toast('別タブの変更があります。先に再起動してください。');return;}St.addRows('ledger',list);t.lines.forEach(function(r){St.updateRow('invoices',r._id,'posted',true);});St.changed();U.toast('税率別に帳簿へ転記しました。計上日を確認してください。');});
  }

  function sample(H) {
    var clients = [['サンプル商事株式会社（架空）', '月末締め翌月末払い', true], ['こもれび食堂（架空）', '納品後14日以内', false], ['ひだまり工房（架空）', '月末締め翌月20日払い', true], ['みどり公民館（架空）', '当月末払い', false], ['あおば雑貨（架空）','納品後30日以内',false], ['つばめ企画（架空）','月末締め翌月末払い',true]];
    var inv = [], n = 1;
    for (var m = -5; m <= 0; m++) {
      clients.slice(0, H.int(4, 6)).forEach(function (c) {
        var no = 'INV-' + H.month(m).replace('-', '') + '-' + C.pad(n++), date = H.dom(28, m), st = m < -1 ? '入金済' : m === -1 ? H.pick(['入金済', '送付済']) : H.pick(['下書き', '送付済']);
        var lines = H.int(1, 3);
        for (var i = 0; i < lines; i++) inv.push({ no: no, doc: '請求書', date: date, client: c[0], item: H.pick(['商品紹介文の作成', '季節セールのバナー制作', '納品後の文字修正', 'サイトの画像差替え', '入門講座の資料と登壇', 'アンケート集計表の整備']), qty: H.int(1, 4), price: H.pick([2000, 3000, 5000, 6000, 8000]), taxRate: '10', withholding: c[2], delivered: H.dom(25, m), due: C.addMonths(date, 1), status: st, posted: false });
      });
    }
    inv.push({ no: 'EST-' + H.month(0).replace('-', '') + '-01', doc: '見積書', date: H.day(-2), client: clients[1][0], item: 'メニュー表のデザイン', qty: 1, price: 30000, taxRate: '10', withholding: false, delivered: '', due: '', status: '下書き', posted: false });
    return {
      clients: clients.map(function (c) { return { name: c[0], terms: c[1], withhold: c[2], regNo: '', memo: '' }; }),
      invoices: inv,
      contracts: [
        { date: H.day(-20), client: clients[0][0], content: '記事3本（各3000字）', amount: 18000, deadline: H.day(-5), received: H.day(-6), payDue: C.addDays(H.day(-6), 40), how: 'メール', memo: '' },
        { date: H.day(-12), client: clients[2][0], content: 'サイト保守（月10時間まで）', amount: 25000, deadline: H.day(10), received: '', payDue: '', how: '発注システム', memo: '' },
        { date: H.day(-30), client: '（架空）個人のお客様', content: 'ロゴの修正', amount: 15000, deadline: H.day(-15), received: H.day(-15), payDue: C.addDays(H.day(-15), 75), how: '口頭のみ', memo: '条件をメールで送ってもらう' }
      ]
    };
  }

  function view() {
    var v = h('div'), live = A().live, s = inv();
    v.appendChild(A().viewHead('請求・取引', '請求書・見積書・領収書の作成と印刷（PDF保存）、入金の確認、帳簿への転記、取引条件の記録。'));
    v.appendChild(A().grid(
      U.card('発行元の情報', { desc: '印刷する書類に載ります。銀行口座などは、共有パソコンでは入れないでください。' }, A().form([
        A().field('屋号・名前', A().set('mod.invoice.sellerName', 'text')), A().field('適格請求書の登録番号', A().set('mod.invoice.invoiceRegNo', 'text'), 'T＋13桁（登録している人だけ）'),
        A().field('書類の備考', A().set('mod.invoice.note', 'textarea'), '振込先・お礼の一言など')])),
      U.card('書類の一覧', { wide: true }, live(function () {
        var g = groups();
        if (!g.length) return U.empty();
        return h('div', { class: 'table-wrap' }, h('table', { class: 'grid compact' }, h('thead', null, h('tr', null, ['番号', '種類', '宛先', '発行日', '期限', '状態', '合計（税込）', '源泉徴収', '差引', '操作'].map(function (x) { return h('th', { scope: 'col' }, x); }))),
          h('tbody', null, g.map(function (t) {
            var late = t.doc === '請求書' && t.status === '送付済' && t.due && t.due < C.today();
            return h('tr', null, h('td', null, t.no), h('td', null, t.doc), h('td', null, t.client), h('td', null, t.date), h('td', null, t.due || '—', late ? U.badge('期限超過', 'bad') : null), h('td', null, t.status),
              h('td', { class: 'num' }, yen(t.total)), h('td', { class: 'num' }, t.withholding ? yen(t.withholding) : '—'), h('td', { class: 'num' }, yen(t.net)),
              h('td', null, h('button', { type: 'button', class: 'btn tiny', on: { click: function () { printOne(t); } } }, '印刷'),
                t.doc === '請求書' && t.status === '入金済' && KD.has('tax') ? h('button', { type: 'button', class: 'btn tiny ghost', disabled: t.posted, on: { click: function () { post(t); } } }, t.posted ? '転記済' : '帳簿へ') : null));
          }))));
      }), h('p', { class: 'muted small' }, '「印刷」→印刷画面で「PDFに保存」を選ぶとPDFになります。入金を確認したら状態を「入金済」にして「帳簿へ」。'))));
    v.appendChild(U.table('invoices', { sort: function (a, b) { return String(b.no).localeCompare(String(a.no)); }, newRow: function () { var c = St.rows('clients')[0]; return { no: 'INV-' + C.today().slice(0, 7).replace('-', '') + '-', doc: '請求書', date: C.today(), qty: 1, taxRate: '10', withholding: !!(c && c.withhold), client: c ? c.name : '', due: C.addMonths(C.today(), 1), status: '下書き' }; },
      extraCols: [{ label: '金額（税抜）', value: function (r) { return yen(Math.round(num(r.qty) * num(r.price))); } }] }));
    v.appendChild(U.table('contracts', { sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: C.today(), how: 'メール' }; },
      extraCols: [{ label: '60日チェック', value: function (r) {
        var c = C.paymentDueCheck(r.received, r.payDue);
        if (r.how === '口頭のみ') return h('span', { class: 'badge warn' }, '条件を文書かメールでもらう');
        if (!r.received) return '納品後に判定';
        if (!r.payDue) return h('span', { class: 'badge warn' }, '支払期日が未定');
        return c.over ? h('span', { class: 'badge bad' }, '60日超（' + c.limit + 'まで）') : h('span', { class: 'badge' }, 'OK（' + c.limit + 'まで）');
      } }],
      footer: h('p', { class: 'muted small' }, 'フリーランス法（2024年11月施行）では、発注者は取引条件をすぐに示し、報酬は受領日から60日以内のできるだけ短い期日に支払う決まりです。困ったときは公正取引委員会・厚生労働省の相談窓口（フリーランス・トラブル110番など）へ。') }));
    v.appendChild(U.table('clients'));
    return v;
  }
  function home() {
    return [A().homeCard('入金待ちの請求', { action: A().navBtn('invoice', '請求を開く'), easy: true }, A().live(function () {
      var g = groups().filter(function (t) { return t.doc === '請求書' && t.status === '送付済'; });
      if (!g.length) return U.empty('入金待ちはありません。');
      return h('ul', { class: 'list' }, g.slice(0, 5).map(function (t) { var late = t.due && t.due < C.today(); return h('li', null, late ? U.badge('期限超過', 'bad') : U.badge('期限 ' + (t.due || '—')), ' ', t.client + '：' + yen(t.net)); }));
    }))];
  }
  KD.mod({ id: 'invoice', title: '請求・取引', icon: '請', order: 30, collections: cols, sample: sample, view: view, home: home,
    defaults: { sellerName: 'こもれび制作室（サンプル屋号）', invoiceRegNo: '', note: '' } });
})(this);
