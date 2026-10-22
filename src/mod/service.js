/*
 * こもれびデスク — 訪問・作業管理（清掃・訪問サービスの小規模事業者）v2.8
 * 訪問予定（担当別・移動時間込みのタイムライン）、作業の種類ごとのチェックリストのひな形、作業報告書の印刷、見積と実費、再訪期限。
 * 現場はIDのみ。住所・鍵・暗証番号は保存しない。写真は「保管場所」だけをメモする。外部通信なし。サンプルはすべて架空。
 */
(function (root) {
  'use strict';
  var KD = root.KD, U = root.UI, C = root.Calc, St = root.Store, h = U.h, R = KD.rec, f = R.f, date = R.date, note = R.note, num = C.num, yen = C.yen;
  function A() { return root.App; }
  function sv() { return St.modSettings('service'); }
  function makeChecklist(job) {
    var tpl = St.rows('serviceTemplates').filter(function (t) { return t.kind && String(job.title || '').indexOf(t.kind) >= 0; }).sort(function (a, b) { return num(a.order) - num(b.order); });
    if (!tpl.length) tpl = St.rows('serviceTemplates').filter(function (t) { return t.kind === '共通'; });
    var have = {}; St.rows('serviceChecks').forEach(function (c) { if (c.code === job.code) have[c.title] = 1; });
    var add = tpl.filter(function (t) { return !have[t.item]; }).map(function (t) { return { code: job.code, title: t.item, owner: job.worker, due: job.date, done: false, memo: '' }; });
    if (!add.length) { U.toast('チェックリストはすでにあります（またはひな形がありません）'); return; }
    St.addRows('serviceChecks', add); U.toast(add.length + '項目のチェックリストを作りました', { label: '元に戻す', fn: function () { St.undo(); } });
  }
  function printReport(job) {
    var checks = St.rows('serviceChecks').filter(function (c) { return c.code === job.code; }), s = sv();
    U.printDoc(h('div', { class: 'invoice' }, h('h1', { class: 'small-title' }, '作業報告書'),
      h('p', null, (s.company || '') + '　作成日：' + C.today()),
      U.miniTable(['項目', '内容'], [['作業ID', job.code], ['現場ID', job.site], ['作業日', job.date], ['時間', (job.start || '') + '〜' + (job.end || '')], ['担当', job.worker || ''], ['作業内容', job.title], ['状態', job.status], ['写真の保管場所', job.photos || '—']]),
      h('h2', null, '確認した項目'), checks.length ? U.miniTable(['確認項目', '確認', 'メモ'], checks.map(function (c) { return [c.title, c.done ? '済' : '未', c.memo || '']; })) : h('p', null, '（チェックリストなし）'),
      h('h2', null, '作業の報告'), h('p', null, job.memo || ''),
      h('p', { class: 'small' }, 'ご確認のうえ、気になる点があればお知らせください。　お客様確認欄：＿＿＿＿＿＿＿')));
  }
  var jobActions = [{ label: 'チェックリストを作る', onClick: makeChecklist }, { label: '報告書を印刷', onClick: printReport }, { label: '完了にする', onClick: function (r) { St.setRow('serviceJobs', r._id, { status: '完了', done: true }); U.toast('完了にしました', { label: '元に戻す', fn: function () { St.undo(); } }); } }];
  function calItems(from, to) {
    return St.rows('serviceJobs').filter(function (r) { return r.date >= from && r.date <= to && r.status !== '取消'; }).map(function (r) {
      return { date: r.date, start: r.start, end: r.end, lane: r.worker || '', title: (r.site || '') + '・' + (r.title || ''), sub: r.status + (num(r.travelMin) ? '・移動' + r.travelMin + '分' : ''), cls: r.status === '完了' ? 'done' : r.status === '再訪必要' ? 'warn' : '', open: function () { U.openForm('serviceJobs', r, { rowActions: jobActions }); } };
    });
  }
  R.register({
    id: 'service', title: '訪問・作業管理', icon: '訪', order: 20,
    lead: '清掃・訪問サービスの小規模事業者向け。訪問予定、チェックリスト、作業報告、見積と実費、再訪期限を管理。住所・鍵・暗証番号は保存しません。',
    defaults: { travelMin: 30, company: '' },
    cards: function (m) {
      var workers = Array.from(new Set(St.rows('serviceJobs').map(function (r) { return r.worker; }).filter(Boolean))).sort();
      return [U.card('訪問予定表', { wide: true, cls: 'cal-card', desc: '担当ごとの列で1日の訪問を見ます。斜線は移動時間の目安（設定の分数）。空いている時間を押すと訪問を追加できます。' },
        root.Cal.view({ id: 'service', lanes: workers, from: 8, to: 19, step: 30, travel: num(sv().travelMin) || 0, items: calItems,
          onAdd: function (d, time, lane) { var a = root.Cal.mins(time || '09:00'); var r = St.addRow('serviceJobs', { date: d, start: time || '09:00', end: a === null ? '' : root.Cal.hm(a + 120), worker: lane, status: '予定', code: 'V-' + d.replace(/-/g, '').slice(2) + '-' + C.pad(St.rows('serviceJobs').length + 1) }); U.openForm('serviceJobs', r, { rowActions: jobActions, isNew: true }); } }),
        A().form([A().field('移動時間の目安（分）', A().set('mod.service.travelMin', 'number', { min: 0 })), A().field('報告書に出す事業所名', A().set('mod.service.company', 'text'))]))];
    },
    summary: function (m) {
      var jobs = St.rows('serviceJobs').filter(function (r) { return A().inMonth(r.date, m) && r.status !== '取消'; });
      return U.miniTable(['訪問件数', '作業完了', '再訪必要', '見積の合計', '入力した実費合計'], [[jobs.length, jobs.filter(function (r) { return r.status === '完了'; }).length, jobs.filter(function (r) { return r.status === '再訪必要'; }).length, yen(A().sum(jobs, function (r) { return r.quote; })), yen(A().sum(jobs, function (r) { return r.cost; }))]]);
    },
    tables: [
      { key: 'serviceJobs', title: '訪問予定・作業報告', sensitive: true, rowActions: jobActions,
        desc: '現場はIDのみ。見積額と実費は参考記録。請求書や帳簿へは内容を照合して別途入力します。専門作業の安全基準を判定する機能ではありません。',
        filter: function (r, m) { return !r.date || A().inMonth(r.date, m); }, sort: function (a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.start).localeCompare(String(b.start)); },
        fields: [date(), f('code', '作業ID'), f('site', '現場ID'), f('title', '作業内容'), f('worker', '担当'), f('start', '開始予定', 'time'), f('end', '終了予定', 'time'), f('travelMin', '移動（分）', 'number'), f('quote', '見積額', 'yen'), f('cost', '実費', 'yen'),
          f('status', '作業状態', 'select', ['予定', '作業中', '完了', '再訪必要', '取消']), f('photos', '写真の保管場所（作業前後）'), f('due', '完了確認・再訪期限', 'date'), f('done', '確認済', 'check'), note('作業報告（住所・鍵情報なし）')] },
      { key: 'serviceChecks', title: '作業前後の確認', sort: function (a, b) { return String(a.code).localeCompare(String(b.code)); }, fields: [f('code', '作業ID'), f('title', '確認項目'), f('owner', '担当'), f('due', '確認期限', 'date'), f('done', '確認済', 'check'), note()] },
      { key: 'serviceTemplates', title: 'チェックリストのひな形', desc: '作業内容に「種類」の言葉が入っていると、その項目でチェックリストを作ります。合うものがないときは「共通」を使います。',
        sort: function (a, b) { return String(a.kind).localeCompare(String(b.kind)) || num(a.order) - num(b.order); },
        fields: [f('kind', '種類（作業内容に含む言葉）'), f('item', '確認項目'), f('order', '順番', 'number')] }
    ],
    sample: function (H) {
      var kinds = [['エアコン清掃', 12000, 1500, 2, 0], ['水まわり清掃', 18000, 2000, 3, 0], ['定期清掃（事務所）', 25000, 3000, 2, 30], ['ハウスクリーニング', 38000, 4000, 5, 0], ['窓ガラス清掃',16000,1800,2,0], ['換気扇清掃',14000,1600,2,0]], workers = ['DEMO-W01', 'DEMO-W02', 'DEMO-W03', 'DEMO-W04', 'DEMO-W05'], jobs = [];
      for (var i = 0; i < 36; i++) { var d = H.int(-30, 14), k = H.pick(kinds), st = d < 0 ? H.pick(['完了', '完了', '完了', '再訪必要']) : d === 0 ? H.pick(['予定', '作業中']) : '予定', sh = H.pick([9, 10, 13, 14]);
        if (i < 3) { d = 0; sh = [9, 13, 10][i]; st = i === 0 ? '作業中' : '予定'; }
        jobs.push({ date: H.day(d), code: 'DEMO-V' + C.pad(i + 1), site: 'DEMO-SITE' + C.pad(H.int(1, 8)), title: k[0], worker: i < 3 ? workers[i] : H.pick(workers), start: H.hm(sh, 0), end: H.hm(sh + k[3], k[4]), travelMin: H.pick([20, 30, 40]), quote: k[1], cost: k[2], status: st, photos: st === '完了' ? '共有アルバム「' + 'DEMO-V' + C.pad(i + 1) + '」' : '', due: st === '再訪必要' ? H.day(H.int(2, 10)) : '', done: st === '完了', memo: st === '再訪必要' ? '部品交換後に再訪（架空）' : st === '完了' ? '作業前後の状態を確認し、お客様の立ち会いで完了' : '' }); }
      jobs.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var tpl = [['共通', '作業前の状態確認（写真は住所が写らない範囲）', 1], ['共通', '養生', 2], ['共通', '作業後の動作確認', 3], ['共通', 'お客様の立ち会い確認', 4], ['エアコン', '電源を切る・コンセントを抜く', 1], ['エアコン', '分解前の写真', 2], ['エアコン', '高圧洗浄・すすぎ', 3], ['エアコン', '乾燥運転の確認', 4], ['水まわり', '止水・換気', 1], ['水まわり', '排水口・パッキンの点検', 2], ['水まわり', '仕上げの拭き上げ', 3]];
      return { serviceJobs: jobs, serviceChecks: jobs.filter(function (j) { return j.status !== '完了' && j.date >= H.today; }).slice(0, 8).reduce(function (all, j) { return all.concat(['作業前の状態確認', '養生', '作業後の動作確認'].map(function (t) { return { code: j.code, title: t, owner: j.worker, due: j.date, done: false, memo: '' }; })); }, []),
        serviceTemplates: tpl.map(function (t) { return { kind: t[0], item: t[1], order: t[2] }; }) };
    }
  });
})(this);
