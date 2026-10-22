/*
 * こもれびデスク — 紹介サイト（dist/index.html）を作る。スクリプトなしの静的ページ。
 * 料金表は DRIVE_START_KIT/05_料金とリミット.md の表から作る（情報の出どころを1か所にするため）。
 * 画面例の画像は docs/screens/ にあれば dist/screens/ へコピーして表示する（tools/screens.py で作成）。
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const INFO = {
  life: ['体調の波がある方・家計と制度を整えたい方', '体調・気圧・勤務・服薬・通院・家計・年金や手当の期限。体調と働き方を同じ日付で重ねて、無理のないペースを見つけます。受診のときに見せる1か月のまとめも印刷できます。', 'くらし'],
  freelance: ['フリーランス・個人事業の方', '案件と作業時間、請求と入金、帳簿、確定申告の準備。銀行・カードの明細CSVを取り込み、自分で決めたルールで仕分けの候補を付けます。', '仕事'],
  user: ['福祉施設を利用している方', '気持ち・今日の予定・できたこと・伝えたいことを、1画面に1つずつ。最初は漢字まじりで、ひらがな表示にも切り替えられます。', '福祉の利用者'],
  full: ['いくつもの立場で使いたい方', 'すべての画面が入った版。仕事・お店・福祉・くらし・創作の記録を横断して使えます。', 'ぜんぶ'],
  facility: ['福祉事業所の管理者・サービス管理責任者の方', '利用者台帳・受給者証の期限、個別支援計画とモニタリングの期限、実績と工賃、委員会・研修の次回期限、月次集計、シフト。担当者個人の手元の整理用で、事業所の正式な記録システムの代わりではありません。', '福祉の運営'],
  staff: ['福祉施設の支援員の方', '朝の様子・作業の割り当て・申し送り（既読つき）・定型文で書きやすい支援記録・ヒヤリハット、シフト。自分の担当分の下書き・整理用です。', '福祉の支援'],
  salon: ['美容室・個人サロンの方', '担当別の予約表、カルテ、来店周期から「そろそろ」のお客様とお知らせ文、スタッフ別の売上、店販・在庫・回数券、シフト。', 'サロン'],
  shop: ['小売店・小さなお店の方', '在庫と発注点、売れ筋（ABC）、曜日別の売上、廃棄、仕入先ごとの発注書、レジ締め、棚卸、シフト。', 'お店'],
  tutor: ['教室・個人講師の方', '週の予定表、出欠と振替の残り回数、月謝の未納と年間台帳、保護者への連絡文（コピーして自分で送る）、シフト。', '教室'],
  craft: ['ハンドメイド・受注制作の方', '注文の進捗、材料の残量と単価、レシピから原価を自動計算、販売先ごとの手数料を引いた利益と最低価格。', 'ものづくり'],
  service: ['清掃・訪問サービスの方', '担当別・移動時間込みの訪問予定表、作業ごとのチェックリスト、作業報告書の印刷、再訪期限、シフト。', '訪問'],
  creator: ['小説・漫画・自己出版をする方', '執筆のペースと1日の目安、文字数の推移、締切と公開のカレンダー、販売報告と入金照合、権利確認。', '創作']
};
const FEATURED = ['life', 'freelance', 'user'];
const ORDER = ['life', 'freelance', 'user', 'full', 'facility', 'staff', 'salon', 'shop', 'tutor', 'craft', 'service', 'creator'];

function pricingRows() {
  try {
    const md = fs.readFileSync(path.join(root, 'DRIVE_START_KIT/05_料金とリミット.md'), 'utf8');
    const checked = (/確認日：([0-9-]+)/.exec(md) || [])[1] || '';
    const rows = md.split('\n').filter(l => /^\|/.test(l) && !/^\|(---|サービス)/.test(l)).map(l => l.split('|').slice(1, -1).map(x => x.trim()));
    return { checked, rows };
  } catch (e) { return { checked: '', rows: [] }; }
}
function links(text) { return esc(text).replace(/https:\/\/[^\s<]+/g, u => '<a href="' + u + '" rel="noopener noreferrer">公式</a>'); }

module.exports = function (out, sizes, opts) {
  opts = opts || {};
  const version = opts.version || '';
  const repo = process.env.GITHUB_REPOSITORY && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(process.env.GITHUB_REPOSITORY) ? 'https://github.com/' + process.env.GITHUB_REPOSITORY : '';
  // 画面例の画像
  const shotsSrc = path.join(root, 'docs/screens'), shots = fs.existsSync(shotsSrc) ? fs.readdirSync(shotsSrc).filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f)) : [];
  if (shots.length) { fs.mkdirSync(path.join(out, 'screens'), { recursive: true }); shots.forEach(f => fs.copyFileSync(path.join(shotsSrc, f), path.join(out, 'screens', f))); }
  const img = (name, alt, cls) => shots.indexOf(name) >= 0 ? '<img src="screens/' + name + '" alt="' + esc(alt) + '" loading="lazy" class="' + (cls || '') + '">' : '';
  const by = Object.fromEntries(sizes.map(x => [x.id, x]));
  const edCard = (id, big) => {
    const x = by[id], d = INFO[id]; if (!x || !d) return '';
    return '<article class="ed' + (big ? ' big' : '') + '"><span class="tag">' + esc(d[2]) + '</span><h3>' + esc(x.label) + '</h3><p class="for">' + esc(d[0]) + '</p><p>' + esc(d[1]) + '</p>' +
      '<p class="dl"><a class="btn" href="' + esc(x.file) + '" download>この版をダウンロード</a><span class="meta">' + Math.ceil(x.bytes / 1024) + ' KB・HTML 1ファイル</span></p>' +
      '<details><summary>ファイルの確認用（SHA-256）</summary><code>' + esc(x.sha256) + '</code></details></article>';
  };
  const featured = FEATURED.map(id => {
    const x = by[id]; if (!x) return '';
    const shot = img(id + '.jpg', INFO[id][2] + '版の画面の例（架空のサンプル）', 'shot');
    return '<article class="feature">' + shot + '<div><span class="tag">' + esc(INFO[id][2]) + '</span><h3>' + esc(x.label) + '</h3><p class="for">' + esc(INFO[id][0]) + '</p><p>' + esc(INFO[id][1]) + '</p><p><a class="btn" href="' + esc(x.file) + '" download>ダウンロード（' + Math.ceil(x.bytes / 1024) + ' KB）</a></p></div></article>';
  }).join('');
  const others = ORDER.filter(id => FEATURED.indexOf(id) < 0).map(id => edCard(id)).join('');
  const p = pricingRows();
  const priceTable = p.rows.length ? '<div class="tbl"><table><thead><tr><th>サービス</th><th>月額の参考</th><th>上限の要点</th><th>公式</th></tr></thead><tbody>' + p.rows.map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + links(r[3] || '') + '</td></tr>').join('') + '</tbody></table></div><p class="small">確認日：' + esc(p.checked) + '。料金と上限は数か月で変わります。契約前に必ず公式ページで確かめてください。こもれびデスク自体は無料で、AIの契約は要りません。</p>' : '';
  const scenarioData = JSON.parse(fs.readFileSync(path.join(root, 'docs/scenarios.json'), 'utf8'));
  const scenarios = scenarioData.scenarios.map((s,i) => '<details class="scenario"' + (i === 0 ? ' open' : '') + '><summary>' + esc(s.label) + '</summary><div class="scene-frames">' + s.frames.map(f => {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(f.image)) throw new Error('Unexpected scenario image source');
    return '<figure><figcaption><strong>' + esc(f.title) + '</strong><p>' + esc(f.text) + '</p></figcaption><img src="' + f.image + '" alt="' + esc(f.title + 'の操作画面。架空のサンプル') + '" loading="lazy"></figure>';
  }).join('') + '</div></details>').join('');
  const csp = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${csp}">
<title>こもれびデスク｜仕事も、お店も、くらしも。自分のペースで記録できる机</title><meta name="description" content="登録なし・広告なし・通信なし。記録はあなたのパソコンの中だけに。体調・仕事・お金・福祉・お店の記録を1つのHTMLで。">
<style>
:root{--bg:#fbf8f1;--paper:#fff;--ink:#22392f;--muted:#5f7066;--line:#e5ddcf;--accent:#2f6b52;--soft:#eef5ef;--sun:#f6e7b8;--rose:#f3dfe1}
*{box-sizing:border-box}body{margin:0;font-family:'Yu Gothic UI','Hiragino Sans','Meiryo',sans-serif;line-height:1.75;color:var(--ink);background:var(--bg)}a{color:var(--accent)}img{max-width:100%;height:auto}
.wrap{max-width:1120px;margin:auto;padding:0 20px}header.top{position:sticky;top:0;background:#fbf8f1ee;border-bottom:1px solid var(--line);z-index:5}header.top .wrap{display:flex;gap:18px;align-items:center;min-height:58px;flex-wrap:wrap}.logo{font-weight:800;letter-spacing:.08em;text-decoration:none;color:var(--ink)}header nav{display:flex;gap:14px;flex-wrap:wrap;font-size:.86rem}header nav a{text-decoration:none;color:var(--muted)}
.hero{position:relative;overflow:hidden;padding:72px 0 56px;background:radial-gradient(circle at 12% 18%,#fff6d6 0 120px,transparent 121px),radial-gradient(circle at 88% 10%,#fff2c9aa 0 160px,transparent 161px),radial-gradient(circle at 70% 85%,#e7f3e8 0 200px,transparent 201px),linear-gradient(160deg,#fbf8f1,#eef5ef)}
.hero .wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center}.eyebrow{letter-spacing:.18em;font-size:.72rem;color:var(--muted);margin:0 0 10px}h1{font-size:clamp(1.8rem,4vw,2.7rem);line-height:1.35;margin:0 0 16px}.lead{font-size:1.08rem;color:var(--muted)}
.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:11px 20px;margin:6px 8px 6px 0}.btn.ghost{background:transparent;color:var(--accent);border:2px solid var(--accent)}
.hero-pic{background:#fff;border-radius:22px;padding:10px;box-shadow:0 14px 40px #2f6b5222;transform:rotate(1.2deg)}.hero-pic img{border-radius:14px;display:block}
section{padding:56px 0}#name-story{padding-bottom:12px}#name-story .sub{margin-bottom:0}#promise{padding-top:16px}section h2{font-size:1.6rem;margin:0 0 8px}.sub{color:var(--muted);margin:0 0 26px}.k{font-size:.72rem;letter-spacing:.18em;color:#b4553f;font-weight:700}
.promise{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.promise article{background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:22px}.promise .num{display:inline-flex;width:44px;height:44px;border-radius:50%;border:2px solid #b4553f;box-shadow:inset 0 0 0 2px #fff,inset 0 0 0 3px #b4553f;color:#b4553f;align-items:center;justify-content:center;font-weight:800;font-family:'Yu Mincho',serif}
.features{display:grid;gap:22px}.feature{display:grid;grid-template-columns:340px 1fr;gap:26px;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:24px;padding:20px}.feature .shot{border-radius:16px;border:1px solid var(--line)}
.tag{display:inline-block;background:var(--sun);border-radius:999px;padding:2px 12px;font-size:.78rem;font-weight:700}.for{color:var(--muted);font-size:.9rem;margin:4px 0}
.eds{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.ed{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;flex-direction:column}.ed h3{margin:8px 0 2px;font-size:1.05rem}.ed p{margin:6px 0;font-size:.9rem}.ed .dl{margin-top:auto}.meta{display:block;font-size:.75rem;color:var(--muted)}details{font-size:.75rem;color:var(--muted)}code{word-break:break-all;font-size:.7rem}
.steps{counter-reset:s;list-style:none;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.steps li{counter-increment:s;background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:18px 18px 18px 64px;position:relative}.steps li:before{content:counter(s);position:absolute;left:18px;top:16px;width:34px;height:34px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}.box{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:20px}.box.warm{background:#fffaf0}.box ul{padding-left:1.2em;margin:0}.box li{margin:6px 0}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;background:var(--paper);font-size:.86rem}th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}th{background:var(--soft)}
.small{font-size:.82rem;color:var(--muted)}footer{border-top:1px solid var(--line);padding:30px 0 50px;font-size:.82rem;color:var(--muted)}
.note{background:var(--rose);border-radius:14px;padding:12px 16px;font-size:.9rem}
.scenario{border:1px solid var(--line);border-radius:20px;background:var(--paper);padding:18px;margin:18px 0;font-size:1rem;color:var(--ink)}.scenario summary{font-weight:700;cursor:pointer;padding:4px}.scene-frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:16px}.scene-frames figure{margin:0;min-width:0;background:var(--bg);border-radius:14px;overflow:hidden;border:1px solid var(--line)}.scene-frames figcaption{padding:15px}.scene-frames figcaption p{font-size:.88rem;color:var(--muted);margin:6px 0 0}.scene-frames img{display:block;width:100%;max-height:440px;object-fit:contain;object-position:top;background:white}.scenario-note{margin-bottom:0}@media(max-width:860px){.scene-frames{grid-template-columns:1fr}.scene-frames img{max-height:480px}}
@media(max-width:860px){.hero .wrap,.feature,.two{grid-template-columns:1fr}.promise,.eds,.steps{grid-template-columns:1fr}.hero{padding:40px 0}.hero-pic{transform:none}}
</style></head><body><header class="top"><div class="wrap"><a class="logo" href="#">こもれびデスク</a><nav aria-label="ページ内の移動"><a href="#choose">版を選ぶ</a><a href="#start">始め方</a><a href="#safe">安心のこと</a><a href="#ai">AIと使う</a><a href="#feedback">ご意見</a></nav></div></header>
<main>
<div class="hero"><div class="wrap"><div><p class="eyebrow">OFFLINE LITTLE DESK　v${esc(version)}</p>
<h1>仕事も、お店も、くらしも。<br>自分のペースで記録できる、<br>ひとつの机。</h1>
<p class="lead">フリーランス・お店・サロン・教室・創作・福祉・くらしの記録を、用途別の12の版で。予定・作業時間・売上・在庫・期限を同じ日付で重ねて見られる無料の記録ツール。登録なし・広告なし。記録はブラウザ内に保存。外部へ自動送信しません。</p>
<p><a class="btn" href="#choose">自分に合う版を選ぶ</a><a class="btn ghost" href="#start">始め方を見る</a></p></div>
<div class="hero-pic">${img('hero.gif', '体調を記録して、体調と働き方の重ね合わせを見る動きの例（架空のサンプル）') || img('life.jpg', 'くらし版の画面の例（架空のサンプル）')}</div></div></div>

<section id="name-story"><div class="wrap"><p class="k">THE NAME</p><h2>「こもれび」という名前</h2><p class="sub">会社や施設、お店での管理を少しでも楽にしたい。忙しい毎日の中、画面を開いたときに心が落ち着く、木漏れ日の差すオアシスのような机にしたい。そんな願いを名前に込めました。</p></div></section>
<section id="promise"><div class="wrap"><p class="k">3 PROMISES</p><h2>3つの約束</h2><p class="sub">いちばん大事なことだけ、先にお伝えします。</p>
<div class="promise"><article><span class="num">壱</span><h3>登録しない</h3><p>アカウントもメールアドレスも要りません。ダウンロードしたHTMLを開くだけ。</p></article>
<article><span class="num">弐</span><h3>外へ送らない</h3><p>記録はインターネットに送りません。ブラウザの機能（CSP）で通信を止めていて、ツールの設定画面で通信の回数を自分で確かめられます。</p></article>
<article><span class="num">参</span><h3>データはあなたのもの</h3><p>いつでも全部をバックアップ（JSON）と表（CSV）で書き出せます。このツールがなくなっても、データは読めます。</p></article></div></div></section>

<section id="featured" style="background:#fff"><div class="wrap"><p class="k">3 DESKS</p><h2>まずは、この3つから</h2><p class="sub">いちばん困りごとが多いところから作りました。どれも架空のサンプル入りで、すぐに試せます。</p>
<div class="features">${featured}</div>
<p class="note">たとえば：明細CSVの取り込みと、自分で決めた仕分けルールで、月末の帳簿づけをまとめて片づけられます。体調の記録と働いた時間を重ねれば、記録した期間の過ごし方を振り返れます。</p></div></section>

<section id="scenarios"><div class="wrap"><p class="k">A DAY AT YOUR DESK</p><h2>自分の1日を、3コマで</h2><p class="sub">実際の操作画面を使った例です。必要なときに、必要な記録だけ。</p>${scenarios}<p class="small scenario-note">画面内の記録はすべて架空です。操作の流れを示すもので、作業時間・収入・体調の改善を保証するものではありません。</p></div></section>

<section id="choose"><div class="wrap"><p class="k">CHOOSE</p><h2>ほかの版</h2><p class="sub">必要な画面だけが入った軽い版です。迷ったら小さい版から。全部入りは「フル版」。版ごとに保存場所が分かれるので、乗り換えるときはバックアップから復元します。</p>
<div class="eds">${others}</div>
<p class="small">サイズは今回の実測です。通常の記録はHTML 1ファイルで動きます。公式リンクの閲覧・任意の更新確認にはインターネットを使います。</p></div></section>

<section id="shift-demo"><div class="wrap"><p class="k">TEAM PLANNING</p><h2>勤務の組合せも、実際に試せます</h2><p class="sub">スタッフの予定を扱う方へ。20人の架空サンプルで、シフト作成の流れを確かめられます。</p><div class="two"><div class="box"><h3>希望と人数を見ながら、勤務案を作る</h3><p>休み・勤務希望68件に、一緒に組みたい2人、重なりを避けたい2人、それぞれの許容日数を設定済み。ボタンで作った案は、条件ごとの結果を見てから反映できます。</p><a class="btn" href="komorebi-full.html?demo=20#shift">20人のシフトサンプルを開く</a></div><div class="box"><h3>まず試して、それから自分の記録へ</h3><p>通常の記録とは別の保存領域で開きます。サンプルに実名や実際の勤務情報を入力する必要はありません。</p><p class="small">すべての希望を満たす保証はありません。人数・休み・夜勤・組合せの結果を人が確認して確定してください。</p></div></div></div></section>

<section id="start" style="background:#fff"><div class="wrap"><p class="k">START</p><h2>始め方</h2><p class="sub">パソコンにインストールは要りません。EdgeやChromeなど、いつものブラウザで開きます。</p>
<ol class="steps"><li><strong>版を選んで保存</strong><br>上の「ダウンロード」で、HTMLを1つ保存します。</li><li><strong>ダブルクリックで開く</strong><br>保存したファイルを開くと、架空のサンプルが入った状態で始まります。</li><li><strong>サンプルを眺める</strong><br>ホームから各画面へ。「＋ 追加」や表の行を押して、使い方を確かめます。</li>
<li><strong>サンプルを消して始める</strong><br>ホームのボタンで、まっさらに。見やすさの設定は残ります。</li><li><strong>ときどきバックアップ</strong><br>設定の「ボタン1つで全体バックアップ」。年度や年が変わると、お知らせが出ます。</li><li><strong>共有パソコンならロック</strong><br>設定でロックをオンにすると、保存データそのものを暗号化します。</li></ol>
<div class="two" style="margin-top:18px"><div class="box warm"><h3>保存のことで、ひとつだけ大事なこと</h3><p>記録はHTMLファイルではなく、使っているブラウザの中に保存されます。HTMLをコピーしても記録は移りません。別のパソコンや新しい版へ移るときは、「全体バックアップ」を保存して、移った先で復元します。ブラウザの「閲覧データを消す」でも記録は消えます。</p></div>
<div class="box"><h3>くわしい手引き</h3><p><a href="start-here.html">はじめての方へ（導入・福祉の配慮・会社での導入の確認表）</a></p><p>ツールの中の「ご利用にあたって」に、注意事項・免責・プライバシー・著作権・セキュリティをまとめています。</p></div></div></div></section>

<section id="safe"><div class="wrap"><p class="k">SAFETY</p><h2>安心して使うために</h2>
<div class="two"><div class="box"><h3>できること</h3><ul><li>記録・集計・期限のお知らせ・検索・印刷・CSV・バックアップ</li><li>帳簿の集計と申告書に写す金額の目安、明細CSVの取り込み</li><li>福祉の記録・期限・実績・工賃の整理、シフト案の作成</li><li>「最新情報に更新」：押して確認したときだけ、公開サイトの制度値ファイル1か所を読む（記録は送らない）</li></ul></div>
<div class="box warm"><h3>しないこと・保証しないこと</h3><ul><li>電子申告・正式な複式簿記・個別の税務判断</li><li>国保連への請求・配置基準の判定・法定帳票の代わり</li><li>医療の診断・治療の判断、制度の受給資格の判定</li><li>自動送信・自動同期・広告・解析・AIの自動呼び出し</li><li>欠陥がないこと・あらゆる攻撃を防ぐこと</li></ul></div></div>
<p class="note">実データを入れる前に、設定から暗号化ロックを有効にし、バックアップを別の場所へ保存してください。共有パソコンでは専用のOSアカウントやブラウザプロフィールを使い、未知のHTMLや拡張機能を開かないでください。校正・翻訳・入力同期の設定も確認してください。</p><p class="small">計算はすべて目安です。正式な額や手続きは、税務署・年金事務所・自治体・専門家で確認してください。記録に氏名・住所・診断名などを入れる必要はありません。IDや呼び名で使えます。</p></div></section>

<section id="ai" style="background:#fff"><div class="wrap"><p class="k">OPTIONAL</p><h2>AIやbotと一緒に使いたい方へ</h2><p class="sub">使わなくても、すべての機能が使えます。使いたい方だけ、自分で選んで、自分で渡す方式です。</p>
<div class="two"><div class="box"><h3>いちばん簡単：手渡し</h3><p>ツールの設定で「AIへの依頼ファイル」を保存して、使いたいAIに自分で添付します。返ってきた提案ファイルを読み込むと、変更点を1つずつ確かめてから反映できます。APIキーもDriveも要りません。記録の本文は、はじめは入らない設定です。</p></div>
<div class="box"><h3>Google Driveを使う</h3><p>依頼ファイルを専用フォルダに置き、各AIの公式のDrive接続で渡せます。自動更新機能は同梱していません。導入時の注意点を説明資料で確認できます。</p><p><a class="btn ghost" href="DRIVE_START_KIT.zip" download>AI・Drive説明資料</a><a class="btn ghost" href="AI_PRICING.md" download>料金と上限の説明</a></p></div></div>
<div class="box" style="margin-top:18px"><h3>1体から資料を辿って復旧</h3><p>設定の「AI・botの復旧と循環運営」で、担当の設定・次に戻す担当・最後の作業地点を復旧ZIPに保存できます。必要な担当から順に戻し、普段は作成と別担当の確認を少量ずつ受け渡します。ログイン・再認証・実botの作成・起動は人が行います。</p></div>
<h3 style="margin-top:22px">AIサービスの料金と上限（参考）</h3>${priceTable}
<p class="small">AIに渡した情報には、相手のサービスの保存・学習・利用規約が適用されます。実名・健康・福祉の利用者の情報を含むファイルは特に慎重に。提案は正しいとは限らないので、最後は人が確認します。</p></div></section>

<section id="feedback"><div class="wrap"><p class="k">FEEDBACK</p><h2>ご意見・不具合のご報告</h2>
<p>${repo ? '<a class="btn ghost" href="' + esc(repo) + '/issues" rel="noopener noreferrer">GitHubで報告する（Issues）</a>' : 'このページの公開元（GitHubのリポジトリ）の「Issues」から送れます。'}</p>
<p class="small">報告には、版・画面・やったこと・起きたことだけを書いてください。記録の中身・バックアップファイル・実名・連絡先は添付しないでください。セキュリティの問題は、公開のIssuesではなく、リポジトリの「Security」から非公開で報告してください。</p></div></section>
</main>
<footer><div class="wrap"><p>こもれびデスク v${esc(version)}｜業務利用無料｜無断改変・再配布・ソフト販売禁止｜記録はあなたの端末の中だけに保存されます。</p><p><a href="SHA256SUMS.txt" download>全ファイルの確認用ハッシュ（SHA-256）</a>　<a href="rates.json" download>制度値ファイル（rates.json）</a></p></div></footer>
</body></html>`;
  fs.writeFileSync(path.join(out, 'index.html'), html);
  // AI料金の説明（キットと同じ内容）を配布物に置く
  fs.copyFileSync(path.join(root, 'DRIVE_START_KIT/05_料金とリミット.md'), path.join(out, 'AI_PRICING.md'));
};
