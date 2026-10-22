/*
 * こもれびデスク — 銀行・カードの明細CSVの取り込みと、仕分けルール（v2.8）
 * ・銀行やカード会社のサイトから自分で保存した明細CSVを、ファイルとして読み込む（銀行への接続・ログインはしない）
 * ・「この言葉が入っていたら通信費・事業割合50%」のような自分で決めるルールで、科目の候補を付ける
 * ・ルールに当たらない行は、過去の帳簿の似た取引から候補を出す（AIは使わない）
 * ・同じ明細の二重取り込みを防ぐ。取り込む行は自分で選ぶ。直後なら「元に戻す」で戻せる
 * ・家賃・電気・通信・車の「事業割合」を、質問に答えて決める手引き
 * 帳簿（tax）がある版だけで動く。外部通信なし。
 */
(function (root) {
  'use strict';
  var KD = root.KD; if (!KD.has('tax')) return;
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, App = root.App, doc = root.document;
  var KINDS = ['売上', '経費', '仕入', '雑収入・家事消費'];
  KD.mod({ id: 'taxrules', core: true, title: '仕分けルール', order: 998, collections: { ledgerRules: { title: '仕分けルール（明細CSV用）', desc: '明細の「内容」にこの言葉が入っていたら、区分・科目・事業割合を自動で付けます。上の行ほど優先。',
    fields: [{ k: 'keyword', label: '含む言葉' }, { k: 'kind', label: '区分', type: 'select', options: [''].concat(KINDS) }, { k: 'account', label: '科目' }, { k: 'ratio', label: '事業割合%', type: 'pct' },
      { k: 'taxRate', label: '税率', type: 'select', options: ['', '10', '8', '0', '対象外'] }, { k: 'partner', label: '取引先名（置き換え）' }, { k: 'memo', label: '按分の根拠・メモ', type: 'textarea' }, { k: 'order', label: '優先順', type: 'number' }] } },
    sample: function () { return { ledgerRules: [
      { keyword: '電話', kind: '経費', account: '通信費', ratio: 50, taxRate: '10', partner: '', memo: '仕事で使う時間の割合（1日8時間÷起きている16時間）', order: 1 },
      { keyword: 'サーバー', kind: '経費', account: '通信費', ratio: 100, taxRate: '10', partner: '', memo: '', order: 2 },
      { keyword: '電力', kind: '経費', account: '水道光熱費', ratio: 30, taxRate: '10', partner: '', memo: '作業部屋の面積・使用時間から（質問の手引きで算出）', order: 3 },
      { keyword: '書店', kind: '経費', account: '新聞図書費', ratio: 100, taxRate: '10', partner: '', memo: '資料用の本', order: 4 },
      { keyword: 'カフェ', kind: '経費', account: '会議費', ratio: 100, taxRate: '10', partner: '', memo: '打ち合わせのときだけ。私用は取り込まない', order: 5 },
      { keyword: '振込', kind: '売上', account: '売上', ratio: 100, taxRate: '10', partner: '', memo: '入金は請求書と照合してから', order: 9 }] }; } });

  // ---- CSVを読む（引用符・改行入りのセルに対応） ----
  function parseCSV(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
      if (rows.length > 5000 || row.length > 100) throw new Error('CSVは5000行・100列までに分けてください');
    }
    if (q) throw new Error('CSVの引用符が閉じていません。元ファイルを確認してください');
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    if (rows.length > 5000 || rows.some(function (r) { return r.length > 100; })) throw new Error('CSVは5000行・100列までに分けてください');
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }
  function readFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var t; try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch(e) { t = new TextDecoder('shift_jis', { fatal: true }).decode(buf); }
      return t.replace(/^﻿/, '');
    });
  }
  // 日付：2026/10/05・2026-10-05・20261005・2026年10月5日・R8.10.5・令和8年10月5日
  function toDate(s) {
    s = String(s || '').trim().replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    var m = /^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/.exec(s) || /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (!m) { var r = /^(?:R|令和)\s*(\d{1,2})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/.exec(s); if (r) m = [0, String(2018 + Number(r[1])), r[2], r[3]]; }
    if (!m) return '';
    var d = m[1] + '-' + C.pad(Number(m[2])) + '-' + C.pad(Number(m[3])), t = new Date(d + 'T00:00:00Z');
    return !isNaN(t) && t.toISOString().slice(0, 10) === d ? d : '';
  }
  function toNum(s) { var t = String(s || '').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[,，円¥￥\s]/g, '').replace(/^△|^▲/, '-'); if (t === '' || t === '-') return 0; var n = Number(t); return isFinite(n) ? n : 0; }

  // 名称の部分一致だけで、支払総額・残高・手数料を取引額と取り違えない。
  var ALIASES = {
    date: ['取引日','取引日付','お取引日','お取引日付','勘定日','利用日','ご利用日','ご利用年月日','取扱日','取扱年月日','年月日','日付','date','transactiondate','posteddate'],
    desc: ['摘要','摘要欄','内容','取引内容','お取引内容','利用店名商品名','ご利用店名','利用店名','ご利用先','利用先','加盟店名','店名','説明','description','memo','merchant'],
    out: ['出金金額','出金額','出金','お支払金額','お支払額','お引出金額','お引出し金額','お引き出し金額','引出金額','引出額','支払金額','withdrawal','withdraw','debit'],
    inn: ['入金金額','入金額','入金','お預り金額','お預かり金額','お預入金額','お預入れ金額','預入金額','預入額','deposit','credit'],
    amount: ['利用金額','ご利用金額','取引金額','金額','amount','transactionamount']
  };
  function normalHead(s) { return String(s || '').normalize('NFKC').toLowerCase().replace(/^\uFEFF/, '').replace(/[\s・･/\-_:：（）()\[\]【】]/g, '').replace(/(?:円|jpy)$/, ''); }
  function guessCols(head) {
    var o = { date: -1, desc: -1, out: -1, inn: -1, amount: -1 };
    Object.keys(o).forEach(function (k) {
      var matches = [], best = -1;
      head.forEach(function (c, i) { var n = normalHead(c), rank = ALIASES[k].indexOf(n), score = rank >= 0 ? 1000 - rank : -1;
        if (score > best) { matches = [i]; best = score; } else if (score >= 0 && score === best) matches.push(i);
      });
      if (best >= 0 && matches.length === 1) o[k] = matches[0];
    });
    // 入出金が分かれた明細では、単一金額列による上書きを選ばない。
    if (o.out >= 0 || o.inn >= 0) o.amount = -1;
    return o;
  }
  function headerIndex(rows) {
    var best = -1, index = 0;
    rows.slice(0, 15).forEach(function (row, i) { var g = guessCols(row), score = (g.date >= 0 ? 5 : 0) + (g.desc >= 0 ? 2 : 0) + (g.out >= 0 ? 3 : 0) + (g.inn >= 0 ? 3 : 0) + (g.amount >= 0 ? 3 : 0);
      if (g.date >= 0 && (g.out >= 0 || g.inn >= 0 || g.amount >= 0) && score > best) { index = i; best = score; }
    });
    return index;
  }
  function validateColumns(ci, width) {
    var used = [];
    Object.keys(ci).forEach(function (k) { var v = ci[k]; if (!Number.isInteger(v) || v < -1 || v >= width) throw new Error('列の対応を選び直してください'); if (v >= 0) { if (used.indexOf(v) >= 0) throw new Error('同じ列を複数の項目に使えません'); used.push(v); } });
    if (ci.date < 0 || (ci.out < 0 && ci.inn < 0 && ci.amount < 0)) throw new Error('日付と金額の列を選んでください');
    if (ci.amount >= 0 && (ci.out >= 0 || ci.inn >= 0)) throw new Error('金額は「入金・出金の列」か「1列の金額」のどちらかを選んでください');
  }
  function parseAmount(s) {
    var t = String(s == null ? '' : s).normalize('NFKC').trim().replace(/^[￥¥]\s*/, '').replace(/\s*(?:円|JPY)$/i, '').trim().replace(/^[▲△]/, '-');
    if (t === '' || t === '-') return 0;
    if (/^\(.*\)$/.test(t)) t = '-' + t.slice(1,-1);
    if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(t)) return null;
    var n = Number(t.replace(/,/g,'')); return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? n : null;
  }
  function prepareRows(body, ci, pay, negativeIncome) {
    var items = [], skipped = 0;
    body.forEach(function (r) {
      var d = toDate(r[ci.date]), desc = ci.desc >= 0 ? String(r[ci.desc] || '').trim().slice(0,200) : '';
      var out = ci.out >= 0 ? parseAmount(r[ci.out]) : 0, inn = ci.inn >= 0 ? parseAmount(r[ci.inn]) : 0;
      if (ci.amount >= 0) { var a = parseAmount(r[ci.amount]); if (a === null) { skipped++; return; } if (pay === 'カード') { if (negativeIncome && a < 0) inn = -a; else out = Math.abs(a); } else { if (a < 0) out = -a; else inn = a; } }
      // 両建て・負の入出金・不正な数字は勝手に片側へ寄せない。
      if (!d || out === null || inn === null || out < 0 || inn < 0 || (out > 0 && inn > 0)) { skipped++; return; }
      if (!out && !inn) return;
      var isIn = inn > 0, amount = isIn ? inn : out, s = suggest(desc, isIn);
      items.push({date:d,desc:desc,amount:amount,isIn:isIn,s:s,hash:hashOf(d+'|'+amount+'|'+desc+'|'+pay)});
    });
    return {items:items,skipped:skipped};
  }

  function rules() { return St.rows('ledgerRules').filter(function (r) { return r.keyword; }).slice().sort(function (a, b) { return num(a.order) - num(b.order); }); }
  function hashOf(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return ('0000000' + x.toString(16)).slice(-8); }
  function suggest(desc, isIn) {
    var r = rules().filter(function (x) { return String(desc).indexOf(x.keyword) >= 0; })[0];
    if (r) return { kind: r.kind || (isIn ? '売上' : '経費'), account: r.account || '', ratio: r.ratio === '' ? 100 : num(r.ratio), taxRate: r.taxRate || '10', partner: r.partner || '', by: 'ルール「' + r.keyword + '」' };
    var key = String(desc).slice(0, 6), past = key.length >= 2 ? St.rows('ledger').filter(function (l) { return l.account && (String(l.item).indexOf(key) >= 0 || String(l.partner).indexOf(key) >= 0); }).slice(-1)[0] : null;
    if (past) return { kind: past.kind, account: past.account, ratio: past.ratio === '' ? 100 : num(past.ratio), taxRate: past.taxRate || '10', partner: past.partner || '', by: '過去の帳簿から' };
    return { kind: isIn ? '売上' : '経費', account: isIn ? '売上' : '', ratio: 100, taxRate: '10', partner: '', by: '' };
  }
  function importFlow() {
    var file = h('input', { type: 'file', accept: '.csv,text/csv', 'aria-label': '明細CSVファイル' });
    var payKind = h('select', { 'aria-label': '明細の種類' }, [['銀行振込', '銀行の明細'], ['カード', 'クレジットカードの明細'], ['電子マネー', '電子マネー・QR決済の明細']].map(function (x) { return h('option', { value: x[0] }, x[1]); }));
    U.ask('明細CSVを取り込む', h('div', null, h('p', null, '銀行・カード会社のサイトから自分で保存したCSVを選んでください。このツールが銀行などに接続することはありません。'), App.field('明細の種類', payKind), App.field('CSVファイル（5MBまで）', file),
      h('p', { class: 'small muted' }, '文字コードはUTF-8とShift_JISに対応。列名からの候補は必ず確認してください。支払総額・残高・手数料を取引額と取り違えないようにします。')), [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '次へ', value: true }]).then(function (ok) {
      if (!ok) return; var f = file.files[0]; if (!f) { U.toast('CSVファイルを選んでください'); return; } if (f.size > 5 * 1024 * 1024) { U.toast('5MBまでのファイルにしてください'); return; }
      readFile(f).then(function (t) { try { mapping(parseCSV(t), payKind.value, f.name); } catch(e) { U.toast(e.message); } }, function () { U.toast('ファイルを読めませんでした。UTF-8かShift_JISのCSVを確認してください'); });
    });
  }
  function mapping(rows, pay, fname) {
    if (rows.length < 2) { U.toast('明細の行が見つかりませんでした'); return; }
    // 見出し行を探す（日付らしい列がある最初の行の1つ前）
    var hi = headerIndex(rows);
    var head = rows[hi], body = rows.slice(hi + 1), g = guessCols(head);
    function sel(label, val) { var s = h('select', { 'aria-label': label }, h('option', { value: '-1' }, '（使わない）'), head.map(function (c, i) { return h('option', { value: String(i), selected: i === val }, (c || '列' + (i + 1)).slice(0, 30)); })); return s; }
    var sDate = sel('日付の列', g.date), sDesc = sel('内容の列', g.desc), sOut = sel('出金・支払の列', g.out), sIn = sel('入金の列', g.inn), sAmt = sel('金額の列（1列で＋−のとき）', g.amount);
    var minus = h('input', { type: 'checkbox' });
    U.ask('列の対応を確認', h('div', null, h('p', null, 'ファイル：' + fname + '（' + body.length + '行）。自動で選んだ列が合っているか確認してください。'),
      h('div', { class: 'form' }, App.field('日付', sDate), App.field('内容（摘要・お店）', sDesc), App.field('出金・支払', sOut), App.field('入金', sIn), App.field('金額（1列のとき）', sAmt)),
      h('label', { class: 'field check' }, minus, h('span', null, '「金額」列はマイナスが入金（カード明細の返金など）')),
      U.miniTable(head.map(function (c, i) { return (c || '列' + (i + 1)).slice(0, 12); }), body.slice(0, 3).map(function (r) { return r.map(function (c) { return String(c).slice(0, 14); }); }))),
      [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '次へ', value: true }]).then(function (ok) {
      if (!ok) return;
      var ci = { date: +sDate.value, desc: +sDesc.value, out: +sOut.value, inn: +sIn.value, amount: +sAmt.value };
      try { validateColumns(ci, head.length); } catch(e) { U.toast(e.message); return; }
      var prepared = prepareRows(body, ci, pay, minus.checked);
      preview(prepared.items, pay, prepared.skipped);

    });
  }
  function preview(items, pay, skipped) {
    var have = {}; St.rows('ledger').forEach(function (l) { if (/^CSV-/.test(l.source || '')) have[l.source] = 1; });
    
    var rowsEl = items.slice(0, 400).map(function (it) {
      var dup = have['CSV-' + it.hash], ck = h('input', { type: 'checkbox', checked: !dup && (!!it.s.account || it.isIn), 'aria-label': it.date + ' ' + it.desc + 'を取り込む' });
      it.ck = ck; it.dup = dup;
      return h('tr', { class: dup ? 'dup' : '' }, h('td', null, ck), h('td', null, it.date), h('td', null, it.desc), h('td', { class: 'num' }, (it.isIn ? '＋' : '−') + C.yen(it.amount)), h('td', null, it.s.kind), h('td', null, it.s.account || h('span', { class: 'muted' }, '未分類')), h('td', { class: 'num' }, it.s.ratio + '%'), h('td', { class: 'small muted' }, dup ? '取り込み済み' : it.s.by));
    });
    U.ask('取り込む行を選ぶ', h('div', null, skipped ? h('p', { class: 'warn small', role: 'status' }, skipped + '行は日付・金額を確認できないか、入金と出金の両方に金額があるため除外しました。元CSVと照合してください。') : null, h('p', null, items.length + '行のうち、科目の候補が付いた行と入金に最初からチェックを入れています。私用の支出はチェックを外してください。'),
      h('div', { class: 'table-wrap import-preview' }, h('table', { class: 'grid compact' }, h('thead', null, h('tr', null, ['取込', '日付', '内容', '金額', '区分', '科目', '事業割合', '候補の理由'].map(function (x) { return h('th', null, x); }))), h('tbody', null, rowsEl))),
      items.length > 400 ? h('p', { class: 'warn small' }, '先頭400行だけを表示しています。残りは期間を分けたCSVで取り込んでください。') : null,
      h('p', { class: 'small muted' }, '取り込んだ行は帳簿の「転記元」に「CSV-…」と入り、同じ明細を二度取り込まないようにします。科目は帳簿でいつでも直せます。')),
      [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '選んだ行を帳簿へ', value: true }], { cls: 'form-dlg' }).then(function (ok) {
      if (!ok) return;
      var add = items.slice(0, 400).filter(function (it) { return it.ck.checked && !it.dup; }).map(function (it) {
        return { date: it.date, kind: it.s.kind, account: it.s.account, partner: it.s.partner || it.desc.slice(0, 40), item: it.desc, amount: it.amount, taxRate: it.s.taxRate, ratio: it.s.ratio, pay: pay, evidence: '明細CSV（' + pay + '）', source: 'CSV-' + it.hash };
      });
      if (!add.length) { U.toast('取り込む行がありません'); return; }
      try { St.addRows('ledger', add); U.toast(add.length + '行を帳簿に取り込みました', { label: '元に戻す', fn: function () { St.undo(); } }); } catch (e) { U.toast(e.message); }
    });
  }
  // ---- 質問に答えて事業割合を決める ----
  function ratioGuide() {
    var kind = h('select', { 'aria-label': '何の割合を決めますか' }, [['rent', '家賃（自宅で仕事）'], ['power', '電気代'], ['phone', 'スマホ・ネット'], ['car', '車（ガソリン・保険）']].map(function (x) { return h('option', { value: x[0] }, x[1]); }));
    var a = h('input', { type: 'number', min: '0', step: 'any', 'aria-label': '値1' }), b = h('input', { type: 'number', min: '0', step: 'any', 'aria-label': '値2' }), c = h('input', { type: 'number', min: '0', max: '7', step: '1', 'aria-label': '値3' }), kw = h('input', { type: 'text', maxlength: '20', 'aria-label': '明細に出る言葉' });
    var la = h('span'), lb = h('span'), lc = h('span'), out = h('p', { class: 'big-text' });
    var Q = { rent: ['仕事に使う部屋（またはスペース）の広さ（㎡）', '家全体の広さ（㎡）', '（使いません）', '家賃'], power: ['仕事で使う時間（1日・時間）', '家で起きている時間（1日・時間）', '仕事をする日数（週）', '電力'], phone: ['仕事で使う時間（1日・時間）', '使う時間の合計（1日・時間）', '仕事をする日数（週）', '電話'], car: ['仕事で走る距離（月・km）', '全体の走る距離（月・km）', '（使いません）', 'ガソリン'] };
    function calc() {
      var q = Q[kind.value]; la.textContent = q[0]; lb.textContent = q[1]; lc.textContent = q[2]; if (!kw.value) kw.placeholder = '例：' + q[3];
      var r = num(b.value) ? num(a.value) / num(b.value) : 0; if (kind.value !== 'car' && kind.value !== 'rent' && num(c.value)) r = r * Math.min(7, num(c.value)) / 7;
      var pct = Math.max(0, Math.min(100, Math.round(r * 100))); out.textContent = '事業割合の目安：' + pct + '%'; out.setAttribute('data-pct', pct);
    }
    [kind, a, b, c].forEach(function (x) { x.addEventListener('input', calc); x.addEventListener('change', calc); }); calc();
    U.ask('質問に答えて事業割合を決める', h('div', null, h('p', null, '自宅と兼用の出費は、仕事に使った割合だけを経費にします（家事按分）。答えた数字が根拠になるので、メモとして残します。'),
      App.field('何の割合？', kind), h('label', { class: 'field' }, la, a), h('label', { class: 'field' }, lb, b), h('label', { class: 'field' }, lc, c), out, App.field('明細に出る言葉（ルールにする）', kw),
      h('p', { class: 'small muted' }, '割合の決め方に一つの正解はありません。説明できる根拠（面積・時間・距離）を残すことが大切です。迷うときは税務署や税理士に相談してください。')),
      [{ label: 'やめる', value: false, tone: 'ghost' }, { label: 'ルールとして保存', value: true }]).then(function (ok) {
      if (!ok) return; calc();
      var pct = Number(out.getAttribute('data-pct')) || 0, q = Q[kind.value], acc = { rent: '地代家賃', power: '水道光熱費', phone: '通信費', car: '車両費' }[kind.value];
      St.addRow('ledgerRules', { keyword: kw.value.trim() || q[3], kind: '経費', account: acc, ratio: pct, taxRate: kind.value === 'rent' ? '対象外' : '10', memo: q[0] + '：' + a.value + '／' + q[1] + '：' + b.value + (kind.value !== 'car' && kind.value !== 'rent' && c.value ? '／週' + c.value + '日' : '') + '（' + C.today() + ' 決定）', order: 0 });
      U.toast('ルール「' + (kw.value.trim() || q[3]) + '」を保存しました（事業割合 ' + pct + '%）');
    });
  }
  function card() {
    return U.card('明細の取り込みと仕分けルール', { wide: true, cls: 'import-card', desc: '銀行・カードの明細CSVを読み込んで、帳簿の行をまとめて作ります。銀行やカード会社に接続はしません。' },
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', on: { click: importFlow } }, '明細CSVを取り込む'), h('button', { type: 'button', class: 'btn ghost', on: { click: ratioGuide } }, '質問に答えて事業割合を決める')),
      (function () { var t = U.table('ledgerRules', { sort: function (a, b) { return num(a.order) - num(b.order); }, newRow: function () { return { kind: '経費', ratio: 100, taxRate: '10', order: St.rows('ledgerRules').length + 1 }; } }); t.classList.remove('table-card'); return t; })());
  }
  var prior = App.render;
  App.render = function () {
    prior();
    if ((root.location.hash || '') !== '#tax') return;
    var main = doc.getElementById('main'), first = main.querySelector('section.table-card');
    var c = card(); if (first) first.parentNode.insertBefore(c, first); else main.appendChild(c);
  };
  root.BankCSV = { parseCSV: parseCSV, toDate: toDate, toNum: toNum, guessCols: guessCols, headerIndex: headerIndex, validateColumns: validateColumns, parseAmount: parseAmount, prepareRows: prepareRows, readFile: readFile, suggest: suggest, hashOf: hashOf };
})(this);
