/*
 * こもれびデスク — わたしのくらし（福祉施設の利用者本人）v2.8
 * ・最初は漢字まじり。ホームの「ひらがなにする」で、ひらがな表示に切り替えられる（選んだ表示は保存）
 * ・「ひとつずつ」：きもち → 今日の予定 → できたこと → 伝えたいこと を、1画面に1つずつ。いつでも飛ばせる
 * ・予定・気持ち・できたこと・伝えたいこと・作業と工賃・おくすり・収入と支出を、自分の言葉で残す
 * できた数で人を評価するためのものではない。連続記録の日数は数えない。外部通信なし。サンプルはすべて架空。
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, yen = C.yen, KD = root.KD;
  function A() { return root.App; }
  var K = function (a, b) { return U.k(a, b); };
  function f(k, label, kana, type, extra) { var o = { k: k, label: label, kana: kana, type: type || 'text' }; if (extra) Object.keys(extra).forEach(function (x) { o[x] = extra[x]; }); return o; }
  var DATE = function () { return f('date', '日付', 'ひづけ', 'date'); };
  // 気持ちの選択肢（保存する値・表示・ひらがな表示・色）
  var MOODS = [['元気', '元気', 'げんき', 'good'], ['ふつう', 'ふつう', 'ふつう', 'mid'], ['疲れた', '疲れた', 'つかれた', 'mid'], ['しんどい', 'しんどい', 'しんどい', 'bad'], ['イライラ', 'イライラ', 'いらいら', 'bad'], ['不安', '不安', 'ふあん', 'bad'], ['言いたくない', '言いたくない', 'いいたくない', 'quiet']];

  var cols = {
    myPlans: { title: '予定', kanaTitle: 'よてい', sensitive: true, desc: '通う日・休み・病院・やること。',
      fields: [DATE(), f('title', '何をする？', 'なにをする？'), f('due', 'いつまで？', 'いつまで？', 'date', { hint: '無理に急がないでね', hintKana: 'むりに いそがないでね' }), f('done', 'できた', 'できた', 'check'), f('memo', '手伝ってほしいこと', 'てつだってほしいこと', 'textarea')] },
    myFeelings: { title: '気持ちと体', kanaTitle: 'きもちと からだ', sensitive: true, desc: '選ぶだけで大丈夫。言いたくない日は「言いたくない」で。',
      fields: [DATE(), f('mood', '気持ち', 'きもち', 'select', { options: [''].concat(MOODS.map(function (m) { return m[0]; })) }), f('body', '体', 'からだ', 'select', { options: ['', '痛いところはない', '頭が痛い', 'おなかが痛い', '眠い', 'そのほか'] }),
        f('sleep', '眠り', 'ねむり', 'select', { options: ['', 'よく寝た', 'ふつう', 'あまり寝ていない'] }), f('memo', 'ひとこと', 'ひとこと')] },
    myDone: { title: 'できたこと', kanaTitle: 'できたこと', desc: '小さなことでも大丈夫。あとで見返すと力になります。',
      fields: [DATE(), f('text', 'できたこと', 'できたこと')] },
    myWishes: { title: 'やりたいこと・伝えたいこと', kanaTitle: 'やりたいこと・つたえたいこと', sensitive: true, desc: '忘れないようにメモ。支援者さんにこの画面を見せてもいいです。',
      fields: [DATE(), f('title', 'やりたいこと・伝えたいこと', 'やりたいこと・つたえたいこと'), f('choice', '自分で選んだこと', 'じぶんで えらんだこと'), f('communicate', '伝えやすい方法', 'つたえやすい ほうほう'), f('help', 'どうしてほしい？', 'どうしてほしい？'),
        f('to', 'だれに', 'だれに', 'select', { options: ['', '支援者', '家族', '病院', 'そのほか'] }), f('status', '話した？', 'はなした？', 'select', { options: ['', 'まだ', '話した'] }), f('memo', '伝えるメモ', 'つたえる メモ', 'textarea')] },
    myWork: { title: '通所・作業', kanaTitle: 'つうしょ・さぎょう', sensitive: true, desc: '作業と時間、もらった工賃のメモ。',
      fields: [DATE(), f('activity', '作業', 'さぎょう'), f('hours', '時間', 'じかん', 'number'), f('wage', 'もらった工賃', 'もらった こうちん', 'yen'), f('memo', '振り返り', 'ふりかえり', 'textarea')] },
    myMeds: { title: 'おくすり', kanaTitle: 'おくすり', sensitive: true, desc: '飲んだらチェック。薬の名前は書かなくて大丈夫。量や種類のことは、必ず医師・薬剤師に相談してください。',
      fields: [DATE(), f('slot', 'いつ', 'いつ', 'select', { options: ['朝', '昼', '夜', '寝る前'] }), f('taken', '飲んだ', 'のんだ', 'check'), f('name','薬の呼び名（任意）','くすりの よびな（にんい）'), f('memo','ひとこと','ひとこと')] },
    myPocket: { title: '収入・支出の記録', kanaTitle: 'しゅうにゅう・ししゅつ', desc: '入ったお金・使ったお金。',
      fields: [DATE(), f('item', '何に', 'なにに'), f('inAmt', '入った', 'はいった', 'yen'), f('outAmt', '使った', 'つかった', 'yen')] }
  };
  var SLOTKANA = { '朝': 'あさ', '昼': 'ひる', '夜': 'よる', '寝る前': 'ねるまえ' };
  function moodLabel(v) { var m = MOODS.filter(function (x) { return x[0] === v; })[0]; return m ? K(m[1], m[2]) : v; }
  function todayRow(key) { var t = C.today(); return St.rows(key).filter(function (r) { return r.date === t; })[0]; }

  // ---- 気持ちボタン ----
  function moodButtons() {
    var rec = todayRow('myFeelings');
    return h('div', { class: 'mood-pick' }, h('p', { class: 'big-text' }, K('今日の気持ちは？', 'きょうの きもちは？'), rec && rec.mood ? h('strong', null, K('　いま：', '　いま：') + moodLabel(rec.mood)) : null),
      h('div', { class: 'mood-grid' }, MOODS.map(function (m) {
        return h('button', { type: 'button', class: 'btn big mood ' + m[3], 'aria-pressed': rec && rec.mood === m[0] ? 'true' : 'false', on: { click: function () {
          var r = todayRow('myFeelings');
          if (r) St.setRow('myFeelings', r._id, { mood: m[0] }); else St.addRow('myFeelings', { date: C.today(), mood: m[0] });
          U.toast(K('「' + m[1] + '」を記録しました', '「' + m[2] + '」を きろく しました'));
        } } }, K(m[1], m[2]));
      })));
  }
  // ---- 今日の予定 ----
  function todayPlans() {
    var t = C.today(), list = St.rows('myPlans').filter(function (r) { return r.date === t || (r.due === t && !r.done); });
    var inp = h('input', { type: 'text', maxlength: '100', 'aria-label': K('予定を書く', 'よていを かく'), placeholder: K('例：買い物に行く', 'れい：かいものに いく') });
    return h('div', null, list.length ? h('ul', { class: 'plan-check' }, list.map(function (r) {
      return h('li', null, h('button', { type: 'button', class: 'btn big plan-toggle' + (r.done ? ' good' : ''), 'aria-pressed': r.done ? 'true' : 'false', on: { click: function () { St.setRow('myPlans', r._id, { done: !r.done }); } } }, (r.done ? '✓ ' : '') + (r.title || K('（名前のない予定）', '（なまえの ない よてい）'))),
        r.done ? h('span', { class: 'small muted' }, K('　できた', '　できた')) : null);
    })) : h('p', null, K('今日の予定はありません。', 'きょうの よていは ありません。')),
      h('div', { class: 'quick-add' }, inp, h('button', { type: 'button', class: 'btn', on: { click: function () { if (!inp.value.trim()) { inp.focus(); return; } St.addRow('myPlans', { date: t, title: inp.value.trim() }); U.toast(K('予定を追加しました', 'よていを ついか しました')); } } }, K('追加', 'ついか'))),
      h('p', { class: 'small muted' }, K('無理に急がなくて大丈夫。', 'むりに いそがなくて だいじょうぶ。')));
  }
  // ---- できたこと ----
  function doneBox() {
    var inp = h('input', { type: 'text', maxlength: '200', 'aria-label': K('できたこと', 'できたこと'), placeholder: K('例：朝、時間どおりに起きた', 'れい：あさ じかんどおりに おきた') });
    return h('div', null, h('div', { class: 'quick-add' }, inp, h('button', { type: 'button', class: 'btn', on: { click: function () {
      if (!inp.value.trim()) { inp.focus(); return; }
      St.addRow('myDone', { date: C.today(), text: inp.value.trim() }); U.toast(K('記録しました', 'きろく しました'));
    } } }, K('記録する', 'きろく する'))), A().live(function () {
      var n = St.rows('myDone').filter(function (r) { return C.daysUntil(r.date) >= -30; }).length;
      return n ? h('p', null, K('この30日で ', 'この30にちで '), h('strong', null, n), K(' 個のできたことがあります。', ' こ の できたことが あります。')) : null;
    }));
  }
  // ---- 伝えたいこと ----
  function askBox() {
    var inp = h('textarea', { rows: 3, maxlength: '500', 'aria-label': K('伝えたいこと', 'つたえたいこと'), placeholder: K('例：作業の時間を少し短くしたい', 'れい：さぎょうの じかんを すこし みじかくしたい') });
    var to = h('select', { 'aria-label': K('だれに', 'だれに') }, ['支援者', '家族', '病院', 'そのほか'].map(function (x) { return h('option', { value: x }, x); }));
    return h('div', null, inp, h('div', { class: 'quick-add' }, h('label', { class: 'small' }, K('だれに：', 'だれに：'), to), h('button', { type: 'button', class: 'btn', on: { click: function () {
      if (!inp.value.trim()) { inp.focus(); return; }
      St.addRow('myWishes', { date: C.today(), title: inp.value.trim(), to: to.value, status: 'まだ' }); U.toast(K('メモしました。見せたいときに開けます', 'メモ しました。みせたい ときに ひらけます'));
    } } }, K('メモする', 'メモ する'))));
  }
  // ---- ひとつずつ（R21） ----
  var STEPS = [['気持ち', 'きもち', moodButtons], ['今日の予定', 'きょうの よてい', todayPlans], ['できたこと', 'できたこと', doneBox], ['伝えたいこと', 'つたえたいこと', askBox]];
  function stepper() {
    var i = Math.max(0, Math.min(STEPS.length, Number(A().ui.clientStep) || 0));
    function to(n) { A().ui.clientStep = n; A().render(); var el = root.document.querySelector('.stepper'); if (el) el.scrollIntoView({ block: 'nearest' }); }
    if (i >= STEPS.length) return h('div', { class: 'stepper done-step' }, h('p', { class: 'big-text' }, K('おつかれさま。今日の記録はここまでで大丈夫。', 'おつかれさま。きょうの きろくは ここまでで だいじょうぶ。')),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn big ghost', on: { click: function () { to(0); } } }, K('最初から見る', 'さいしょから みる'))));
    var s = STEPS[i];
    return h('div', { class: 'stepper' },
      h('ol', { class: 'step-dots', 'aria-label': K('すすみぐあい', 'すすみぐあい') }, STEPS.map(function (x, n) { return h('li', { class: n === i ? 'on' : n < i ? 'past' : '', 'aria-current': n === i ? 'step' : null }, h('button', { type: 'button', on: { click: function () { to(n); } } }, K(x[0], x[1]))); })),
      h('div', { class: 'step-body' }, h('h3', null, (i + 1) + ' / ' + STEPS.length + '　' + K(s[0], s[1])), s[2]()),
      h('div', { class: 'btn-row step-nav' },
        i > 0 ? h('button', { type: 'button', class: 'btn big ghost', on: { click: function () { to(i - 1); } } }, K('もどる', 'もどる')) : null,
        h('button', { type: 'button', class: 'btn big', on: { click: function () { to(i + 1); } } }, i === STEPS.length - 1 ? K('おわる', 'おわる') : K('つぎへ', 'つぎへ')),
        i < STEPS.length - 1 ? h('button', { type: 'button', class: 'btn ghost', on: { click: function () { to(i + 1); } } }, K('とばす', 'とばす')) : null));
  }
  function medsToday() {
    var t = C.today(), list = St.rows('myMeds').filter(function (r) { return r.date === t; });
    return list.length ? h('div', { class: 'btn-row' }, list.map(function (r) { return h('button', { type: 'button', class: 'btn big ' + (r.taken ? 'good' : 'mid'), 'aria-pressed': r.taken ? 'true' : 'false', on: { click: function () { St.setRow('myMeds', r._id, { taken: !r.taken }); } } }, K(r.slot, SLOTKANA[r.slot] || r.slot) + (r.taken ? K('：飲んだ', '：のんだ') : K('：まだ', '：まだ'))); }))
      : h('button', { type: 'button', class: 'btn', on: { click: function () { St.addRows('myMeds', [{ date: t, slot: '朝' }, { date: t, slot: '夜' }]); } } }, K('今日のチェックを作る', 'きょうの チェックを つくる'));
  }

  function sample(H) {
    var t = 0, plans = [[0, '通所する（午前）', 0, false], [0, '午後に買い物リストを作る', 0, false], [0, '薬を飲む（夜）', 0, false], [1, '散歩を15分', 1, false], [3, '通院の予約を確認する', 5, false], [6, '書類を事業所に渡す', 10, false], [-2, '部屋の片づけ（机の上だけ）', -1, true], [-4, '洗濯', -4, true], [2,'翌週の持ち物を確認',2,false], [4,'図書館へ本を返す',5,false], [5,'作業用のノートを買う',6,false], [8,'面談で次の目標を相談',8,false], [-3,'休憩時間に水分を取れた',-3,true], [-6,'買い物メモを作った',-6,true]], help = ['', '', '声をかけてほしい', '一緒に確認してほしい', ''];
    var feel = [], done = [], meds = [], pocket = [], work = [];
    for (var d = -59; d <= -1; d++) {
      var date = H.day(d);
      if (H.chance(0.8)) feel.push({ date: date, mood: H.pick(['元気', 'ふつう', 'ふつう', '疲れた', 'しんどい', '不安', '言いたくない']), body: H.pick(['痛いところはない', '痛いところはない', '眠い', '頭が痛い']), sleep: H.pick(['よく寝た', 'ふつう', 'あまり寝ていない']), memo: '' });
      if (H.chance(0.3)) done.push({ date: date, text: H.pick(['朝、時間どおりに起きた', '作業を最後までやった', 'あいさつができた', '部屋を片づけた', '自分でごはんを作った', '困ったことを伝えられた']) });
      if (d >= -13) ['朝', '夜'].forEach(function (s) { meds.push({ date: date, slot: s, taken: H.chance(0.9), name: s==='朝'?'架空の朝の服薬確認':'架空の夜の服薬確認',memo:'架空サンプル（処方の指示ではありません）' }); });
      if (H.chance(0.2)) pocket.push({ date: date, item: H.pick(['おやつ', '飲み物', '電車', 'ノート', '本']), inAmt: 0, outAmt: H.pick([120, 150, 300, 500, 680]) });
      var wd = H.weekday(date); if (wd !== 0 && wd !== 6 && d >= -44 && H.chance(0.8)) { var hrs = H.pick([3, 3.5, 4, 4]); work.push({ date: date, activity: H.pick(['袋づめ', '部品の組み立て', '清掃', 'シール貼り', 'パン工房の手伝い']), hours: hrs, wage: H.round(hrs * 240, 10), memo: H.pick(['', '少し疲れた', 'ていねいにできた', '休憩を2回とった', '']) }); }
    }
    pocket.push({ date: H.day(-H.int(1, 20)), item: '工賃', inAmt: H.round(H.int(12000, 18000), 100), outAmt: 0 });
    return {
      myPlans: plans.map(function (p, i) { return { date: H.day(p[0]), title: p[1], due: H.day(p[2]), done: p[3], memo: help[i % help.length] }; }),
      myFeelings: feel, myDone: done, myMeds: meds, myPocket: pocket, myWork: work,
      myWishes: [{ date: H.day(-6), title: '午後は静かな席で作業したい', choice: '窓ぎわの席', communicate: '紙に書いて渡す', help: '席を空けておいてほしい', to: '支援者', status: '話した', memo: '' }, { date: H.day(-3), title: '新しい作業を試してみたい', choice: '袋づめ作業', communicate: '口で伝える', help: '最初の1回は見本を見せてほしい', to: '支援者', status: 'まだ', memo: '' }, { date: H.day(-1), title: '来月は週4日にしたい', choice: '火曜を休みにする', communicate: '面談で話す', help: '面談の日を決めてほしい', to: '支援者', status: 'まだ', memo: '体調を見ながら' }]
    };
  }
  function view() {
    var v = h('div'), live = A().live;
    v.appendChild(A().viewHead(K('わたしのくらし', 'わたしの くらし'), K('予定・気持ち・できたこと・伝えたいことを、自分の言葉で残せます。', 'よてい・きもち・できたこと・つたえたいことを、じぶんの ことばで のこせます。')));
    v.appendChild(U.card(K('ひとつずつ記録する', 'ひとつずつ きろく する'), { wide: true, cls: 'accent step-card' }, live(stepper)));
    v.appendChild(A().grid(
      U.card(K('おくすり（今日）', 'おくすり（きょう）'), null, live(medsToday)),
      U.card(K('収入・支出', 'しゅうにゅう・ししゅつ'), null, live(function () { var l = St.rows('myPocket'); return h('p', { class: 'big-text' }, K('残り：', 'のこり：'), h('strong', null, yen(A().sum(l, function (r) { return r.inAmt; }) - A().sum(l, function (r) { return r.outAmt; })))); })),
      U.card(K('自分のペースで使う', 'じぶんの ペースで つかう'), { wide: true }, h('ul', { class: 'list' },
        h('li', null, K('全部を書かなくても大丈夫。書きたくないことは空欄のままでかまいません。', 'ぜんぶ かかなくても だいじょうぶ。かきたくない ことは、からっぽの ままで いいです。')),
        h('li', null, K('できた数で人を評価するためのものではありません。休む・やめる・手伝ってもらうことも選べます。', 'できた かずで ひとを きめる ものでは ありません。やすむ・やめる・てつだって もらうことも えらべます。')),
        h('li', null, K('下の一覧は、支援者さんや家族と一緒に見るときに使えます。', 'したの いちらんは、しえんしゃさんや かぞくと いっしょに みるときに つかえます。')),
        h('li', null, K('このツールは、インターネットに記録を送りません。', 'この ツールは、インターネットに きろくを おくりません。')),
        h('li', null, K('「お金を払って」「パスワードを教えて」というメールや電話は、だれかに相談してから。', '「おかねを はらって」「パスワードを おしえて」という メールや でんわは、だれかに そうだん してから。'))))));
    var today = C.today();
    v.appendChild(U.table('myPlans', { sort: function (a, b) { return String(a.date).localeCompare(String(b.date)); }, filter: function (r) { return !r.date || C.daysUntil(r.date) >= -14; }, newRow: function () { return { date: today }; } }));
    v.appendChild(U.table('myFeelings', { sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, limit: 14, newRow: function () { return { date: today }; } }));
    v.appendChild(U.table('myDone', { sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, limit: 20, newRow: function () { return { date: today }; } }));
    v.appendChild(U.table('myWishes', { sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: today, status: 'まだ' }; } }));
    v.appendChild(U.table('myWork', { sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: today }; } }));
    v.appendChild(U.table('myMeds', { filter: function (r) { return !r.date || C.daysUntil(r.date) >= -6; }, sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: today, slot: '朝' }; } }));
    v.appendChild(U.table('myPocket', { sort: function (a, b) { return String(b.date).localeCompare(String(a.date)); }, newRow: function () { return { date: today }; } }));
    return v;
  }
  function home() {
    if (KD.edition !== 'user') return [A().homeCard('わたしのくらし', { easy: true, action: A().navBtn('client', '開く') }, A().live(function () { var n = St.rows('myPlans').filter(function (r) { return !r.done; }).length; return U.stat('まだの予定', n + '件'); }))];
    return [A().homeCard(K('ひとつずつ記録する', 'ひとつずつ きろく する'), { cls: 'accent step-card', wide: true, easy: true }, A().live(stepper)),
      A().homeCard(K('伝えたいこと（まだ話していない）', 'つたえたいこと（まだ はなして いない）'), { action: A().navBtn('client', K('開く', 'ひらく')), easy: true }, A().live(function () {
        var l = St.rows('myWishes').filter(function (r) { return r.status !== '話した' && r.title; }); return l.length ? h('ul', { class: 'list' }, l.slice(0, 5).map(function (r) { return h('li', null, r.title + (r.to ? '（' + r.to + '）' : '')); })) : U.empty(K('今はありません。', 'いまは ありません。'));
      }))];
  }
  KD.client = { stepper: stepper, moodButtons: moodButtons };
  KD.mod({ id: 'client', title: 'わたしのくらし', icon: '暮', order: 5, collections: cols, sample: sample, view: view, home: home });
})(this);
