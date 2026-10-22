/* v0.1.0：耐久性の試験（外部レビュー指摘の4点）。保存失敗の救出・上限での無通知切捨てなし・大量データ・古い年の書き出し・2画面・破損。Playwrightがある開発環境だけで実行。 */
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
module.exports = async function (browser, root) {
  const out = [], net = [], errors = [];
  async function check(name, f) { try { await f(); out.push({ name, pass: true }); } catch (e) { out.push({ name, pass: false, error: e.message }); } }
  const url = id => 'file:///' + path.join(root, 'dist', 'komorebi-' + id + '.html').replaceAll('\\', '/');
  async function open(id, ctx) {
    const c = ctx || await browser.newContext({ viewport: { width: 1280, height: 900 } }), p = await c.newPage();
    p.on('request', r => { if (/^https?:/.test(r.url())) net.push(r.url()); }); p.on('pageerror', e => errors.push(id + ': ' + e.message));
    await p.goto(url(id)); return { c, p };
  }
  async function fresh(p) { await p.locator('dialog').getByRole('button', { name: 'サンプルを消して始める', exact: true }).click(); await p.waitForTimeout(80); const d = p.locator('dialog[open]'); if (await d.count()) await p.keyboard.press('Escape'); }
  // 架空の支援記録（1件約250文字）
  const make = (n, y) => `Array.from({length:${n}},(_,i)=>({date:'${y}-'+String(i%12+1).padStart(2,'0')+'-'+String(i%28+1).padStart(2,'0'),time:'10:00',person:'DEMO-U'+String(i%100+1).padStart(3,'0'),scene:'作業',author:'DEMO-S01',observed:'架空の記録：作業を最後まで行った。休憩は1回。',wish:'「次も同じ作業がしたい」',support:'手順表を一緒に確認した',view:'集中が続いている様子',next:'様子を見て継続',done:true}))`;

  let { c, p } = await open('staff'); await fresh(p);
  await check('save failure: screen keeps the row, shows a persistent alert with rescue export, stored data untouched', async () => {
    await p.evaluate(() => { Store.addRow('supportRecords', { date: '2026-10-01', person: 'DEMO-U001', observed: '保存前' }); });
    await p.evaluate(() => Store.flush()); const before = await p.evaluate(() => localStorage.getItem(Store.KEY));
    await p.evaluate(() => { const o = Storage.prototype.setItem; window.__restoreSet = () => { Storage.prototype.setItem = o; }; Storage.prototype.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }; Store.addRow('supportRecords', { date: '2026-10-02', person: 'DEMO-U002', observed: '保存できない追加' }); });
    await p.waitForTimeout(80);
    assert.equal(await p.locator('#save-alert').count(), 1);
    assert.ok(await p.locator('#save-alert').getByRole('button', { name: '今の記録を書き出す', exact: true }).count());
    assert.equal(await p.evaluate(() => localStorage.getItem(Store.KEY)), before);
    assert.ok(await p.evaluate(() => Store.backupText().includes('保存できない追加')), 'rescue export contains the unsaved row');
    await p.evaluate(() => location.hash = '#settings'); await p.waitForTimeout(80); assert.equal(await p.locator('#save-alert').count(), 1, 'alert stays on other screens');
    await p.evaluate(() => { window.__restoreSet(); Store.changed(); }); await p.waitForTimeout(80);
    assert.equal(await p.locator('#save-alert').count(), 0, 'alert clears after a successful save');
  });
  await check('5,000 rows: saved and reloaded without loss; 5,001st row is refused with a message, nothing truncated', async () => {
    await p.evaluate(`Store.get().collections.supportRecords=[];Store.addRows('supportRecords',${make(5000, 2025)});`); await p.evaluate(() => Store.flush());
    await p.reload(); await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => Store.rows('supportRecords').length), 5000);
    const err = await p.evaluate(() => { try { Store.addRow('supportRecords', { date: '2026-01-01' }); return ''; } catch (e) { return e.message; } });
    assert.ok(/5000件/.test(err), err); assert.equal(await p.evaluate(() => Store.rows('supportRecords').length), 5000);
    const imp = await p.evaluate(async () => { const st = JSON.parse(Store.backupText()); st.collections.supportRecords.push({ date: '2026-01-02' }); const raw = localStorage.getItem(Store.KEY); try { await Store.readBackup(JSON.stringify(st)); return 'accepted'; } catch (e) { return localStorage.getItem(Store.KEY) === raw ? 'refused-unchanged' : 'changed'; } });
    assert.equal(imp, 'refused-unchanged');
  });
  await check('near the limit: home and settings warn, list screen still renders quickly', async () => {
    assert.equal(await p.evaluate(() => Store.usage().level), 'danger');
    await p.evaluate(() => location.hash = '#home'); await p.waitForTimeout(100); assert.ok(await p.getByText('保存容量が9割を超えました', { exact: false }).count());
    const ms = await p.evaluate(() => { const t = performance.now(); location.hash = '#staff'; App.render(); return performance.now() - t; });
    assert.ok(ms < 3000, 'render ' + Math.round(ms) + 'ms');
    await p.evaluate(() => location.hash = '#settings'); await p.waitForTimeout(100); assert.ok(await p.locator('.usage-row').count() >= 2);
  });
  async function archiveRun(p, month, opts) {
    await p.evaluate(() => location.hash = '#settings'); await p.waitForTimeout(100);
    await p.evaluate(() => { const d = document.querySelector('details.archive'); if (d) d.open = true; });
    await p.locator('details.archive input[type=month]').fill(month);
    await p.locator('details.archive').getByRole('button', { name: '内容を確認する', exact: true }).click();
    if (opts.pass) await p.getByLabel('保管ファイルのパスフレーズ', { exact: true }).fill(opts.pass);
    await p.locator('dialog').getByRole('button', { name: '書き出す', exact: true }).click(); await p.waitForTimeout(150);
    if (opts.cancelExport) return;
    const saved = await p.evaluate(() => window.__saved);
    let text = opts.mutate ? opts.mutate(saved) : opts.useOld ? opts.useOld : saved;
    if (opts.pick !== false) await p.getByLabel('保存した保管ファイル', { exact: true }).setInputFiles({ name: 'archive.json', mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
    if (opts.pass) await p.getByLabel('保管ファイルのパスフレーズ（照合用）', { exact: true }).fill(opts.pass2 || opts.pass);
    await p.locator('dialog').getByRole('button', { name: '照合して外す', exact: true }).click(); await p.waitForTimeout(400);
  }
  await check('archive: export only starts the process; rows are removed only after the saved file is picked again and every row matches', async () => {
    await p.evaluate(() => { Store.get().collections.supportRecords.splice(0, 10); Store.addRows('supportRecords', [{ date: '2026-03-01', person: 'DEMO-U001', observed: '今年' }]); Store.changed(); });
    const n0 = await p.evaluate(() => Store.rows('supportRecords').length), cnt = () => p.evaluate(() => Store.rows('supportRecords').length);
    await p.evaluate(() => { window.__saved = ''; UI.saveFile = (n, t) => { window.__saved = t; return Promise.resolve(false); }; });
    await archiveRun(p, '2026-01', { cancelExport: true }); assert.equal(await cnt(), n0, 'cancelled export removes nothing');
    await p.evaluate(() => { UI.saveFile = (n, t) => { window.__saved = t; return Promise.resolve(true); }; });
    const old = await p.evaluate(() => { const st = JSON.parse(Store.backupText()); st.collections.supportRecords = st.collections.supportRecords.slice(0, 100); return JSON.stringify(st); });
    await archiveRun(p, '2026-01', { useOld: old }); assert.equal(await cnt(), n0, 'a different/older file removes nothing');
    await archiveRun(p, '2026-01', { mutate: t => { const st = JSON.parse(t); st.collections.supportRecords[5].observed = '書き換え'; return JSON.stringify(st); } }); assert.equal(await cnt(), n0, 'one changed row removes nothing');
    await archiveRun(p, '2026-01', { pick: false }); assert.equal(await cnt(), n0, 'no file picked removes nothing');
    await archiveRun(p, '2026-01', { pass: 'archive-pass-123', pass2: 'wrong-pass-456' }); assert.equal(await cnt(), n0, 'wrong passphrase removes nothing');
    await archiveRun(p, '2026-01', { pass: 'archive-pass-123' });
    const r = await p.evaluate(() => ({ left: Store.rows('supportRecords').map(x => x.date.slice(0, 7)), enc: JSON.parse(window.__saved).format, note: Store.settings().archiveNote }));
    assert.deepEqual(Array.from(new Set(r.left)), ['2026-03']); assert.equal(r.enc, 'komorebi-enc-v1'); assert.ok(/2026-01より前の4990件/.test(r.note), r.note);
    await p.evaluate(() => Store.undo()); assert.equal(await cnt(), n0, 'undo works while the page is open');
  });
  await check('100 people × 1 year (36,500 rows) is refused up front instead of being cut silently', async () => {
    const msg = await p.evaluate(`(()=>{const before=Store.rows('supportRecords').length;try{Store.addRows('supportRecords',${make(36500, 2026)});return 'added'}catch(e){return e.message+'|'+(Store.rows('supportRecords').length===before)}})()`);
    assert.ok(/5000件/.test(msg) && msg.endsWith('|true'), msg);
  });
  await c.close();
  ({ c, p } = await open('staff')); await fresh(p);
  await check('two screens: the stale one stops saving, shows the alert, and the newer data survives', async () => {
    const p2 = await c.newPage(); p2.on('pageerror', e => errors.push('p2: ' + e.message)); await p2.goto(url('staff')); await p2.waitForTimeout(120);
    await p.evaluate(() => { Store.addRow('supportRecords', { observed: 'A画面の追加' }); }); await p.evaluate(() => Store.flush());
    await p2.evaluate(() => { Store.addRow('supportRecords', { observed: 'B画面の古い追加' }); }); await p2.waitForTimeout(80);
    assert.equal(await p2.evaluate(() => Store.conflict()), true); assert.equal(await p2.locator('#save-alert').count(), 1);
    assert.ok(await p.evaluate(() => localStorage.getItem(Store.KEY).includes('A画面の追加')));
    assert.ok(!(await p.evaluate(() => localStorage.getItem(Store.KEY).includes('B画面の古い追加'))));
    await p2.close();
  });
  await check('near-simultaneous saves from two screens: one wins, the other is flagged and can still rescue its own change', async () => {
    const p2 = await c.newPage(); p2.on('pageerror', e => errors.push('p2: ' + e.message)); await p2.goto(url('staff')); await p2.waitForTimeout(120);
    await p.reload(); await p.waitForTimeout(120);
    for (let i = 0; i < 5; i++) {
      await Promise.all([p.evaluate(i => Store.addRow('supportRecords', { observed: 'A同時' + i }), i), p2.evaluate(i => Store.addRow('supportRecords', { observed: 'B同時' + i }), i)]);
      await p.waitForTimeout(60);
      const disk = await p.evaluate(() => localStorage.getItem(Store.KEY));
      for (const [pg, tag] of [[p, 'A同時' + i], [p2, 'B同時' + i]]) {
        if (disk.includes(tag)) continue;
        assert.equal(await pg.evaluate(() => Store.conflict()), true, tag + ' lost without a conflict flag');
        assert.ok(await pg.evaluate(t => Store.backupText().includes(t), tag), tag + ' not rescuable');
        assert.equal(await pg.locator('#save-alert').count(), 1);
      }
      if (await p.evaluate(() => Store.conflict()) || await p2.evaluate(() => Store.conflict())) break;
    }
    await p2.close();
  });
  await c.close();
  ({ c, p } = await open('staff')); await fresh(p);
  await check('lock really encrypts the stored data: no plain text left in any storage, reload needs the passphrase, changing it retires the old one', async () => {
    await p.evaluate(async () => { Store.addRow('supportRecords', { observed: '秘密の見本テキスト' }); await Store.flush(); });
    assert.ok(await p.evaluate(() => localStorage.getItem(Store.KEY).includes('秘密の見本テキスト')), 'plain before lock (documented)');
    await p.evaluate(() => Store.enableLock('first-pass-0001'));
    const leak = await p.evaluate(() => { const all = []; for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) all.push(s.getItem(s.key(i))); return all.some(v => /秘密の見本テキスト|DEMO-|supportRecords/.test(v)); });
    assert.equal(leak, false);
    await p.evaluate(() => location.hash = '#settings'); await p.waitForTimeout(100);
    await p.getByRole('button', { name: 'パスフレーズを変える', exact: true }).click();
    await p.getByLabel('今のパスフレーズ', { exact: true }).fill('wrong-pass-0000'); await p.getByLabel('新しいパスフレーズ', { exact: true }).fill('second-pass-0002'); await p.getByLabel('新しいパスフレーズの確認', { exact: true }).fill('second-pass-0002');
    await p.locator('dialog').getByRole('button', { name: '変える', exact: true }).click(); await p.waitForTimeout(1500);
    assert.ok(await p.evaluate(async () => { try { await Store.readBackup(localStorage.getItem(Store.KEY), 'first-pass-0001'); return true; } catch (e) { return false; } }), 'wrong current pass must not change it');
    await p.getByRole('button', { name: 'パスフレーズを変える', exact: true }).click();
    await p.getByLabel('今のパスフレーズ', { exact: true }).fill('first-pass-0001'); await p.getByLabel('新しいパスフレーズ', { exact: true }).fill('second-pass-0002'); await p.getByLabel('新しいパスフレーズの確認', { exact: true }).fill('second-pass-0002');
    await p.locator('dialog').getByRole('button', { name: '変える', exact: true }).click(); await p.waitForTimeout(2500);
    const r = await p.evaluate(async () => { const raw = localStorage.getItem(Store.KEY); let oldOk = true, newOk = false; try { await Store.readBackup(raw, 'first-pass-0001'); } catch (e) { oldOk = false; } try { newOk = (await Store.readBackup(raw, 'second-pass-0002')).collections.supportRecords.some(x => x.observed === '秘密の見本テキスト'); } catch (e) { } return { oldOk, newOk, plain: raw.includes('秘密') }; });
    assert.deepEqual(r, { oldOk: false, newOk: true, plain: false });
    await p.reload(); await p.waitForTimeout(150);
    assert.equal(await p.getByRole('heading', { name: 'ロック中', exact: true }).count(), 1);
    await p.getByLabel('パスフレーズ', { exact: true }).fill('second-pass-0002'); await p.getByRole('button', { name: '開く', exact: true }).click(); await p.waitForTimeout(1500);
    assert.ok(await p.evaluate(() => Store.rows('supportRecords').some(x => x.observed === '秘密の見本テキスト')));
  });
  await check('corrupt backup file is refused and current storage is unchanged', async () => {
    const r = await p.evaluate(async () => { const raw = localStorage.getItem(Store.KEY); try { await Store.readBackup('{"app":"komorebi-desk","collections":{"ledger":"x"'); return 'accepted'; } catch (e) { return localStorage.getItem(Store.KEY) === raw; } });
    assert.equal(r, true);
  });
  await c.close();
  // --- GPT独立レビュー R48〜R50 ---
  ({ c, p } = await open('staff')); await fresh(p);
  await check('R48: lock now with a failed save still hides the screen and stops input; the right passphrase reopens it and the unsaved row can be rescued', async () => {
    await p.evaluate(() => Store.enableLock('lock-pass-0001'));
    await p.evaluate(() => { Storage.prototype.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }; Store.addRow('supportRecords', { observed: '未保存のロック前メモ' }); });
    await p.evaluate(() => location.hash = '#settings'); await p.waitForTimeout(120);
    await p.getByRole('button', { name: '今すぐロック', exact: true }).click(); await p.waitForTimeout(300);
    assert.equal(await p.locator('#soft-lock').count(), 1);
    assert.equal(await p.evaluate(() => document.querySelector('.shell').hidden), true);
    assert.equal(await p.evaluate(() => document.getElementById('main').textContent.includes('未保存のロック前メモ')), false);
    await p.keyboard.press('Control+k'); await p.waitForTimeout(80); assert.equal(await p.locator('dialog.palette[open]').count(), 0, 'palette must not open');
    await p.evaluate(() => { location.hash = '#staff'; }); await p.waitForTimeout(80); assert.equal(await p.evaluate(() => document.getElementById('main').childElementCount), 0, 'navigation must not render');
    await p.getByLabel('パスフレーズ（未保存あり）', { exact: true }).fill('wrong-pass-9999'); await p.locator('#soft-lock').getByRole('button', { name: '開く', exact: true }).click(); await p.waitForTimeout(1500);
    assert.equal(await p.locator('#soft-lock').count(), 1);
    await p.getByLabel('パスフレーズ（未保存あり）', { exact: true }).fill('lock-pass-0001'); await p.locator('#soft-lock').getByRole('button', { name: '開く', exact: true }).click(); await p.waitForTimeout(1500);
    assert.equal(await p.locator('#soft-lock').count(), 0); assert.equal(await p.evaluate(() => document.querySelector('.shell').hidden), false);
    assert.equal(await p.locator('#save-alert').count(), 1); assert.ok(await p.evaluate(() => Store.backupText().includes('未保存のロック前メモ')));
  });
  await c.close();
  ({ c, p } = await open('life')); await fresh(p);
  await check('R49: a plain download is not counted as a finished backup until the downloaded file is picked and matches', async () => {
    await p.evaluate(() => { window.showSaveFilePicker = undefined; location.hash = '#settings'; }); await p.waitForTimeout(100);
    const before = await p.evaluate(() => Store.get().lastBackupAt);
    let dl = p.waitForEvent('download');
    await p.getByRole('button', { name: 'ボタン1つで全体バックアップ', exact: true }).click(); await p.locator('dialog').getByRole('button', { name: '暗号化しないで保存', exact: true }).click();
    await dl; await p.waitForTimeout(100);
    assert.ok(await p.locator('dialog').getByText('ダウンロードを開始しました', { exact: true }).count());
    await p.locator('dialog').getByRole('button', { name: 'あとで確認する', exact: true }).click(); await p.waitForTimeout(80);
    assert.equal(await p.evaluate(() => Store.get().lastBackupAt), before, 'not marked done');
    dl = p.waitForEvent('download');
    await p.getByRole('button', { name: 'ボタン1つで全体バックアップ', exact: true }).click(); await p.locator('dialog').getByRole('button', { name: '暗号化しないで保存', exact: true }).click();
    const d = await dl; const fp = await d.path(); await p.waitForTimeout(100);
    await p.getByLabel('保存したバックアップ（照合用）', { exact: true }).setInputFiles(fp);
    await p.locator('dialog').getByRole('button', { name: '照合する', exact: true }).click(); await p.waitForTimeout(150);
    assert.notEqual(await p.evaluate(() => Store.get().lastBackupAt), before, 'marked done after match');
  });
  await c.close();
  ({ c, p } = await open('full')); await fresh(p);
  await check('R50: archiving many tables at once is undone in one step', async () => {
    const r = await p.evaluate(() => {
      const keys = Object.keys(KD.defs).filter(k => KD.defs[k].fields.some(f => f.type === 'date'));
      keys.forEach(k => { const f = KD.defs[k].fields.filter(x => x.type === 'date'); const d = (f.find(x => x.k === 'date') || f[0]).k; const o = {}; o[d] = '2024-05-01'; Store.addRows(k, [o]); });
      const before = JSON.stringify(Store.get().collections), n = Store.archiveBefore('2025-01', 'test.json');
      const mid = keys.filter(k => Store.rows(k).length).length; Store.undo();
      return { tables: keys.length, removed: n, mid, same: JSON.stringify(Store.get().collections) === before };
    });
    assert.ok(r.tables >= 21, 'tables ' + r.tables); assert.equal(r.removed, r.tables); assert.equal(r.mid, 0); assert.equal(r.same, true);
  });
  await c.close();
  ({ c, p } = await open('staff', await browser.newContext({ viewport: { width: 390, height: 800 } }))); await fresh(p);
  await check('R54: while soft-locked, the phone bottom bar, search palette, dialogs and record search are all unreachable', async () => {
    await p.evaluate(() => Store.enableLock('lock-pass-0001'));
    await p.evaluate(() => { Store.addRow('supportRecords', { person: 'DEMO-U777', observed: '検索で見えてはいけない記録' }); Storage.prototype.setItem = function () { throw new Error('quota'); }; Store.addRow('supportRecords', { observed: 'x' }); });
    await p.evaluate(() => location.hash = '#settings'); await p.waitForTimeout(120);
    assert.equal(await p.locator('#mobilebar').isVisible(), true, 'bar visible before lock');
    await p.getByRole('button', { name: '今すぐロック', exact: true }).click(); await p.waitForTimeout(300);
    assert.equal(await p.locator('#soft-lock').count(), 1);
    assert.equal(await p.locator('#mobilebar').isVisible(), false, 'bottom bar hidden');
    assert.equal(await p.evaluate(() => document.getElementById('mobilebar').inert), true);
    const r = await p.evaluate(() => { const b = document.querySelector('#mobilebar button[aria-label="探す・操作を開く"]'); if (b) b.click(); const pal = !!document.querySelector('dialog.palette'); const hits = Pickup.find('DEMO-U777', 'all').length; location.hash = '#staff'; App.render(); UI.toast('t'); const vis = Array.from(document.body.children).filter(e => e.id !== 'soft-lock' && !e.hidden && getComputedStyle(e).display !== 'none' && e.offsetParent !== null).map(e => e.id || e.className || e.tagName); return { pal, hits, vis, text: document.body.innerText.includes('検索で見えてはいけない記録') }; });
    assert.deepEqual(r, { pal: false, hits: 0, vis: [], text: false });
    await p.getByLabel('パスフレーズ（未保存あり）', { exact: true }).fill('lock-pass-0001'); await p.locator('#soft-lock').getByRole('button', { name: '開く', exact: true }).click(); await p.waitForTimeout(1500);
    assert.equal(await p.locator('#mobilebar').isVisible(), true, 'bar back after unlock');
    assert.ok(await p.evaluate(() => Pickup.find('DEMO-U777', 'all').length) >= 1, 'search works again after unlock');
  });
  await c.close();
  await check('R55: a stray backup file in dist stops packaging (single and GitHub ZIPs alike)', async () => {
    const cp = require('child_process'), f = path.join(root, 'dist', 'komorebi-desk_full_DEMO.json');
    fs.writeFileSync(f, JSON.stringify({ settings: {}, collections: { ledger: [{ memo: 'DEMO' }] } }));
    try { const r = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'package.cjs')], { encoding: 'utf8' }); assert.notEqual(r.status, 0); assert.ok(/Unexpected file\(s\) in dist/.test(r.stderr), r.stderr.slice(0, 300)); }
    finally { fs.unlinkSync(f); }
  });
  // --- v0.1.0 セキュリティ点検 ---
  ({ c, p } = await open('life')); await fresh(p);
  await check('S1: no browser translation / cloud spellcheck / autofill history on record fields', async () => {
    const r = await p.evaluate(() => { location.hash = '#settings'; App.render(); const html = document.documentElement; const ins = Array.from(document.querySelectorAll('input:not([type=password]):not([type=file]):not([type=checkbox]):not([type=range]), textarea')); return { tr: html.getAttribute('translate'), sp: html.getAttribute('spellcheck'), meta: !!document.querySelector('meta[name=google][content=notranslate]'), n: ins.length, bad: ins.filter(i => i.getAttribute('autocomplete') !== 'off' || i.getAttribute('spellcheck') !== 'false').map(i => i.getAttribute('aria-label') || i.name || i.type) }; });
    assert.equal(r.tr, 'no'); assert.equal(r.sp, 'false'); assert.equal(r.meta, true); assert.ok(r.n > 3); assert.deepEqual(r.bad, []);
  });
  await check('S2: with real records and no lock, home explains the local-file risk once; dismiss hides it; lock on hides it', async () => {
    await p.evaluate(() => { Store.addRow('health', { date: Calc.today(), cond: '普通' }); location.hash = '#home'; App.render(); });
    assert.equal(await p.locator('.lock-notice').count(), 1);
    await p.locator('.lock-notice').getByRole('button', { name: 'このままにする', exact: true }).click(); await p.waitForTimeout(80);
    assert.equal(await p.locator('.lock-notice').count(), 0);
    await p.evaluate(async () => { Store.setSetting('lockNoticeOff', false); await Store.enableLock('lock-pass-0001'); App.render(); });
    assert.equal(await p.locator('.lock-notice').count(), 0);
  });
  await c.close();
  await check('S3: the tool refuses to run inside another page frame', async () => {
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kframe-')), f = path.join(dir, 'frame.html');
    fs.writeFileSync(f, '<iframe id="x" src="file:///' + path.join(root, 'dist', 'komorebi-life.html').replaceAll('\\', '/') + '" width="800" height="600"></iframe>');
    const cc = await browser.newContext(), pp = await cc.newPage(); await pp.goto('file:///' + f.replaceAll('\\', '/')); await pp.waitForTimeout(800);
    const fr = pp.frames().find(x => /komorebi-life/.test(x.url()));
    assert.ok(fr, 'frame loaded'); const t = await fr.evaluate(() => document.body.textContent);
    assert.ok(/枠の中では開けません/.test(t), t.slice(0, 80)); assert.equal(await fr.evaluate(() => !!document.getElementById('main')), false);
    await cc.close(); fs.rmSync(dir, { recursive: true, force: true });
  });
  await check('no network requests or page errors', async () => { assert.deepEqual(net, []); assert.deepEqual(errors, []); });
  fs.writeFileSync(path.join(root, 'review/durability-tests.json'), JSON.stringify(out, null, 2)); return out;
};
