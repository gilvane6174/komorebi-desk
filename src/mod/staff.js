/*
 * こもれびデスク — 支援の記録（現場の生活支援員・職業指導員・就労支援員・世話人など）v2.8
 * 支援記録（場面と定型文で書きやすく）・朝の様子チェック・作業の割り当て・申し送り（重要・既読）・
 * 個別支援計画とモニタリングの期限・ヒヤリハットと事故対応。利用者はIDで管理する。外部通信なし。サンプルはすべて架空。
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, KD = root.KD;
  function A() { return root.App; }
  var SCENES = ['作業', '食事', '送迎', '休憩・余暇', '面談', '通院同行', '生活支援', 'その他'];
  function f(k, label, type, extra) { var o = { k: k, label: label, type: type || 'text' }; if (extra) Object.keys(extra).forEach(function (x) { o[x] = extra[x]; }); return o; }
  var ID = f('person', '利用者ID');
  var P_OBS = ['作業開始から', '分、手を止めずに続けた', '休憩を自分から取った', '声をかけると顔を上げた', '手順書を見ながら進めていた', '表情は落ち着いていた', '周りの音を気にする様子があった', '昼食は完食'];
  var P_SUP = ['手順を写真で示した', '休憩を提案した', '2つの中から選んでもらった', '進み具合を一緒に確認した', '静かな席を用意した', '見本を横に置いた', '本人の希望を聞いて予定を変えた'];
  var P_NEXT = ['次回も同じ方法で', '面談で本人の希望を聞く', '午後の様子を申し送る', '様子を見て継続', '家族への連絡は本人の同意後'];

  var cols = {
    supportRecords: { title: '支援記録・引継ぎ', sensitive: true, desc: '「見たこと・聞いたこと（事実）」と「見立て」を分けて書くと、誰が読んでも同じ意味になります。本人の言葉は「」でそのまま。定型文のボタンで書き足せます。',
      fields: [f('date', '日付', 'date'), f('time', '時刻', 'time'), ID, f('scene', '場面', 'select', { options: SCENES }), f('author', '記録者ID'), f('observed', '観察した事実', 'textarea', { phrases: P_OBS }),
        f('wish', '本人の意思・発言', 'textarea', { phrases: ['「」', '（発言なし。身ぶりで伝えた）'] }), f('support', '実施した支援', 'textarea', { phrases: P_SUP }), f('view', '見立て・気づき', 'textarea'),
        f('next', '次回の対応', 'textarea', { phrases: P_NEXT }), f('due', '確認期限', 'date'), f('done', '確認済', 'check')] },
    staffChecks: { title: '朝の様子チェック', sensitive: true, desc: '到着時の様子を短く。本人の申告をそのまま。気になるときは支援記録に詳しく。',
      fields: [f('date', '日付', 'date'), ID, f('sleep', '睡眠', 'select', { options: ['', 'よく眠れた', 'ふつう', 'あまり眠れない'] }), f('meal', '朝ごはん', 'select', { options: ['', '食べた', '少し', '食べていない'] }),
        f('mood', '気分(1-5)', 'select', { options: ['', '1', '2', '3', '4', '5'] }), f('meds', '服薬', 'select', { options: ['', '済', 'まだ', 'なし'] }), f('note', 'ひとこと')] },
    staffAssign: { title: '作業の割り当て', desc: 'その日の作業・目標・できた量。工賃や計画の振り返りに使えます。',
      fields: [f('date', '日付', 'date'), ID, f('work', '作業'), f('target', '目標'), f('result', 'できた量・様子'), f('done', '完了', 'check')] },
    staffHandover: { title: '申し送り', desc: '次の勤務の人・チームへ。大事なものは「重要」。読んだら「既読」に。',
      fields: [f('date', '日付', 'date'), f('from', '送り手（職員ID）'), f('to', '宛先'), f('body', '内容', 'textarea'), f('important', '重要', 'check'), f('read', '既読', 'check'), f('readBy', '読んだ人（職員ID）')] },
    supportPlans: { title: '個別支援計画・モニタリング期限（現場用）', sensitive: true, desc: '現場で目標と支援内容を確認するための控え。正式な計画は事業所の様式で。',
      fields: [ID, f('title', '本人の目標'), f('action', '支援内容', 'textarea'), f('consent', '本人確認・同意の記録'), f('due', '見直し予定日', 'date'), f('done', '実施済', 'check'), f('memo', 'メモ', 'textarea')] },
    incidents: { title: 'ヒヤリハット・事故対応', sensitive: true, desc: '責めるためではなく、次を防ぐための記録。事実・原因・対応・再発防止を分けて書きます。',
      fields: [f('date', '日付', 'date'), f('time', '時刻', 'time'), ID, f('place', '場所'), f('level', '区分', 'select', { options: ['ヒヤリハット', '軽微な事故', '報告が必要な事故'] }),
        f('fact', '事実・状況', 'textarea'), f('cause', '原因', 'textarea'), f('response', '初動対応', 'textarea'), f('prevention', '再発防止', 'textarea'),
        f('reported', '家族・市町村への報告', 'select', { options: ['不要', '済', '未'] }), f('due', '確認期限', 'date'), f('done', '対応済', 'check')] }
  };
  var TIPS = [
    '事実と解釈を分ける：「落ち着きがなかった」より「5分ごとに席を立った」。',
    '本人の言葉はそのまま「」で残す。言い換えると意味が変わることがある。',
    'できたこと・工夫したことも書く。困りごとだけの記録にしない。',
    '「問題行動」「わがまま」などのラベルは使わず、場面・きっかけ・その後を書く。',
    '支援した内容と、そのあとの本人の反応までをひとまとまりに。',
    '他の利用者の名前やIDを、別の人の記録に書かない。'
  ];
  function ids() {
    if (KD.facility) return KD.facility.users();
    var s = {}; ['supportRecords', 'staffChecks', 'staffAssign', 'supportPlans'].forEach(function (k) { St.rows(k).forEach(function (r) { if (r.person) s[r.person] = 1; }); });
    return Object.keys(s).sort();
  }
  function concern(r) { return (num(r.mood) && num(r.mood) <= 2) || r.sleep === 'あまり眠れない' || r.meal === '食べていない' || r.meds === 'まだ'; }
  function concernText(r) { return [r.mood && num(r.mood) <= 2 ? '気分' + r.mood : '', r.sleep === 'あまり眠れない' ? '睡眠' : '', r.meal === '食べていない' ? '朝食なし' : '', r.meds === 'まだ' ? '服薬まだ' : ''].filter(Boolean).join('・'); }
  function sample(H) {
    var list = []; for (var i = 1; i <= 12; i++) list.push('DEMO-U' + C.pad(i));
    var rec = [], ho = [], ch = [], as = [];
    var OBS = ['午前の作業に予定どおり参加。休憩を2回とった。', '到着が30分遅れた。表情は落ち着いていた。', '昼食後に机に伏せていた。声をかけると顔を上げた。', '袋づめ作業を一人で最後まで行った。', '周囲の音を気にして耳をふさぐ場面があった。', '新しい作業の見本を見て、2回目から手順どおりにできた。'],
      WISH = ['「午後は静かな席がいい」', '「明日は休むかもしれない」', '「この作業は続けたい」', '「次は別の作業もやってみたい」', '（発言なし。指さしで席を選んだ）', '「帰りのバスの時間を確認したい」'],
      SUP = ['静かな席を用意し、手順を紙で示した', '到着後に今日の予定を一緒に確認した', '休憩の場所を案内し、再開時間を本人と決めた', '完成数を一緒に数えて記録した', 'イヤーマフの使用を提案し、本人が選んだ', '見本を横に置き、最初の1回だけ一緒に行った'];
    for (var d = -29; d <= 0; d++) {
      var date = H.day(d), wd = H.weekday(date); if (wd === 0 || wd === 6) continue;
      list.forEach(function (u) {
        if (H.chance(0.12)) return;
        ch.push({ date: date, person: u, sleep: H.pick(['よく眠れた', 'ふつう', 'ふつう', 'あまり眠れない']), meal: H.pick(['食べた', '食べた', '少し', '食べていない']), mood: String(H.int(2, 5)), meds: H.pick(['済', '済', 'なし', 'まだ']), note: H.pick(['', '', '雨で少しだるい', '昨日楽しいことがあった', '']) });
        as.push({ date: date, person: u, work: H.pick(['検品', '袋づめ', 'シール貼り', 'データ入力', '清掃', 'パンの成形']), target: H.pick(['100個', '50個', '30分続ける', '午前中']), result: d === 0 ? '' : H.pick(['目標どおり', '8割ほど', '途中で休憩して完了', '集中できていた']), done: d < 0 && H.chance(0.85) });
        if (H.chance(0.3)) { var k = H.int(0, 5); rec.push({ date: date, time: H.pick(['10:30', '11:45', '13:20', '14:40']), person: u, scene: H.pick(SCENES.slice(0, 5)), author: H.pick(['DEMO-S02', 'DEMO-S03', 'DEMO-S04']), observed: OBS[k], wish: WISH[k], support: SUP[k], view: H.pick(['手順が分かると集中が続く様子', '睡眠不足の影響かもしれない（本人に確認）', '新しいことへの意欲が見える', '']), next: H.pick(P_NEXT), due: d < -7 ? '' : H.day(H.int(1, 10)), done: d < -7 }); }
      });
      if (H.chance(0.7)) ho.push({ date: date, from: H.pick(['DEMO-S02', 'DEMO-S03', 'DEMO-S04']), to: '全員', body: H.pick(['DEMO-U03さん、午後に通院のため14時に早退予定', '作業室のプリンターのインクが残りわずか', 'DEMO-U05さん、明日は家族の送迎で来所', '送迎2便の出発を10分早める（道路工事）']), important: H.chance(0.3), read: d < -1, readBy: d < -1 ? 'DEMO-S02, DEMO-S03' : '' });
    }
    return { supportRecords: rec, staffChecks: ch, staffAssign: as, staffHandover: ho,
      supportPlans: list.slice(0, 12).map(function (id, i) { return { person: id, title: ['週4日の通所を続ける', '作業の手順を自分で確認できる', '困ったときに職員へ伝えられる', '一般就労に向けて体力をつける', '昼食後の休憩を自分で取れる', '新しい作業を月1つ試す'][i % 6], action: ['通所日の体調確認と記録', '手順書を写真と短い文で用意', '伝え方カードを一緒に作る', '週1回の作業時間延長を本人と相談', '休憩の合図を決める', '見本と練習時間を用意'][i % 6], consent: '本人と面談し内容を確認（架空の記録）', due: H.day([12, 40, 75, 100, 150, 170][i % 6]), done: false, memo: '' }; }),
      incidents: [{ date: H.day(-9), time: '10:20', person: 'DEMO-U02', place: '作業室', level: 'ヒヤリハット', fact: '床に置いた段ボールにつまずきそうになった。けがなし。', cause: '通路に資材を仮置きしていた', response: '声をかけて資材を移動', prevention: '仮置きの場所を床に表示する', reported: '不要', due: H.day(5), done: false },
        { date: H.day(-20), time: '12:05', person: 'DEMO-U05', place: '食堂', level: '軽微な事故', fact: 'お茶をこぼして手に少しかかった（赤みなし）。', cause: '湯のみが熱く持ちにくかった', response: '流水で冷やし様子を確認', prevention: '取っ手付きのカップに変更', reported: '未', due: H.day(-6), done: false }] };
  }
  function view() {
    var v = h('div'), live = A().live, today = C.today(), pid = A().ui.sUid || '', all = ids();
    var sel = h('select', { 'aria-label': '利用者で絞り込み', on: { change: function (e) { A().ui.sUid = e.target.value; A().render(); } } }, h('option', { value: '' }, 'すべての利用者'), all.map(function (u) { return h('option', { value: u, selected: u === pid }, u); }));
    function byP(r) { return !pid || r.person === pid; }
    v.appendChild(A().viewHead('支援の記録', '現場の支援者向け。今日の様子・作業・支援記録・申し送りを、短い時間で残せるように。正式な個別支援計画の代わりではありません。', sel));
    v.appendChild(A().grid(
      U.card('今日の様子（気になる人）', { cls: 'accent' }, live(function () {
        var list = St.rows('staffChecks').filter(function (r) { return r.date === today && byP(r) && concern(r); });
        return list.length ? h('ul', { class: 'list' }, list.map(function (r) { return h('li', null, h('strong', null, r.person), '：', concernText(r), r.note ? '（' + r.note + '）' : ''); })) : U.empty('今日は気になる記録はありません。');
      })),
      U.card('未読の申し送り', null, live(function () {
        var list = St.rows('staffHandover').filter(function (r) { return !r.read; }).sort(function (a, b) { return (b.important ? 1 : 0) - (a.important ? 1 : 0) || String(b.date).localeCompare(String(a.date)); });
        return list.length ? h('ul', { class: 'list' }, list.slice(0, 8).map(function (r) { return h('li', null, r.important ? U.badge('重要', 'bad') : null, ' ', (r.date || '') + ' ' + (r.from || '') + '：' + (r.body || ''), ' ', h('button', { type: 'button', class: 'btn tiny ghost', on: { click: function () { St.setRow('staffHandover', r._id, { read: true }); U.toast('既読にしました', { label: '元に戻す', fn: function () { St.undo(); } }); } } }, '既読にする')); })) : U.empty('未読はありません。');
      })),
      U.card('今日の作業', null, live(function () {
        var list = St.rows('staffAssign').filter(function (r) { return r.date === today && byP(r); });
        return list.length ? U.miniTable(['利用者ID', '作業', '目標', '完了'], list.map(function (r) { return [r.person, r.work, r.target, r.done ? '✓' : '']; })) : U.empty('今日の割り当てはまだありません。');
      })),
      U.card('記録のコツ', null, h('ul', { class: 'list small' }, TIPS.map(function (t) { return h('li', null, t); })))));
    function allRows(key, extra) { return h('button', { type: 'button', class: 'btn small', on: { click: function () {
      var done = {}; St.rows(key).forEach(function (r) { if (r.date === today) done[r.person] = 1; });
      var add = all.filter(function (u) { return !done[u]; }).map(function (u) { var o = { date: today, person: u }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; });
      if (!add.length) { U.toast('今日の行はすべてあります'); return; } St.addRows(key, add); U.toast(add.length + '人分の行を追加しました', { label: '元に戻す', fn: function () { St.undo(); } });
    } } }, '今日の行を全員分つくる'); }
    v.appendChild(U.table('supportRecords', { filter: byP, sort: function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.time).localeCompare(String(a.time)); },
      newRow: function () { var n = new Date(); return { date: today, time: C.pad(n.getHours()) + ':' + C.pad(n.getMinutes()), person: pid, scene: '作業', observed: '', wish: '' }; },
      header: h('p', { class: 'muted small' }, '「＋ 追加」で記録用の画面が開きます。定型文のボタンで書き足せます。音声入力（パソコンやスマホの機能）も使えます。') }));
    v.appendChild(U.table('staffChecks', { filter: function (r) { return (!r.date || C.daysUntil(r.date) >= -6) && byP(r); }, sort: function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(a.person).localeCompare(String(b.person)); }, newRow: function () { return { date: today, person: pid }; },
      header: h('div', { class: 'btn-row tight' }, allRows('staffChecks')),
      extraCols: [{ label: '気になる点', value: function (r) { return concern(r) ? concernText(r) : '—'; } }] }));
    v.appendChild(U.table('staffAssign', { filter: function (r) { return (!r.date || C.daysUntil(r.date) >= -6) && byP(r); }, sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: today, person: pid }; },
      header: h('div', { class: 'btn-row tight' }, allRows('staffAssign')) }));
    v.appendChild(U.table('staffHandover', { sort: function (a, b) { return (a.read ? 1 : 0) - (b.read ? 1 : 0) || String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: today, to: '全員' }; } }));
    v.appendChild(U.table('supportPlans', { filter: byP, sort: function (a, b) { return String(a.due).localeCompare(String(b.due)); }, newRow: function () { return { person: pid }; } }));
    v.appendChild(incidentReports());
    v.appendChild(U.table('incidents', { filter: byP, sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: today, person: pid, level: 'ヒヤリハット', reported: '不要' }; } }));
    return v;
  }
  var INCIDENT_TEMPLATE='ヒヤリハット・事故報告書\n日付：{date}　時刻：{time}\n利用者ID：{person}\n場所：{place}　区分：{level}\n発生した事実：{fact}\n原因の検討：{cause}\n初動対応：{response}\n再発防止策：{prevention}\n報告状況：{reported}\n確認期限：{due}　対応完了：{done}';
  function incidentReports() {
    return U.card('事故・ヒヤリハット個別報告書',{wide:true,desc:'一件ずつ印刷できます。帳票の文章は編集して保存できます。外部提出は自動では行いません。'},
      root.KDReports.editor('staff','incidentTemplate','帳票テンプレート（{date}などの差込項目が使えます）',INCIDENT_TEMPLATE),
      h('div',{class:'btn-row'},St.rows('incidents').slice().sort(function(a,b){return String(b.date).localeCompare(String(a.date));}).map(function(r){return h('button',{type:'button',class:'btn small ghost',on:{click:function(){root.KDReports.report('事故・ヒヤリハット報告書',root.KDReports.format(St.modSettings('staff').incidentTemplate||INCIDENT_TEMPLATE,r));}}},(r.date||'日付なし')+' '+(r.person||'対象未入力')+' 印刷');})));
  }
  function home() {
    return [A().homeCard('支援：未読の申し送り', { action: A().navBtn('staff', '記録を開く'), easy: true }, A().live(function () {
      var list = St.rows('staffHandover').filter(function (r) { return !r.read; });
      return list.length ? h('ul', { class: 'list' }, list.slice(0, 4).map(function (r) { return h('li', null, r.important ? U.badge('重要', 'bad') : null, ' ', r.body); })) : U.empty('未読はありません。');
    })), A().homeCard('今日の様子（気になる人）', { easy: true }, A().live(function () {
      var list = St.rows('staffChecks').filter(function (r) { return r.date === C.today() && concern(r); });
      return list.length ? h('ul', { class: 'list' }, list.map(function (r) { return h('li', null, r.person + '：' + concernText(r)); })) : U.empty('気になる記録はありません。');
    }))];
  }
  KD.mod({ id: 'staff', title: '支援の記録', icon: '支', order: 8, collections: cols, sample: sample, view: view, home: home });
})(this);
