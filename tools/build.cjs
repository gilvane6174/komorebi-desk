/*
 * こもれびデスク — 配布用HTMLを作る（Node.js 18以上。追加のインストール不要）
 *
 *   node tools/build.cjs
 *
 * ・版（エディション）の構成は editions.json だけで決める（ここに版の一覧を書かない）。
 * ・各版は、必要な画面のファイル（src/mod/*.js）だけを1つのHTMLにまとめる。
 * ・スクリプトはすべてインラインにし、CSPにハッシュを入れる。外部ファイル・外部通信なし。
 * ・「最新情報に更新」の取得先は、環境変数 KOMOREBI_UPDATE_URL か
 *   GitHub Actions の GITHUB_REPOSITORY から自動で決める（どちらもなければ取得機能はオフ）。
 *   取得先が決まった版だけ、CSPの connect-src にその1か所を入れる。
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });

const VERSION = JSON.parse(read('package-info.json')).version;
const editions = JSON.parse(read('editions.json'));
const RECORD_MODS = ['client', 'facility', 'staff', 'team', 'make', 'tutor', 'craft', 'service', 'creator'];

// ---- 「最新情報に更新」の取得先（1か所だけ。https のみ） ----
function updateSource() {
  let url = process.env.KOMOREBI_UPDATE_URL || '';
  const repo = process.env.GITHUB_REPOSITORY || '';
  if (!url && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    const [owner, name] = repo.split('/');
    url = 'https://' + owner.toLowerCase() + '.github.io/' + name + '/rates.json';
  }
  if (!url) return null;
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || !/\.json$/.test(u.pathname)) throw new Error('KOMOREBI_UPDATE_URL は https の .json だけ指定できます');
  return { url: u.href, origin: u.origin };
}
const source = updateSource();

// ---- 制度値ファイル（rates.json）：calc.js の既定値から作り、公開サイトに置く ----
function writeRates() {
  const vm = require('vm'), ctx = { console };
  ctx.this = ctx; vm.createContext(ctx);
  vm.runInContext(read('src/core/calc.js').replace(/\}\)\(this\);\s*$/, '})(globalThis);'), ctx);
  const C = ctx.Calc;
  const d = C.DEFAULT_RATES;
  const rates = { format: 'komorebi-rates-v1', label: d.label, checkedAt: d.checkedAt, values: d.values, sources: C.SOURCES.filter(s => /nenkin|mhlw|nta|mof/.test(s.url)) };
  fs.writeFileSync(path.join(out, 'rates.json'), JSON.stringify(rates, null, 2) + '\n');
}

function roleSettings() {
  const guide=read('DRIVE_START_KIT/担当別_役割の設定.md');
  const sections=guide.split(/(?=^## [^\n]+｜)/m);
  return Object.fromEntries(JSON.parse(read('src/roles.json')).map(r=>[r.key,{name:r.name,role:r.intro,guide:(sections.find(s=>s.startsWith('## '+r.name+'｜'))||r.intro).slice(0,5000)}]));
}
const sizes = [];
for (const [id, ed] of Object.entries(editions)) {
  const store = read('src/core/store.js')
    .replace("var DEV = root.KD_EDITIONS && EDITION === 'dev' ? root.KD_EDITIONS : null;", 'var DEV = root.KD_EDITIONS;')
    .replace("if (DEV) { var q = /[?&]edition=([a-z]{2,20})/.exec(root.location.search); EDITION = q && DEV[q[1]] ? q[1] : 'full'; }", "if (DEV && !DEV[EDITION]) throw new Error('Unknown edition');");
  const scripts = [
    `this.KD_EDITIONS=${JSON.stringify({ [id]: { ...ed, net: false } })};`,
    read('src/core/calc.js'), store, read('src/core/ui.js'), read('src/core/legal.js'), read('src/core/visuals.js')
  ];
  if (ed.mods.some(m => RECORD_MODS.includes(m))) scripts.push(read('src/core/records.js'));
  scripts.push(read('src/core/quicknotes.js'));
  scripts.push(read('src/core/reports.js'));
  for (const mod of ed.mods) scripts.push(read('src/mod/' + mod + '.js'));
  scripts.push(
    `this.KD.legal.push({id:'license',title:'利用許諾条件（全文）',body:[${JSON.stringify(read('LICENSE'))}]});`,
    read('src/core/app.js'), read('src/core/calendar.js'), read('src/core/consent.js'),
    'this.KD_ASSIST_ROLES=' + JSON.stringify(roleSettings()) + ';',
    read('src/core/assist.js'), read('src/core/care.js'), read('src/core/workflow.js'), read('src/core/review.js'), read('src/core/pickup.js'), read('src/core/bankcsv.js'), read('src/core/power.js'), read('src/core/fleet.js')
  );
  const hashes = scripts.map(s => "'sha256-" + crypto.createHash('sha256').update(s).digest('base64') + "'");
  const connect = source ? source.origin : "'none'";
  const csp = "default-src 'none'; script-src " + hashes.join(' ') + "; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; connect-src " + connect +
    "; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'; require-trusted-types-for 'script'; trusted-types 'none'";
  const html = read('src/index.template.html')
    .replace('{{CSP}}', csp)
    .replaceAll('{{EDITION}}', id).replaceAll('{{LABEL}}', ed.label).replaceAll('{{VERSION}}', VERSION)
    .replace('{{UPDATE_URL}}', source ? source.url : '')
    .replace('{{CSS}}', read('src/css/app.css'))
    .replace('{{SCRIPTS}}', scripts.map(s => '<script>' + s + '</script>').join('\n'));
  const filename = 'komorebi-' + id + '.html';
  fs.writeFileSync(path.join(out, filename), html);
  sizes.push({ id, label: ed.label, file: filename, bytes: Buffer.byteLength(html), sha256: crypto.createHash('sha256').update(html).digest('hex'), modules: ed.mods });
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(sizes, null, 2));
fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), sizes.map(x => x.sha256 + '  ' + x.file).join('\n') + '\n');
fs.copyFileSync(path.join(root, 'src/start-here.html'), path.join(out, 'start-here.html'));
writeRates();
fs.writeFileSync(path.join(out, 'DRIVE_START_KIT.zip'), require('./zip.cjs').zipDir(path.join(root, 'DRIVE_START_KIT'), 'DRIVE_START_KIT'));
require('./landing.cjs')(out, sizes, { version: VERSION, updateUrl: source ? source.url : '' });
console.log(JSON.stringify({ version: VERSION, update: source ? source.url : 'off', editions: sizes.map(x => ({ id: x.id, kb: Math.round(x.bytes / 1024) })) }));
