/*
 * こもれびデスク — 起動・画面切り替え・設定・バックアップ・最新情報の取り込み
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, St = root.Store, C = root.Calc, KD = root.KD;
  var doc = root.document;
  var lives = [];
  var EDITIONS = {creator:'創作・自己出版版',
    full: 'フル版', freelance: '一般フリーランス・個人経営版', facility: '福祉施設運営者版', staff: '福祉施設支援者版',
    user: '福祉施設利用者版', salon: '美容師・サロン版', shop: '小売店版', life: 'くらし・制度版', tutor: '小規模教室・個人講師版', craft: 'ハンドメイド・受注制作版', service: '清掃・訪問サービス版'
  };
  function metaContent(name) { var m = doc.querySelector('meta[name="' + name + '"]'); return m ? m.getAttribute('content') || '' : ''; }
  // 「最新情報に更新」の取得先（公開サイトでビルドした版だけに入る。https の .json 1か所）。空なら取得機能はオフ
  var UPDATE_URL = (function () { var u = metaContent('komorebi-update-url'); return /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[A-Za-z0-9._~\/-]*\.json$/.test(u) ? u : ''; })();
  var NET = !!UPDATE_URL;

  var now = new Date();
  var App = { ui: { month: now.getFullYear() + '-' + C.pad(now.getMonth() + 1) }, editionLabel: EDITIONS[St.EDITION] || 'フル版' };

  // ---- 部分再描画（入力中のフォーカスを失わない） ----
  App.live = function (fn, tag) {
    var item = { el: h(tag || 'div', { class: 'live' }), fn: fn };
    lives.push(item); fill(item); return item.el;
  };
  function fill(item) {
    U.clear(item.el);
    try { var c = item.fn(); if (c !== null && c !== undefined) item.el.appendChild(c.nodeType ? c : doc.createTextNode(String(c))); }
    catch (e) { item.el.appendChild(h('span', { class: 'warn' }, '表示できませんでした')); if (root.console) root.console.error(e); }
  }
  App.softRefresh = function () { lives = lives.filter(function (x) { return doc.body.contains(x.el); }); lives.forEach(fill); };

  // ---- 画面づくりの共通部品（各モジュールが使う） ----
  App.ymLabel = function (m) { return m.slice(0, 4) + '年' + Number(m.slice(5, 7)) + '月'; };
  App.inMonth = function (d, m) { return String(d || '').slice(0, 7) === m; };
  App.sum = function (list, fn) { return list.reduce(function (a, r) { return a + C.num(fn(r)); }, 0); };
  App.monthPicker = function () {
    var inp = h('input', { type: 'month', 'aria-label': '表示する月', on: { change: function (e) { if (/^\d{4}-\d{2}$/.test(e.target.value)) { App.ui.month = e.target.value; App.render(); } } } });
    inp.value = App.ui.month;
    return h('label', { class: 'month-pick' }, '表示月 ', inp);
  };
  App.viewHead = function (title, lead, extra) { return h('div', { class: 'view-head' }, h('div', null, h('h2', null, title), lead ? h('p', { class: 'lead' }, lead) : null), extra || null); };
  App.grid = function () { var g = h('div', { class: 'cards' }); for (var i = 0; i < arguments.length; i++) if (arguments[i]) g.appendChild(arguments[i]); return g; };
  App.form = function (items) { return h('div', { class: 'form' }, items); };
  App.field = function (label, control, hint) { return h('label', { class: 'field' }, h('span', null, label), control, hint ? h('small', { class: 'muted' }, hint) : null); };
  App.navBtn = function (id, text) { return h('a', { href: '#' + id, class: 'btn small ghost' }, text); };
  // 設定値の入力欄（path は 'mod.tax.year' のような形）
  function getPath(path) { return path.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, St.settings()); }
  App.set = function (path, type, opt) {
    opt = opt || {};
    var val = getPath(path), el;
    function done(v) { St.setSetting(path, v); if (opt.render) App.render(); else App.softRefresh(); if (opt.apply) App.applySettings(); }
    if (type === 'select') {
      el = h('select', { on: { change: function (e) { done(opt.numeric ? Number(e.target.value) : e.target.value); } } });
      opt.options.forEach(function (o) { el.appendChild(h('option', { value: o[0], selected: String(o[0]) === String(val) }, o[1])); });
    } else if (type === 'check') {
      el = h('input', { type: 'checkbox', checked: !!val, on: { change: function (e) { done(e.target.checked); } } });
    } else if (type === 'number') {
      el = h('input', { type: 'number', class: 'num', min: opt.min, step: opt.step || '1', on: { change: function (e) { done(Number(e.target.value) || 0); } } }); el.value = val;
    } else {
      el = h(type === 'textarea' ? 'textarea' : 'input', { type: type === 'textarea' ? null : 'text', rows: type === 'textarea' ? 2 : null, maxlength: '1000', on: { change: function (e) { done(e.target.value.slice(0, 1000)); } } }); el.value = val || '';
    }
    return el;
  };

  function current() {
    var id = (root.location.hash || '#home').slice(1);
    return id === 'home' || id === 'settings' || id === 'info' || KD.mods.some(function (m) { return m.id === id && m.view; }) ? id : 'home';
  }
  function navItems() {
    var items = [{ id: 'home', title: 'ホーム', icon: '⌂' }];
    KD.mods.forEach(function (m) { if (m.view && m.nav !== false) items.push({ id: m.id, title: m.title, icon: m.icon || '・' }); });
    items.push({ id: 'settings', title: '設定・バックアップ', icon: '⚙' }, { id: 'info', title: 'ご利用にあたって', icon: 'ⓘ' });
    return items;
  }
  function renderNav() {
    var nav = doc.getElementById('nav'), cur = current();
    U.clear(nav);
    navItems().forEach(function (g) {
      nav.appendChild(h('a', { href: '#' + g.id, class: 'nav-item', 'aria-current': g.id === cur ? 'page' : null }, h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, g.icon), h('span', null, g.title)));
    });
  }

  // ================= ホーム =================
  function daysSince(iso) { if (!iso) return null; var d = new Date(iso); return isNaN(d) ? null : Math.floor((Date.now() - d.getTime()) / 86400000); }
  function backupStatus() {
    var st = St.get(), last = st.lastBackupAt, days = daysSince(last), fy = C.fiscalYear(C.today());
    var reason = '';
    if (!st.started) return { due: false, last: last, days: days };
    if (!last) { if ((daysSince(st.createdAt) || 0) >= 7) reason = 'まだ一度もバックアップしていません。'; }
    else if (C.fiscalYear(C.ymd(new Date(last))) < fy) reason = fy + '年度になりました。新しい年度のバックアップを取りましょう。';
    else if (new Date(last).getFullYear() < new Date().getFullYear()) reason = '年が変わりました。確定申告の前に、去年の記録をバックアップしておきましょう。';
    else if (days >= (St.settings().backupRemindDays || 30)) reason = '前回のバックアップから' + days + '日たちました。';
    return { due: !!reason, reason: reason, last: last, days: days };
  }
  function viewHome() {
    var s = St.settings(), st = St.get(), v = h('div');
    v.appendChild(App.viewHead(s.ownerName + 'のホーム', App.editionLabel + '｜' + App.ymLabel(App.ui.month), St.EDITION === 'user' ? null : App.monthPicker()));
    if (st.sample || !st.started) {
      v.appendChild(h('div', { class: 'start-banner' },
        h('div', null, h('strong', null, 'いまは架空のサンプルを表示しています。'), h('p', { class: 'small' }, 'ひととおり眺めたら、サンプルを消して自分の記録を始めましょう。')),
        h('button', { type: 'button', class: 'btn big', on: { click: function(){ if(St.get().started) guardedReset('all'); else startFlow(); } } }, 'サンプルを消して始める')));
    } else if (s.homeNotice) v.appendChild(h('p', { class: 'notice' }, s.homeNotice));
    if (St.recoveryText()) v.appendChild(U.card('保存データの読み込みに失敗しました', {wide:true}, h('p', {class:'warn'}, '元の保存内容を保護しています。先に回収ファイルを保存し、別のバックアップから復元してください。空の記録で上書きはしません。'), h('button',{type:'button',class:'btn',on:{click:function(){U.saveFile('komorebi-recovery-raw.txt', St.recoveryText(), 'text/plain');}}},'元の保存内容を回収')));
    var b = backupStatus();
    if (b.due) v.appendChild(h('div', { class: 'notice warn-line' }, h('span', null, b.reason), ' ', h('button', { type: 'button', class: 'btn small', on: { click: backupFlow } }, '今すぐバックアップ')));
    // ロックがオフの間は、環境によっては同じブラウザで開いた別のHTMLファイルから記録を読まれたり書き換えられたりし得る（Chrome・Edgeでファイルを直接開いた場合など）。静かに一度だけ案内する
    if (!st.sample && st.started && !St.lockOn() && St.cryptoOK() && !s.lockNoticeOff) v.appendChild(h('div', { class: 'notice lock-notice' },
      h('strong', null, St.EDITION === 'user' ? 'きろくを まもる ロックが つかえます' : '記録を守る「ロック」がオフです'),
      h('p', { class: 'small' }, '同じブラウザで、メールの添付やダウンロードした別のHTMLファイルを開くと、そのファイルからこの記録を読まれたり書き換えられたりするおそれがあります。ロックをかけると保存データそのものを暗号化します（開くたびにパスフレーズが必要）。'),
      h('div', { class: 'btn-row tight' }, h('a', { class: 'btn small', href: '#settings' }, 'ロックを設定する'), h('button', { type: 'button', class: 'btn small ghost', on: { click: function () { St.setSetting('lockNoticeOff', true); App.render(); } } }, 'このままにする'))));
    var uu = St.usage(); if (uu.level !== 'ok' && !st.sample) v.appendChild(h('div', { class: 'notice warn-line' }, h('span', null, (uu.level === 'danger' ? '保存容量が9割を超えました。' : '保存容量が7割を超えました。') + '早めに全体を書き出し、古い年の記録を外してください。'), ' ', h('a', { class: 'btn small', href: '#settings' }, '保存容量を見る')));
    if(root.Visuals)v.appendChild(root.Visuals.home());
    var homeSlot=h('div',{id:'home-today'});v.appendChild(homeSlot);
    var searchSlot=h('div',{id:'home-search'});v.appendChild(searchSlot);
    var groupMap={all:null,work:['work','invoice','money','tax','team'],welfare:['client','facility','staff','custody','medlist'],shop:['salon','shop','craft','service'],create:['creator','make'],life:['health','pension','money']};
    var groupLabels={all:'すべての機能',work:'仕事・請求',welfare:'福祉',shop:'お店・現場',create:'創作・制作',life:'暮らし'};
    var selected=s.homeGroup||'all';if(!groupMap[selected]&&selected!=='all')selected='all';
    var chooser=h('div',{class:'home-chooser'},h('div',null,h('p',{class:'eyebrow'},'YOUR WORKSPACE'),h('h3',null,St.EDITION==='user'?U.k('使うものを選ぶ','つかうものを えらぶ'):'使う機能を選ぶ')));
    if(St.EDITION==='full'){var select=h('select',{'aria-label':'ホームの用途を絞る',on:{change:function(e){St.setSetting('homeGroup',e.target.value);App.render();}}});Object.keys(groupLabels).forEach(function(k){select.appendChild(h('option',{value:k,selected:k===selected},groupLabels[k]));});chooser.appendChild(select);}
    var qmod=KD.mods.filter(function(x){return x.id==='quicknotes';})[0];
    if(qmod&&qmod.home){var qcard=qmod.home();if(qcard&&qcard[0])v.appendChild(qcard[0]);}
    v.appendChild(chooser);
    var hints={quicknotes:'今日のひとことを日付で記録',custody:'利用者別のお金と領収書を管理',medlist:'利用者別の服薬確認メモ',client:'予定・希望・作業を、自分の言葉で',facility:'実績と期限、運営の確認をまとめる',staff:'本人の意思と支援の事実を整理',salon:'予約・売上・衛生をひとつずつ',shop:'入出庫・残量・棚卸を確認',work:'案件と作業時間を記録',invoice:'請求書を作り、入金を確認',money:'日々の収入・支出を整理',tax:'帳簿をまとめ、概算を確認',health:'体調・通院を振り返る',pension:'制度の記録と期限を確認',team:'担当と次の期限を明確に',make:'制作工程と納品を整理',tutor:'授業・振替・月謝を管理',craft:'注文・材料・発送を管理',service:'訪問・作業・再訪を確認',creator:'作品・公開・売上をまとめる'};
    var modules=KD.mods.filter(function(m){return m.view&&m.nav!==false&&(St.EDITION!=='full'||selected==='all'||groupMap[selected].indexOf(m.id)>=0);});
    v.appendChild(h('div',{class:'home-directory'},modules.map(function(m){return h('a',{class:'module-tile',href:'#'+m.id},h('span',{class:'module-mark','aria-hidden':'true'},m.icon||'記'),h('span',{class:'module-copy'},h('strong',null,m.title),h('span',null,hints[m.id]||'記録を開く')),h('span',{'aria-hidden':'true',class:'module-arrow'},'→'));})));
    var cards=[];modules.forEach(function(m){if(!m.home||m.id==='quicknotes')return;try{(m.home()||[]).forEach(function(c){if(!s.easyMode||c.classList.contains('easy'))cards.push(c);});}catch(e){if(root.console)root.console.error(m.id,e);}});
    if(St.EDITION==='user'){ // 本人向けは「ひとつずつ」をホームの主役にする（折りたたまない）
      var mainCards=App.grid.apply(null,cards);homeSlot.parentNode.insertBefore(mainCards,homeSlot);
    } else {
      var details=h('details',{class:'home-details'},h('summary',null,'各機能の集計をまとめて見る'));
      details.appendChild(App.grid.apply(null,cards));v.appendChild(details);
    }
    v.appendChild(h('div',{class:'home-help'},h('strong',null,St.EDITION==='user'?U.k('困ったとき','こまったとき'):'保存と使い方'),h('p',null,St.EDITION==='user'?U.k('書けるところだけで大丈夫。文字や色、ひらがな表示は設定で変えられます。','かけるところだけで だいじょうぶ。もじや いろ、ひらがなは 設定で かえられます。'):'記録はこのブラウザ内に保存。終わる前に保存表示を確認し、定期的に全体バックアップ。'),App.navBtn('settings','設定・バックアップ'),App.navBtn('info','使い方・注意事項')));
    return v;
  }
  App.homeCard = function (title, opts) { var c = U.card.apply(null, arguments); if (opts && opts.easy) c.classList.add('easy'); return c; };

  // ================= 初回・削除・バックアップの確認 =================
  function introDialog() {
    var body = h('div', null,
      h('ul', { class: 'list' },
        h('li', null, h('strong', null, '3つの約束：'), '登録しない／記録を外へ送らない／データはあなたのもの（いつでもJSON・CSVで書き出せます）。'),
        h('li', null, '記録はこのパソコンのブラウザの中だけに保存されます。'),
        h('li', null, 'いま入っているのは、ランダムに作った架空のサンプルです。'),
        h('li', null, '年金・税・医療費などの計算は目安です。正式な額は公的機関でご確認ください。'),
        h('li', null, 'ブラウザの閲覧データを消すと記録も消えます。ときどき「全体バックアップ」を取ってください。')),
      h('p', { class: 'small' }, h('a', { href: '#info', on:{click:function(e){var dlg=e.target.closest('dialog');if(dlg)dlg.dispatchEvent(new Event('cancel',{cancelable:true}));}} }, 'ご利用にあたって（注意事項・免責・プライバシー）'), 'をいつでも読めます。'));
    return U.ask('こもれびデスクへようこそ', body, [{ label: 'サンプルを見てみる', value: 'look', tone: 'ghost' }, { label: 'サンプルを消して始める', value: 'start' }]).then(function (v) {
      St.setMeta('introSeen', true); if (v !== 'start') { St.setMeta('started', true); App.render(); }
      if (v === 'start') { St.startFresh(); U.toast('空の状態から始めました'); }
    });
  }
  function startFlow() {
    U.ask('サンプルを消して始めますか？', h('p', null, '架空のサンプルをすべて消して、空の状態から始めます。見やすさの設定は残ります。'),
      [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '消して始める', value: true }]).then(function (ok) { if (ok) { St.startFresh(); U.toast('空の状態から始めました'); } });
  }
  // 運用を始めた後の全削除は、必ずバックアップの確認を挟む
  function guardedReset(kind) {
    var label = kind === 'sample' ? 'サンプルに戻す' : 'すべて削除する';
    return U.ask('バックアップは取りましたか？', h('div', null, h('p', null, kind === 'sample' ? '今の記録を消して、架空のサンプルに戻します。' : '本当にデータを一括削除しますか？'), h('p', { class: 'warn' }, '削除した記録は元に戻せません。'),
      h('p', { class: 'small muted' }, '最後のバックアップ：' + (St.get().lastBackupAt ? St.get().lastBackupAt.slice(0, 10) : 'まだありません'))),
      [{ label: 'やめる', value: 'cancel', tone: 'ghost' }, { label: '先にバックアップする', value: 'backup' }, { label: label, value: 'go', tone: 'danger' }]).then(function (v) {
      if (v === 'backup') return backupFlow().then(function () { return guardedReset(kind); });
      if (v !== 'go') return;
      if (kind === 'sample') St.resetSample(); else St.startFresh();
      U.toast(kind === 'sample' ? 'サンプルに戻しました' : 'すべて削除しました');
    });
  }
  function backupName(enc) {
    var fy = C.fiscalYear(C.today());
    return 'komorebi-desk_' + St.EDITION + '_' + fy + '年度_' + U.stamp() + (enc ? '.enc.json' : '.json');
  }
  // 保存の失敗・競合は、どの画面でも上部に出し続ける（画面に見えていても再読込で消えるため）
  var lastSaveErr = false;
  function updateSaveAlert() {
    var ws = doc.querySelector('.workspace'), main = doc.getElementById('main'); if (!ws || !main || !St.get()) return;
    var el = doc.getElementById('save-alert'), err = St.saveFailed() && !St.recoveryText();
    if (!err) { if (el) el.remove(); lastSaveErr = false; return; }
    if (!el) { el = h('div', { id: 'save-alert', class: 'save-alert', role: 'alert' }); ws.insertBefore(el, main); }
    U.clear(el);
    el.appendChild(h('div', { class: 'save-alert-in' }, h('div', null, h('strong', null, St.conflict() ? '別のタブ・画面で新しい保存がありました。この画面の変更は保存していません。' : '保存できませんでした。この画面の変更は、閉じたり再読込したりすると消えます。'),
      h('p', { class: 'small' }, St.conflict() ? 'まず「今の記録を書き出す」で救出し、他のタブを閉じてから開き直してください。必要なら書き出したファイルから復元します。' : 'まず「今の記録を書き出す」で救出してください。容量不足なら、設定の「保存容量」で古い年の記録を外せます。')),
      h('div', { class: 'btn-row tight' }, h('button', { type: 'button', class: 'btn', on: { click: backupFlow } }, '今の記録を書き出す'), h('a', { class: 'btn ghost', href: '#settings' }, '保存容量を見る'))));
    if (!lastSaveErr) U.toast('保存できませんでした。今の記録を書き出してください。'); lastSaveErr = true;
  }
  root.addEventListener && root.addEventListener('komorebi-save', function () { updateSaveAlert(); });
  function fmtPct(r) { return Math.min(999, Math.round(r * 100)) + '%'; }
  function usageCard() {
    var u = St.usage(), d = new Date(), def = C.addMonths(C.ymd(d).slice(0, 8) + '01', -3).slice(0, 7);
    var mon = h('input', { type: 'month', value: def, max: C.ymd(d).slice(0, 7), 'aria-label': 'この月より前の記録を外す' });
    var note = String(St.settings().archiveNote || '');
    return U.card('保存容量', { desc: 'ブラウザの保存領域は約5MB（ここでは保存した文字数÷500万で概算）、1つの表は5,000件までです。7割で注意、9割で警告します。' },
      h('div', { class: 'usage-row' }, h('span', null, '保存領域'), h('progress', { max: '100', value: String(Math.min(100, Math.round(u.ratio * 100))), 'aria-label': '保存領域の使用率' }), h('strong', { class: u.ratio >= 0.9 ? 'warn' : '' }, fmtPct(u.ratio))),
      h('div', { class: 'usage-row' }, h('span', null, 'いちばん多い表'), h('progress', { max: '100', value: String(Math.min(100, Math.round(u.rowRatio * 100))), 'aria-label': '表の件数の使用率' }), h('strong', { class: u.rowRatio >= 0.9 ? 'warn' : '' }, u.tables[0] ? u.tables[0].n.toLocaleString() + '件' : '0件')),
      u.tables.length ? h('p', { class: 'small muted' }, '多い表：' + u.tables.slice(0, 3).map(function (t) { return t.title + ' ' + t.n.toLocaleString() + '件'; }).join('／')) : null,
      h('details', { class: 'archive' }, h('summary', null, '古い月の記録を保管ファイルへ移す'),
        h('p', { class: 'small' }, '①選んだ月より前の記録を保管ファイルに書き出す → ②保存したファイルを選び直して中身を照合 → ③全部そろっていたときだけ、この画面から外します。日付のない記録・設定は残ります。'),
        h('p', { class: 'small warn' }, '外した期間は、年間集計・検索・ふりかえり・CSVに出なくなります。年間の集計やCSVが必要なら先に保存してください。「元に戻す」は画面を開いている間だけです。閉じた後に見返すときは、保管ファイルを別のブラウザのプロフィールで「復元」します。'),
        h('div', { class: 'btn-row' }, h('label', { class: 'month-pick' }, mon, ' より前'), h('button', { type: 'button', class: 'btn ghost', on: { click: function () { archiveFlow(mon.value); } } }, '内容を確認する')),
        note ? h('details', null, h('summary', { class: 'small' }, '保管の記録'), h('pre', { class: 'code small' }, note)) : null));
  }
  function archiveFlow(ym) {
    if (!/^\d{4}-\d{2}$/.test(ym || '')) { U.toast('月を選んでください'); return; }
    var plan = St.archivePlan(ym), n = plan.reduce(function (a, p) { return a + p.n; }, 0);
    if (!n) { U.toast(ym + 'より前の日付の記録はありません'); return; }
    var p1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: '10文字以上（空なら暗号化しない）', 'aria-label': '保管ファイルのパスフレーズ' });
    var name = 'komorebi-desk_' + St.EDITION + '_' + ym + 'より前_保管.json';
    U.ask('① ' + ym + 'より前の記録を書き出す', h('div', null, h('p', null, '次の' + n.toLocaleString() + '件を含む全体を、保管ファイルに書き出します。まだ何も外しません。'), U.miniTable(['表', '外す件数'], plan.map(function (p) { return [p.title, p.n.toLocaleString()]; })), App.field('保管ファイルの暗号化（推奨）', p1), h('p', { class: 'small muted' }, '暗号化しないと、体調・お金・支援の記録がそのまま読めるファイルになります。')),
      [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '書き出す', value: true }]).then(function (ok) {
      if (!ok) return;
      var pass = p1.value; p1.value = '';
      if (pass && pass.length < 10) { U.toast('パスフレーズは10文字以上にしてください（何も外していません）'); return; }
      return (pass ? St.backupEncrypted(pass) : Promise.resolve(St.backupText())).then(function (text) { return U.saveFile(name, text); }).then(function (saved) {
        if (!saved) { U.toast('書き出しを中止したので、何も外していません'); return; }
        var file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': '保存した保管ファイル' }), p2 = h('input', { type: 'password', autocomplete: 'current-password', placeholder: '暗号化したときのパスフレーズ', 'aria-label': '保管ファイルのパスフレーズ（照合用）' });
        return U.ask('② 保存したファイルを選んで照合', h('div', null, h('p', null, 'ダウンロードが始まっただけでは、保存できたとは限りません。いま保存した「' + name + '」を選んでください。外す予定の記録が同じ内容で全部入っているときだけ、次へ進みます。'), file, pass ? p2 : null),
          [{ label: 'やめる（何も外さない）', value: false, tone: 'ghost' }, { label: '照合して外す', value: true }]).then(function (go) {
          if (!go) { U.toast('何も外していません'); return; }
          var f = file.files && file.files[0]; if (!f) { U.toast('ファイルが選ばれていないので、何も外していません'); return; }
          return f.text().then(function (t) { return St.readBackup(t, p2.value); }).then(function (fileState) {
            var v = St.archiveVerify(ym, fileState);
            if (!v.ok) { U.toast('照合できませんでした（' + v.missing + '件が不一致）。何も外していません'); return; }
            var removed = St.archiveBefore(ym, f.name); St.setMeta('lastBackupAt', new Date().toISOString());
            U.toast(v.checked.toLocaleString() + '件を照合し、' + removed.toLocaleString() + '件を外しました');
          }, function (e) { U.toast('ファイルを読めませんでした：' + e.message + '（何も外していません）'); });
        });
      }, function (e) { U.toast(e.message + '（何も外していません）'); });
    });
  }
  // 今のパスフレーズで保存データを開けることを確かめてから、新しいパスフレーズで暗号化し直す（同じ保存場所を上書きするので、古い暗号文は残らない）
  function changeLockPass() {
    var cur = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': '今のパスフレーズ' }), n1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: '10文字以上', 'aria-label': '新しいパスフレーズ' }), n2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'もう一度', 'aria-label': '新しいパスフレーズの確認' });
    U.ask('パスフレーズを変える', h('div', null, App.field('今のパスフレーズ', cur), App.field('新しいパスフレーズ', n1), App.field('新しいパスフレーズの確認', n2), h('p', { class: 'small muted' }, '暗号化したバックアップは、作ったときのパスフレーズのままです。')), [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '変える', value: true }]).then(function (ok) {
      var c = cur.value, a = n1.value, b = n2.value; cur.value = n1.value = n2.value = '';
      if (!ok) return; if (a !== b) { U.toast('新しいパスフレーズが一致しません'); return; } if (a.length < 10) { U.toast('新しいパスフレーズは10文字以上にしてください'); return; }
      St.flush().then(function () { return St.readBackup(St.rawText(), c); }).then(function () { return St.enableLock(a); }).then(function () { U.toast('パスフレーズを変えました'); App.render(); }, function (e) { U.toast(/違う|壊れ/.test(e.message) ? '今のパスフレーズが違います（変えていません）' : e.message); });
    });
  }
  // 保存ダイアログで書き込めたときだけ完了。ダウンロードの開始だけなら、保存したファイルを選んで照合できたときに完了とする
  function afterBackup(ok, text, label) {
    if (!ok) return;
    function done() { St.setMeta('lastBackupAt', new Date().toISOString()); U.toast(label + 'を保存しました'); App.render(); }
    if (ok === true) { done(); return; }
    var file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': '保存したバックアップ（照合用）' });
    return U.ask('ダウンロードを開始しました', h('div', null, h('p', null, 'このブラウザでは、保存できたかをツールから確かめられません。ダウンロードしたファイルを選ぶと中身を照合し、そこで「最後のバックアップ」を更新します。'), file, h('p', { class: 'small muted' }, 'あとで確認する場合、「最後のバックアップ」は更新しません。')),
      [{ label: 'あとで確認する', value: false, tone: 'ghost' }, { label: '照合する', value: true }]).then(function (go) {
      if (!go) { U.toast('まだバックアップ完了にしていません'); return; }
      var f = file.files && file.files[0]; if (!f) { U.toast('ファイルが選ばれていません（完了にしていません）'); return; }
      return f.text().then(function (t) { if (t === text) done(); else U.toast('中身が一致しませんでした（完了にしていません）'); });
    });
  }
  function backupFlow() {
    var pass = h('input', { type: 'password', autocomplete: 'new-password', placeholder: '10文字以上（忘れると復元できません）', 'aria-label': 'バックアップのパスフレーズ' });
    var pass2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'もう一度', 'aria-label': 'パスフレーズの確認' });
    var body = h('div', null, h('p', null, '記録と設定をまるごと1つのファイルに保存します。保存先は次の画面で選べます（選べないブラウザでは「ダウンロード」フォルダに保存されます）。'),
      App.field('暗号化のパスフレーズ（推奨）', pass), App.field('パスフレーズの確認', pass2),
      h('p', { class: 'small muted' }, '暗号化しない保存も選べますが、体調・お金・福祉施設利用者の記録がそのまま読めるファイルになります。GitHubやクラウドに置かないでください。'));
    return U.ask('全体バックアップ', body, [{ label: 'やめる', value: null, tone: 'ghost' }, { label: '暗号化しないで保存', value: 'plain', tone: 'ghost' }, { label: '暗号化して保存', value: 'enc' }]).then(function (v) {
      if (v === 'enc') {
        if (pass.value !== pass2.value) { U.toast('パスフレーズが一致しません'); return; }
        return St.backupEncrypted(pass.value).then(function (text) { return U.saveFile(backupName(true), text).then(function (ok) { return afterBackup(ok, text, '暗号化したバックアップ'); }); }).then(null, function (e) { U.toast(e.message); });
      }
      if (v === 'plain') { var plain = St.backupText(); return U.saveFile(backupName(false), plain).then(function (ok) { return afterBackup(ok, plain, 'バックアップ（暗号化なし）'); }); }
    });
  }
  App.backupFlow = backupFlow;
  function restoreFlow(file, pass) {
    if (!file) { U.toast('ファイルを選んでください'); return; }
    if (file.size > 16 * 1024 * 1024) { U.toast('ファイルが大きすぎます'); return; }
    var r = new FileReader();
    r.onload = function () {
      St.readBackup(String(r.result), pass).then(function (st) {
        var n = Object.keys(st.collections).reduce(function (a, k) { return a + st.collections[k].length; }, 0);
        return U.ask('このバックアップで置き換えますか？', h('div', null, h('p', null, '読み込んだ記録：' + n + '件（版：' + (EDITIONS[st.edition] || st.edition || '不明') + '）'), h('p', { class: 'warn' }, '今の記録は消えて、バックアップの内容になります。')),
          [{ label: 'やめる', value: false, tone: 'ghost' }, {label:'先に現在のバックアップを保存',value:'backup'}, { label: 'バックアップ確認済・置き換える', value: true, tone: 'danger' }]).then(function (ok) { if(ok==='backup') return backupFlow(); if (ok === true) { St.replaceAll(st); U.toast('バックアップから復元しました'); } });
      }, function (e) { U.toast(e.message); });
    };
    r.readAsText(file);
  }
  function remindOnce() {
    var b = backupStatus(), st = St.get();
    if (!b.due || (st.remindedAt && st.remindedAt.slice(0, 10) === C.today())) return;
    St.setMeta('remindedAt', new Date().toISOString());
    U.ask('バックアップのお知らせ', h('p', null, b.reason), [{ label: 'あとで', value: false, tone: 'ghost' }, { label: '今すぐバックアップ', value: true }]).then(function (v) { if (v) backupFlow(); });
  }

  // ================= 最新情報に更新 =================
  function diffAndApply(raw, from) {
    if (!raw || raw.format !== 'komorebi-rates-v1') { U.toast('制度値ファイルの形式ではありません'); return; }
    var r = St.cleanRates(raw);
    if (!r) { U.toast('使える値がありませんでした（範囲外の値は取り込みません）'); return; }
    var cur = St.rates().values, rows = [];
    Object.keys(r.values).forEach(function (k) { if (r.values[k] !== cur[k]) rows.push([C.RATE_LABELS[k] || k, String(cur[k]), String(r.values[k])]); });
    var body = h('div', null, h('p', null, (r.label || '') + (r.checkedAt ? '（' + r.checkedAt + ' 確認）' : '') + '／取得元：' + from),
      rows.length ? U.miniTable(['項目', '今の値', '新しい値'], rows, [1, 2]) : h('p', null, '今の値と同じでした。変更はありません。'),
      r.sources.length ? h('ul', { class: 'list small' }, r.sources.map(function (s) { return h('li', null, U.extLink(s.url, s.title)); })) : null,
      h('p', { class: 'small muted' }, '取り込むのは数字だけです。公式ページで本当に正しいか確かめてから反映してください。'));
    U.ask('新しい制度値を反映しますか？', body, [{ label: 'やめる', value: false, tone: 'ghost' }, { label: rows.length ? '反映する' : '閉じる', value: !!rows.length }]).then(function (ok) {
      if (ok) { St.setRates(r); U.toast('制度値を更新しました'); }
    });
  }
  // 押したときだけ、確認のうえで1か所から制度値ファイルを読む。記録は送らない。値は範囲を確かめ、差分を見て人が反映を決める
  function fetchUpdate() {
    var links = h('ul', { class: 'list small' }, C.SOURCES.map(function (x) { return h('li', null, U.extLink(x.url, x.title)); }));
    if (!UPDATE_URL) {
      U.ask('最新情報に更新', h('div', null, h('p', null, 'この版は、インターネットから自動で取りに行く機能がオフになっています（ダウンロードした場所によってはオフです）。公開サイトの「制度値ファイル（rates.json）」を保存して、下の「ファイルから読み込む」で取り込めます。'),
        h('p', null, '公式の情報はこちらで確認できます：'), links), [{ label: '閉じる', value: false, tone: 'ghost' }]);
      return;
    }
    U.ask('最新情報に更新しますか？', h('div', null, h('p', null, '次の1か所だけに接続して、年金・手当・保険料などの金額のファイルを読みます。'), h('p', { class: 'code' }, UPDATE_URL),
      h('ul', { class: 'list small' }, h('li', null, 'あなたの記録は送りません。接続先には、ふつうのアクセスと同じ情報（IPアドレスなど）が届きます。'), h('li', null, '読み込んだ値はすぐには反映せず、今の値との違いを見てから決められます。'), h('li', null, 'これ以外の場所への通信は、ブラウザの設定（CSP）で止めています。'))),
      [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '接続して確認する', value: true }]).then(function (ok) {
      if (!ok) return;
      var ctl = root.AbortController ? new root.AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
      St.setSetting('updateCount', (Number(St.settings().updateCount) || 0) + 1);
      root.fetch(UPDATE_URL, { method: 'GET', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors', signal: ctl ? ctl.signal : undefined }).then(function (res) {
        if (!res.ok) throw new Error('取得できませんでした（' + res.status + '）');
        return res.text();
      }).then(function (text) {
        clearTimeout(timer);
        if (text.length > 100000) throw new Error('ファイルが大きすぎます');
        var raw; try { raw = JSON.parse(text); } catch (e) { throw new Error('ファイルの形式が正しくありません'); }
        diffAndApply(raw, '公開サイト');
      }).catch(function (e) { clearTimeout(timer); U.toast((e && e.name === 'AbortError') ? '時間がかかりすぎたため中止しました' : (e && e.message) || '取得できませんでした'); App.render(); });
    });
  }
  function updateCard() {
    var file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': '制度値ファイル' });
    var rt = St.rates();

    return U.card('最新情報に更新（制度の金額）', { wide: true, desc: '年金・手当・保険料などの金額は年度ごとに変わります。更新は、あなたがボタンを押したときだけ行います。' },
      h('p', null, '今の値：', h('strong', null, rt.label), rt.checkedAt ? '（' + rt.checkedAt + ' 確認）' : ''),
      U.miniTable(['項目', '値'], Object.keys(C.RATE_LABELS).map(function (k) { return [C.RATE_LABELS[k], k === 'withholdingRate' ? rt.values[k] + '%' : C.yen(rt.values[k])]; }), [1]),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', on: { click: fetchUpdate } }, '最新情報に更新（公式情報を確認）'),
        h('button', { type: 'button', class: 'btn ghost', on: { click: function () {
          var f = file.files[0]; if (!f) { U.toast('制度値ファイル（rates.json）を選んでください'); return; }
          if (f.size > 100000) { U.toast('ファイルが大きすぎます'); return; }
          var rd = new FileReader(); rd.onload = function () { try { diffAndApply(JSON.parse(String(rd.result)), 'ファイル「' + f.name + '」'); } catch (e) { U.toast('JSONとして読めませんでした'); } }; rd.readAsText(f);
        } } }, 'ファイルから読み込む'), file,
        h('button', { type: 'button', class: 'btn ghost small', on: { click: function () { St.setRates(null); U.toast('既定値に戻しました'); } } }, '既定値に戻す')),
      h('p', { class: 'small muted' }, NET ? 'ボタンを押して確認したときだけ取得します。自動では取りに行きません。' : 'この版では自動取得はオフです。公開サイトの rates.json を保存して、ファイルから読み込めます。'),
      h('p', { class: 'small' }, '公式サイトで確認：'), h('ul', { class: 'list small' }, C.SOURCES.concat(rt.sources || []).map(function (x) { return h('li', null, U.extLink(x.url, x.title)); })));
  }

  // ================= 設定・バックアップ =================
  function viewSettings() {
    var st = St.get(), v = h('div');
    v.appendChild(App.viewHead('設定・バックアップ', 'このツールの記録は、このブラウザの中だけにあります。'));
    var range = h('input', { type: 'range', min: '90', max: '170', step: '10', 'aria-label': '文字の大きさ', on: { input: function (e) { St.setSetting('fontScale', Number(e.target.value)); App.applySettings(); } } });
    range.value = St.settings().fontScale;
    var rfile = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': '復元するバックアップ' });
    var rpass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: '暗号化したバックアップならパスフレーズ', 'aria-label': '復元のパスフレーズ' });
    var lp1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: '10文字以上', 'aria-label': 'ロックのパスフレーズ' });
    var lp2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'もう一度', 'aria-label': 'ロックのパスフレーズの確認' });
    var b = backupStatus();
    v.appendChild(App.grid(
      U.card('全体バックアップ', { cls: 'accent', desc: '記録・設定・制度値をまとめて1ファイルに保存。保存先は自分で選べます。' },
        h('p', null, '最後のバックアップ：', h('strong', null, b.last ? b.last.slice(0, 10) + '（' + b.days + '日前）' : 'まだありません')),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn big', on: { click: backupFlow } }, 'ボタン1つで全体バックアップ')),
        App.field('お知らせする間隔（日）', App.set('backupRemindDays', 'number', { min: 7 }), '年度（4月）や年が変わったときも自動でお知らせします')),
      U.card('バックアップから復元', { desc: '知らない項目は捨て、型を確かめてから取り込みます。' }, rfile, rpass,
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', on: { click: function () { restoreFlow(rfile.files[0], rpass.value); rpass.value = ''; } } }, '復元する'))),
      usageCard(),
      U.card('見やすさ', null, App.form([
        App.field('文字の大きさ', range, '90%〜170%'),
        App.field('色', App.set('theme', 'select', { apply: true, options: [['auto', 'パソコンの設定に合わせる'], ['light', '明るい'], ['dark', '暗い']] })),
        App.field('はっきりした色（高コントラスト）', App.set('contrast', 'check', { apply: true })),
        App.field('動きを減らす', App.set('reduceMotion', 'check', { apply: true })),
        App.field('かんたん表示（ホームを大事な項目だけに）', App.set('easyMode', 'check', { render: true }), '疲れている日や、初めての方に'), KD.has('client') ? App.field('ひらがなで表示する（わたしのくらし）', App.set('kanaMode', 'check', { render: true }), '初期は漢字まじり。読みやすいほうを選べます') : null])),
      U.card('基本', null, App.form([App.field('ホームに出す呼び名', App.set('ownerName', 'text')), App.field('ホームのお知らせ', App.set('homeNotice', 'textarea'))])),
      U.card('ロック（共有パソコン・事業所向け）', { desc: 'オンにすると、保存データそのものを暗号化し、開くたびにパスフレーズを聞きます。' },
        St.lockOn() ? h('div', null, h('p', { class: 'ok' }, 'ロックはオンです。'),
          App.field('操作しないと自動でロック（分）', App.set('autoLockMin', 'number', { min: 1 })),
          h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', on: { click: lockNow } }, '今すぐロック'),
            h('button', { type: 'button', class: 'btn ghost', on: { click: function () { U.confirmDanger('ロックを外しますか？', '保存データが暗号化されない状態に戻ります。', 'ロックを外す').then(function (ok) { if (ok) { St.disableLock(); App.render(); U.toast('ロックを外しました'); } }); } } }, 'ロックを外す'),
            h('button', { type: 'button', class: 'btn ghost', on: { click: changeLockPass } }, 'パスフレーズを変える')))
          : h('div', null, lp1, lp2, h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', disabled: !St.cryptoOK(), on: { click: function () {
            if (lp1.value !== lp2.value) { U.toast('パスフレーズが一致しません'); return; }
            St.enableLock(lp1.value).then(function () { bumpIdle(); U.toast('ロックをオンにしました'); App.render(); }, function (e) { U.toast(e.message); });
          } } }, 'ロックをオンにする')), h('p', { class: 'small warn' }, 'パスフレーズを忘れると、記録を取り出せなくなります。先にバックアップを。'))),
      KD.mods.some(function (m) { return m.usesRates; }) ? updateCard() : null,
      U.card('データの削除', { wide: true, cls: 'danger-zone' },
        st.started ? h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn danger', on: { click: function () { guardedReset('all'); } } }, 'すべての記録を一括削除'),
          h('button', { type: 'button', class: 'btn ghost', on: { click: function () { guardedReset('sample'); } } }, 'サンプルに戻す'))
          : h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', on: { click: startFlow } }, 'サンプルを消して始める')),
        h('p', { class: 'small muted' }, '使い始めた後の一括削除は、毎回バックアップの確認をしてから行います。')),
      U.card('この版について', { wide: true }, h('ul', { class: 'list' },
        h('li', null, App.editionLabel + '（こもれびデスク v2）。入っている画面：' + KD.mods.filter(function (m) { return m.view; }).map(function (m) { return m.title; }).join('、')),
        h('li', null, NET ? '通信：「最新情報に更新」ボタンを押して確認したときだけ、' + UPDATE_URL.replace(/^https:\/\//, '') + ' の1か所に接続します（それ以外は通信を禁止）。' : '自動通信・データ送信なし。外部リンクを承認して開くと、その接続先にIPアドレス等が届きます。'),
        h('li', null, '保存場所：このブラウザの localStorage（キー：' + St.KEY + '）。版ごとに別の保存場所です。'),
        h('li', null, h('a', { href: '#info' }, '注意事項・免責・プライバシーポリシー・著作権・セキュリティ'))))));
    return v;
  }

  // ================= ご利用にあたって =================
  function viewInfo() {
    var v = h('div');
    v.appendChild(App.viewHead('ご利用にあたって', '注意事項・免責事項・プライバシーポリシー・著作権・セキュリティ'));
    var toc = h('ol', { class: 'toc' }, (KD.legal || []).map(function (s) { return h('li', null, h('a', { href: '#info-' + s.id, on: { click: function (e) { e.preventDefault(); var t = doc.getElementById('info-' + s.id); if (t) t.scrollIntoView(); } } }, s.title)); }));
    v.appendChild(U.card('目次', { wide: true }, toc));
    (KD.legal || []).forEach(function (s) {
      var c = U.card(s.title, { wide: true }, s.body.map(function (p) { return Array.isArray(p) ? h('ul', { class: 'list' }, p.map(function (x) { return h('li', null, x); })) : h('p', null, p); }));
      c.id = 'info-' + s.id; v.appendChild(c);
    });
    return v;
  }

  // ================= ロック =================
  // 保存できたら再読込でロック画面へ。保存に失敗・競合していても、画面は必ず隠して操作を止める（未保存の記録はメモリに残し、パスフレーズで開き直してから救出できる）
  function lockNow() { St.flush().then(function () { root.location.reload(); }, function () { softLock(); }); }
  function softLock() {
    clearTimeout(idleTimer); if (doc.getElementById('soft-lock')) return;
    Array.prototype.forEach.call(doc.querySelectorAll('dialog[open]'), function (d) { try { d.close(); } catch (e) {} });
    U.clear(doc.getElementById('main'));
    // body直下の全要素（本体・スマホ下部バー・ダイアログ・通知・印刷領域、後から追加されるものも）を隠して操作不能にする
    var saved = [], box;
    function shield(el) { if (!el || el.nodeType !== 1 || el === box) return; saved.push([el, el.hidden, !!el.inert]); el.hidden = true; el.inert = true; }
    Array.prototype.forEach.call(doc.body.children, shield);
    var mo = root.MutationObserver ? new root.MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, shield); }); }) : null;
    var pass = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'パスフレーズ（未保存あり）' }), msg = h('p', { class: 'warn small', role: 'status' });
    box = h('section', { id: 'soft-lock', class: 'lock', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'soft-lock-h' }, h('h2', { id: 'soft-lock-h' }, 'ロック中（未保存の変更あり）'),
      h('p', null, '保存できなかったため、最後の変更はこの画面の中にだけあります。閉じたり再読込したりすると消えます。パスフレーズで開き直し、上の「今の記録を書き出す」で救出してください。'), pass,
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', on: { click: function () { var v = pass.value; pass.value = ''; St.verifyPass(v).then(function () {
        if (mo) mo.disconnect(); box.remove();
        saved.forEach(function (x) { if (x[0].isConnected) { x[0].hidden = x[1]; x[0].inert = x[2]; } });
        App.render(); bumpIdle();
      }, function (e) { msg.textContent = e.message; }); } } }, '開く')), msg);
    doc.body.appendChild(box); if (mo) mo.observe(doc.body, { childList: true }); pass.focus();
  }
  App.isSoftLocked = function () { return !!doc.getElementById('soft-lock'); };
  var idleTimer;
  function bumpIdle() {
    if (!St.lockOn() || doc.getElementById('soft-lock')) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(lockNow, Math.max(1, Number(St.settings().autoLockMin) || 15) * 60000);
  }
  function lockScreen() {
    var main = doc.getElementById('main');
    U.clear(main); U.clear(doc.getElementById('nav'));
    var pass = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'パスフレーズ' });
    var msg = h('p', { class: 'warn', hidden: true });
    var form = h('form', { class: 'lock', on: { submit: function (e) {
      e.preventDefault(); msg.hidden = true;
      St.unlock(pass.value).then(function () { pass.value = ''; boot(); }, function (err) { msg.textContent = err.message; msg.hidden = false; pass.select(); });
    } } }, h('h2', null, 'ロック中'), h('p', null, 'パスフレーズを入れてください。'), pass, h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn' }, '開く')), msg,
      h('p', { class: 'small muted' }, 'パスフレーズを忘れた場合、このデータは取り出せません。バックアップから復元してください。'));
    main.appendChild(form);
    var rf=h('input',{type:'file',accept:'.json', 'aria-label':'ロック中の復元ファイル'}),rp=h('input',{type:'password','aria-label':'バックアップのパスフレーズ'});
    main.appendChild(U.card('バックアップから復元',null,h('p',{class:'warn small'},'現在の暗号化保存を置き換えます。元データを先に回収してください。復元後の保存は暗号化ロックがオフになるため、設定から改めてロックしてください。'),h('button',{type:'button',class:'btn ghost',on:{click:function(){U.saveFile('komorebi-locked-recovery.json',St.rawText());}}},'元の暗号化データを回収'),rf,rp,h('button',{type:'button',class:'btn',on:{click:function(){var f=rf.files[0];if(!f||f.size>16*1024*1024){U.toast('16MB以下の復元ファイルを選んでください');return;}f.text().then(function(t){return St.readBackup(t,rp.value);}).then(function(st){rp.value='';return U.confirmDanger('元データを回収しましたか？','現在の暗号化保存を置き換え、ロックなしで復元します。','回収済・置き換える').then(function(ok){if(ok){St.restoreLocked(st);root.location.reload();}});}).catch(function(e){U.toast(e.message);});}}},'バックアップで復元する')));
    pass.focus();
  }

  App.render = function () {
    if (doc.getElementById('soft-lock')) return;
    App._renderSeq = (App._renderSeq || 0) + 1;
    var main = doc.getElementById('main'), y = root.scrollY, keep = App._last === current();
    lives = []; U.clear(main); renderNav();
    var id = current(), view = id === 'home' ? viewHome : id === 'settings' ? viewSettings : id === 'info' ? viewInfo : KD.mods.filter(function (m) { return m.id === id; })[0].view;
    doc.documentElement.setAttribute('data-view',id);
    try { if(St.isDemo&&St.isDemo())main.appendChild(h('p',{class:'notice'},'架空サンプル専用の画面です。通常の記録とは保存先が別です。ここには個人情報を入れず、操作確認に使ってください。'));main.appendChild(view()); }
    catch (e) { main.appendChild(h('p', { class: 'warn' }, '画面を表示できませんでした。「設定・バックアップ」でバックアップを取ってから、この版の不具合報告を確認してください。元の記録は削除しないでください。')); if (root.console) root.console.error(e); }
    doc.getElementById('sample-flag').hidden = !St.get().sample;
    updateSaveAlert();
    if (keep) root.scrollTo(0, y); else { root.scrollTo(0, 0); main.focus({ preventScroll: true }); }
    App._last = id;
  };
  App.applySettings = function () {
    var s = St.settings(), html = doc.documentElement;
    html.style.fontSize = Math.min(170, Math.max(90, Number(s.fontScale) || 100)) + '%';
    html.setAttribute('data-theme', s.theme === 'dark' || s.theme === 'light' ? s.theme : 'auto');
    html.setAttribute('data-edition',St.EDITION);
    html.classList.toggle('hc', !!s.contrast);
    html.classList.toggle('calm', !!s.reduceMotion);
  };

  var booted = false;
  function boot() {
    if (!St.get()) St.load();
    if (!booted) {
      booted = true;
      St.onChange(function () { App.applySettings(); App.render(); });
      root.addEventListener('hashchange', App.render);
      ['click', 'keydown', 'pointermove', 'touchstart'].forEach(function (ev) { doc.addEventListener(ev, bumpIdle, { passive: true }); });
    }
    App.applySettings(); App.render(); bumpIdle();
    if (!St.get().introSeen) introDialog(); else remindOnce();
  }
  function showToday(d) { doc.getElementById('today').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'[d.getDay()] + '）'; }
  function init() {
    var d = new Date();
    showToday(d);
    // 開いたまま日付が変わっても、端末の時計に合わせて表示を更新する（通信なし）。日付が変わったらホームも描き直す
    var shown = C.ymd(d);
    function tick() { var n = new Date(), y = C.ymd(n); if (y === shown) return; if (App.ui.month === shown.slice(0, 7)) App.ui.month = y.slice(0, 7); shown = y; showToday(n); if (St.get() && (!root.location.hash || root.location.hash === '#home')) App.render(); }
    root.setInterval(tick, 30000); doc.addEventListener('visibilitychange', function () { if (!doc.hidden) tick(); }); root.addEventListener('focus', tick);
    // 他のサイトの枠（iframe）の中では動かない（公開サイトに置いた場合のクリックジャッキング対策）
    try { if (root.top !== root.self) { doc.body.textContent = 'このツールは、ほかのページの枠の中では開けません。ファイルを直接開いてください。'; return; } } catch (e) { doc.body.textContent = 'このツールは、ほかのページの枠の中では開けません。'; return; }
    doc.getElementById('edition').textContent = App.editionLabel;
    if (!root.localStorage) { doc.getElementById('main').appendChild(h('p', { class: 'warn' }, 'このブラウザでは保存機能が使えません。')); return; }
    if (St.isLocked()) lockScreen(); else boot();
  }
  root.App = App;
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(this);
