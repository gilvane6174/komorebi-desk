/*
 * こもれびデスク — 教室・レッスン（小規模教室・個人講師）v2.8
 * 受講者台帳・授業と出欠・振替の残り回数・月謝の未納一覧と年間台帳・教材準備・保護者への連絡文（コピーして自分で送る）・週/月の予定表。
 * 受講者はIDで記録する。自動請求・決済・自動送信はしない。外部通信なし。サンプルはすべて架空。
 */
(function (root) {
  'use strict';
  var KD = root.KD, U = root.UI, C = root.Calc, St = root.Store, h = U.h, R = KD.rec, f = R.f, date = R.date, note = R.note, num = C.num, yen = C.yen;
  function A() { return root.App; }
  function ts() { return St.modSettings('tutor'); }
  var TPL = {
    makeup: '{受講者}さんの保護者さま\n{日付}の欠席の振替についてご案内します。今月の振替はあと{残り}回ご利用いただけます。ご希望の日時をお知らせください。\n{教室名}',
    fee: '{受講者}さんの保護者さま\n{月}分の受講料（{金額}）のお支払いが、まだ確認できていません。行き違いでしたら申し訳ありません。ご確認をお願いいたします。\n{教室名}',
    absent: '{受講者}さんの保護者さま\n本日{日付}のレッスンにお見えでなかったため、ご連絡しました。体調などお変わりないでしょうか。振替もご利用いただけます。\n{教室名}'
  };
  function makeupLeft(student, m) {
    var st = St.rows('lessonStudents').filter(function (s) { return s.student === student; })[0], allow = st && st.makeup !== '' && st.makeup !== undefined ? num(st.makeup) : num(ts().makeupPerMonth);
    var used = St.rows('lessonSessions').filter(function (r) { return r.student === student && A().inMonth(r.date, m) && (r.status === '振替済' || r.status === '振替待ち'); }).length;
    return { allow: allow, used: used, left: Math.max(0, allow - used) };
  }
  function unpaid() { return St.rows('lessonFees').filter(function (r) { return num(r.amount) > num(r.paid) && !r.done; }).sort(function (a, b) { return String(a.month).localeCompare(String(b.month)); }); }
  function copy(kind, vals) { vals['教室名'] = ts().school || ''; U.copyText(U.fillTemplate(ts()['tpl_' + kind] || TPL[kind], vals), '連絡文をコピーしました。メールやLINEに自分で貼って送ってください'); }
  function calItems(from, to) {
    return St.rows('lessonSessions').filter(function (r) { return r.date >= from && r.date <= to && r.status !== '取消'; }).map(function (r) {
      return { date: r.date, start: r.start, end: r.end, lane: r.room || '', title: (r.student || '') + '・' + (r.subject || ''), sub: r.status, cls: r.status === '欠席' || r.status === '振替待ち' ? 'warn' : r.status === '出席' ? 'done' : '', open: function () { U.openForm('lessonSessions', r, { rowActions: sesActions }); } };
    });
  }
  var sesActions = [
    { label: '出席にする', onClick: function (r) { St.setRow('lessonSessions', r._id, { status: '出席' }); U.toast('出席にしました', { label: '元に戻す', fn: function () { St.undo(); } }); } },
    { label: '欠席→振替待ち', onClick: function (r) { St.setRow('lessonSessions', r._id, { status: '振替待ち', due: C.addDays(r.date || C.today(), 30) }); U.toast('振替待ちにしました（期限30日）'); } },
    { label: '振替の連絡文', onClick: function (r) { var x = makeupLeft(r.student, String(r.date).slice(0, 7)); copy('makeup', { 受講者: r.student, 日付: r.date, 残り: x.left }); } }
  ];
  function yearLedger(student, y) {
    var months = []; for (var i = 1; i <= 12; i++) months.push(y + '-' + C.pad(i));
    var rows = St.rows('lessonFees').filter(function (r) { return r.student === student; });
    return U.miniTable(['月', '請求', '入金', '未納'], months.map(function (m) { var l = rows.filter(function (r) { return r.month === m; }), a = A().sum(l, function (r) { return r.amount; }), p = A().sum(l, function (r) { return r.paid; }); return [Number(m.slice(5)) + '月', a ? yen(a) : '—', p ? yen(p) : '—', a > p ? U.badge(yen(a - p), 'warn') : '—']; }), [1, 2, 3]);
  }
  R.register({
    id: 'tutor', title: '教室・レッスン', icon: '教', order: 18,
    lead: '小規模教室・個人講師向け。授業予定、出欠、振替、月謝の確認を一か所に。受講者はIDで記録します。',
    defaults: { makeupPerMonth: 2, school: '', tpl_makeup: '', tpl_fee: '', tpl_absent: '' },
    cards: function (m) {
      var live = A().live, y = A().ui.tutorYear || m.slice(0, 4), who = A().ui.tutorStudent || '';
      var students = St.rows('lessonStudents').filter(function (s) { return s.active !== false && s.student; }).map(function (s) { return s.student; });
      return [
        U.card('予定表', { wide: true, cls: 'cal-card', desc: '週ごとの授業。空いている時間を押すと授業を追加できます。' }, root.Cal.view({ id: 'tutor', defaultMode: 'week', modes: ['day', 'week', 'month'], from: 9, to: 22, step: 30, items: calItems,
          onAdd: function (d, time) { var a = root.Cal.mins(time || '16:00'); var r = St.addRow('lessonSessions', { date: d, start: time || '16:00', end: a === null ? '' : root.Cal.hm(a + 60), status: '予定' }); U.openForm('lessonSessions', r, { rowActions: sesActions, isNew: true }); } })),
        U.card('月謝の未納', { cls: 'accent', desc: '請求額より入金が少ない月。連絡文はコピーして自分で送ります。' }, live(function () {
          var l = unpaid();
          return l.length ? h('ul', { class: 'list' }, l.slice(0, 10).map(function (r) { return h('li', null, h('strong', null, r.student), '：' + A().ymLabel(r.month || m) + ' 残り ' + yen(num(r.amount) - num(r.paid)) + (r.due ? '（期限 ' + r.due + '）' : ''), ' ',
            h('button', { type: 'button', class: 'btn tiny ghost', on: { click: function () { copy('fee', { 受講者: r.student, 月: A().ymLabel(r.month || m), 金額: yen(num(r.amount) - num(r.paid)) }); } } }, '連絡文をコピー')); })) : U.empty('未納はありません。');
        })),
        U.card('振替の残り（' + A().ymLabel(m) + '）', { desc: '受講者ごとの月の振替回数（台帳の「月の振替上限」、なければ設定の回数）。' }, live(function () {
          var ids = students.length ? students : Array.from(new Set(St.rows('lessonSessions').map(function (r) { return r.student; }).filter(Boolean))).sort();
          var rows = ids.map(function (s) { var x = makeupLeft(s, m); return [s, x.used + '回', x.left + '回']; }).filter(function (r, i) { return true; });
          return rows.length ? U.miniTable(['受講者', '使った振替（待ちを含む）', '残り'], rows, [1, 2]) : U.empty();
        })),
        U.card('受講者ごとの年間台帳', null, h('div', { class: 'btn-row tight' }, (function () { var sel = h('select', { 'aria-label': '受講者を選ぶ', on: { change: function (e) { A().ui.tutorStudent = e.target.value; A().render(); } } }, h('option', { value: '' }, '受講者を選ぶ'), students.map(function (s) { return h('option', { value: s, selected: s === who }, s); })); return sel; })(),
          (function () { var sel = h('select', { 'aria-label': '年を選ぶ', on: { change: function (e) { A().ui.tutorYear = e.target.value; A().render(); } } }); var cy = new Date().getFullYear(); for (var i = cy - 2; i <= cy + 1; i++) sel.appendChild(h('option', { value: String(i), selected: String(i) === String(y) }, i + '年')); return sel; })()),
          live(function () { return who ? yearLedger(who, y) : U.empty('受講者を選ぶと、1年分の請求と入金が出ます。'); })),
        U.card('教室の設定と連絡文', null, A().form([A().field('教室名（連絡文に入る）', A().set('mod.tutor.school', 'text')), A().field('月の振替回数（標準）', A().set('mod.tutor.makeupPerMonth', 'number', { min: 0 })),
          A().field('振替の連絡文', A().set('mod.tutor.tpl_makeup', 'textarea'), '空なら標準文。{受講者}{日付}{残り}{教室名}'), A().field('月謝の連絡文', A().set('mod.tutor.tpl_fee', 'textarea'), '{受講者}{月}{金額}{教室名}'), A().field('欠席確認の連絡文', A().set('mod.tutor.tpl_absent', 'textarea'), '{受講者}{日付}{教室名}')]))
      ];
    },
    summary: function (m) {
      var ls = St.rows('lessonSessions').filter(function (r) { return A().inMonth(r.date, m) && r.status !== '取消'; }), fees = St.rows('lessonFees').filter(function (r) { return r.month === m; });
      return U.miniTable(['授業予定', '出席済', '振替待ち', '請求額', '入金額', '未収の目安'], [[ls.length, ls.filter(function (r) { return r.status === '出席'; }).length, ls.filter(function (r) { return r.status === '振替待ち'; }).length,
        yen(A().sum(fees, function (r) { return r.amount; })), yen(A().sum(fees, function (r) { return r.paid; })), yen(fees.reduce(function (n, r) { return n + Math.max(0, num(r.amount) - num(r.paid)); }, 0))]]);
    },
    tables: [
      { key: 'lessonSessions', title: '授業・出欠・振替', sensitive: true, rowActions: sesActions, limit: 60,
        filter: function (r, m) { return !r.date || A().inMonth(r.date, m); }, sort: function (a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.start).localeCompare(String(b.start)); },
        fields: [date(), f('student', '受講者ID'), f('subject', '講座・内容'), f('start', '開始', 'time'), f('end', '終了', 'time'), f('room', '教室・場所'), f('status', '出欠', 'select', ['予定', '出席', '欠席', '振替待ち', '振替済', '取消']), f('due', '次回確認・振替期限', 'date'), f('done', '確認済', 'check'), note()] },
      { key: 'lessonStudents', title: '受講者台帳', sensitive: true, desc: '氏名・学校名・連絡先は入れず、IDで。連絡の方法だけを書いておくと、連絡文を送るときに迷いません。',
        fields: [f('student', '受講者ID'), f('course', 'コース'), f('weekday', '通う曜日'), f('time', '時間', 'time'), f('fee', '月謝', 'yen'), f('makeup', '月の振替上限', 'number'), f('contact', '連絡の方法（例：保護者へLINE）'), f('start', '入会日', 'date'), f('active', '在籍', 'check'), note()] },
      { key: 'lessonFees', title: '月謝・受講料の確認', sensitive: true, desc: '対象月ごとの請求額と累計入金額。完納確認をすると期限一覧から外れます。自動請求・決済・帳簿転記はしません。',
        filter: function (r, m) { return !r.month || r.month === m; },
        newRow: function (m) { return { month: m }; },
        extraCols: [{ label: '残り', value: function (r) { var d = num(r.amount) - num(r.paid); return d > 0 ? yen(d) : '—'; } }],
        fields: [f('month', '対象月', 'month'), f('student', '受講者ID'), f('amount', '請求額', 'yen'), f('paid', '累計入金額', 'yen'), f('due', '支払期限', 'date'), f('done', '完納確認', 'check'), note()] },
      { key: 'lessonFollowups', title: '教材準備・フォロー', sensitive: true, fields: [f('student', '受講者ID'), f('title', '準備・次の課題'), f('due', '確認期限', 'date'), f('done', '完了', 'check'), note()] }
    ],
    sample: function (H) {
      var st = Array.from({ length: 20 }, function (_, i) { return 'DEMO-S' + C.pad(i + 1); }), subj = ['英会話・初級', '英会話・中級', '数学（中1）', '数学（中2）', 'ピアノ・基礎', '書道', 'プログラミング入門', '国語（読解）'], times = [['16:00', '17:00'], ['17:10', '18:10'], ['18:20', '19:20'], ['19:30', '20:30']], ses = [];
      for (var d = -41; d <= 21; d++) { var day = H.day(d), wd = H.weekday(day); if (wd === 0 || wd === 3) continue; times.forEach(function (t) { if (H.chance(0.25)) return; var s = H.pick(st), status = d < 0 ? H.pick(['出席', '出席', '出席', '出席', '欠席', '振替待ち']) : '予定'; ses.push({ date: day, student: s, subject: H.pick(subj), start: t[0], end: t[1], room: H.pick(['教室A', '教室A', '教室B']), status: status, due: status === '振替待ち' ? H.day(H.int(3, 20)) : '', done: false, memo: status === '欠席' ? '当日連絡あり' : '' }); }); }
      return {
        lessonSessions: ses,
        lessonStudents: st.map(function (s, i) { return { student: s, course: subj[i % subj.length], weekday: '月火木金土'[i % 5], time: times[i % 4][0], fee: [8800, 9900, 11000][i % 3], makeup: i % 4 === 0 ? 1 : '', contact: H.pick(['保護者へLINE', '保護者へメール', '本人へメール']), start: H.day(-H.int(60, 700)), active: true, memo: '' }; }),
        lessonFees: [-5, -4, -3, -2, -1, 0].reduce(function (all, mo) { return all.concat(st.map(function (s, i) { var amt = [8800, 9900, 11000][i % 3], paid = mo < 0 ? (i === 10 && mo === -1 ? 0 : amt) : i < 9 ? amt : i === 9 ? 0 : Math.floor(amt / 2); return { month: H.month(mo), student: s, amount: amt, paid: paid, due: H.dom(27, mo), done: paid >= amt, memo: paid < amt ? '口座振替の結果を確認' : '' }; })); }, []),
        lessonFollowups: [['DEMO-S03', 'プリントを2枚用意', 2], ['DEMO-S05', '振替日の候補を伝える', 3], ['DEMO-S08', '発表会の曲を相談', 10], ['DEMO-S11', '教材の注文', 6], ['DEMO-S01', '保護者面談の日程調整', 12], ['DEMO-S13','体験レッスンの振り返り',4], ['DEMO-S14','次の課題の見本を用意',7], ['DEMO-S16','教材の受取確認',1], ['DEMO-S17','発表の練習日を相談',9], ['DEMO-S18','月謝の不足分を確認',3], ['DEMO-S19','振替候補の空き枠確認',5], ['DEMO-S20','来月の目標を相談',11]].map(function (x) { return { student: x[0], title: x[1], due: H.day(x[2]), done: false, memo: '' }; })
      };
    }
  });
})(this);
