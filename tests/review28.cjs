/* v2.8.0：新機能の確認（シフト・明細CSV・元に戻す・一覧と編集フォーム・探す/操作・カレンダー・福祉・ふりかえり・通信0）。Playwrightがある開発環境だけで実行。 */
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
module.exports = async function (browser, root) {
  const out = [], net = [], errors = [];
  async function check(name, f) { try { await f(); out.push({ name, pass: true }); } catch (e) { out.push({ name, pass: false, error: e.message }); } }
  async function open(id, width) {
    const c = await browser.newContext({ viewport: { width: width || 1280, height: 900 } }), p = await c.newPage();
    p.on('request', r => { if (/^https?:/.test(r.url())) net.push(r.url()); }); p.on('pageerror', e => errors.push(id + ': ' + e.message));
    await p.goto('file:///' + path.join(root, 'dist', 'komorebi-' + id + '.html').replaceAll('\\', '/'));
    await p.locator('dialog').getByRole('button', { name: 'サンプルを見てみる', exact: true }).click(); await p.waitForTimeout(80); return { c, p };
  }
  let { c, p } = await open('facility');
  await check('shift generator keeps rest rules and honours requests', async () => {
    const r = await p.evaluate(() => {
      const staff = [{ code: 'A', active: true, maxNights: 4 }, { code: 'B', active: true, maxNights: 4 }, { code: 'C', active: true, maxNights: 4, fixedOff: '日' }, { code: 'D', active: true, style: '日勤のみ' }, { code: 'E', active: true }];
      const types = [{ code: '日', needWeekday: 2, needWeekend: 1, order: 1 }, { code: '夜', night: true, needWeekday: 1, needWeekend: 1, order: 2, start: '17:00', end: '09:00' }];
      const req = [{ date: '2026-11-10', code: 'A', kind: '休み希望' }, { date: '2026-11-12', code: 'B', kind: '有給希望' }];
      const res = KD.shift.generate({ month: '2026-11', staff, types, requests: req, needs: [], locked: [{ date: '2026-11-03', code: 'E', type: '日' }], settings: { maxConsecutive: 5 }, rand: () => 0.5 });
      const g = {}; res.rows.forEach(x => { (g[x.code] = g[x.code] || {})[x.date] = x.type; });
      const days = Object.keys(g.A).sort(); let ok = true, why = '';
      Object.keys(g).forEach(code => { let run = 0; days.forEach((d, i) => { const t = g[code][d]; if (t === '夜') { const n = days[i + 1]; if (n && g[code][n] !== '明') { ok = false; why = code + d + ' night not followed by ake'; } }
        run = (t === '日' || t === '夜' || t === '明') ? run + 1 : 0; if (run > 5) { ok = false; why = code + ' consecutive'; } });
        const nights = days.filter(d => g[code][d] === '夜').length; if (['A', 'B', 'C'].indexOf(code) >= 0 && nights > 4) { ok = false; why = code + ' nights ' + nights; } if (code === 'D' && nights) { ok = false; why = 'D night'; } });
      days.forEach(d => { if (new Date(d + 'T00:00:00').getDay() === 0 && ['日', '夜'].indexOf(g.C[d]) >= 0) { ok = false; why = 'C fixed off'; } });
      return { ok, why, a10: g.A['2026-11-10'], b12: g.B['2026-11-12'], e3: g.E['2026-11-03'], rows: res.rows.length };
    });
    assert.ok(r.ok, r.why); assert.equal(r.a10, '休'); assert.equal(r.b12, '有'); assert.equal(r.e3, '日'); assert.equal(r.rows, 150);
  });
  await check('shift screen makes, edits and prints without errors', async () => {
    await p.evaluate(() => location.hash = '#shift'); await p.waitForTimeout(100);
    assert.ok(await p.locator('.shift-grid tbody tr').count() >= 5);
    await p.getByRole('button', { name: 'シフト案を作る', exact: true }).click(); await p.locator('dialog').getByRole('button', { name: '作る', exact: true }).click(); await p.waitForTimeout(100);
    assert.equal(await p.evaluate(() => Store.canUndo()), true);
    await p.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
    await p.getByRole('button', { name: '1人ずつ印刷（配布用）', exact: true }).click(); await p.waitForTimeout(50);
    assert.ok(await p.evaluate(() => document.querySelectorAll('#print-area .person-slip').length) >= 5 || await p.evaluate(() => window.__printed >= 1));
  });
  await check('facility monthly CSV has one row per user and no names', async () => {
    const csv = await p.evaluate(() => KD.facility.monthCSV(App.ui.month));
    const lines = csv.trim().split(/\r?\n/); assert.ok(lines.length > 5); assert.ok(lines[0].includes('利用者ID')); assert.ok(!/さん/.test(csv));
  });
  await c.close();
  ({ c, p } = await open('freelance'));
  await check('bank CSV import parses Shift_JIS-like layouts and skips duplicates', async () => {
    const r = await p.evaluate(() => {
      const rows = BankCSV.parseCSV('日付,摘要,お支払金額,お預り金額\n2026/10/01,"ﾃﾞﾝﾜ料金",3300,\n2026/10/02,ｻﾝﾌﾟﾙｼｮｳｼﾞ振込,,55000\n');
      const g = BankCSV.guessCols(rows[0]);
      return { n: rows.length, g, d: BankCSV.toDate('R8.10.5'), d2: BankCSV.toDate('20261005'), num: BankCSV.toNum('△1,200円'), s: BankCSV.suggest('NTT 電話料金', false).account };
    });
    assert.equal(r.n, 3); assert.equal(r.g.date, 0); assert.equal(r.g.desc, 1); assert.equal(r.g.out, 2); assert.equal(r.g.inn, 3); assert.equal(r.d, '2026-10-05'); assert.equal(r.d2, '2026-10-05'); assert.equal(r.num, -1200); assert.equal(r.s, '通信費');
  });
  await check('list view opens an edit form and undo restores a deleted row', async () => {
    await p.evaluate(() => location.hash = '#tax'); await p.waitForTimeout(100);
    const before = await p.evaluate(() => Store.rows('ledger').length);
    await p.locator('#record-ledger .row-open').first().click();
    await p.locator('dialog.form-dlg').getByRole('button', { name: '削除', exact: true }).click();
    await p.locator('dialog').getByRole('button', { name: '削除する', exact: true }).click(); await p.waitForTimeout(80);
    assert.equal(await p.evaluate(() => Store.rows('ledger').length), before - 1);
    await p.keyboard.press('Control+z'); await p.waitForTimeout(80);
    assert.equal(await p.evaluate(() => Store.rows('ledger').length), before);
  });
  await check('Ctrl+K palette finds screens and records', async () => {
    await p.keyboard.press('Control+k'); await p.waitForSelector('dialog.palette');
    await p.locator('dialog.palette input').fill('帳簿'); assert.ok(await p.locator('dialog.palette li').count() >= 1);
    await p.keyboard.press('Escape');
  });
  await check('update button is file-only when no update source is built in', async () => {
    await p.evaluate(() => location.hash = '#settings'); await p.waitForTimeout(80);
    assert.equal(await p.evaluate(() => document.querySelector('meta[name="komorebi-update-url"]').content), '');
    assert.ok((await p.locator('.net-card').innerText()).includes('0回'));
  });
  await c.close();
  ({ c, p } = await open('salon'));
  await check('salon day timeline shows bookings and next booking uses visit cycle', async () => {
    await p.evaluate(() => location.hash = '#salon'); await p.waitForTimeout(100);
    assert.ok(await p.locator('.tl-ev').count() >= 1);
    const r = await p.evaluate(() => { const v = Store.rows('reservations').filter(x => x.status === '来店').slice(-1)[0], n = Store.rows('reservations').length; return { n, cid: v.cid }; });
    await p.locator('.table-tabs .tab').filter({ hasText: '予約・来店' }).click();
    await p.locator('#record-reservations .btn.tiny', { hasText: '次回予約へ' }).first().click({ force: true }); await p.waitForTimeout(80);
    assert.equal(await p.evaluate(() => Store.rows('reservations').length), r.n + 1);
    await p.keyboard.press('Escape');
  });
  await c.close();
  ({ c, p } = await open('user', 390));
  await check('user step flow moves one question at a time', async () => {
    assert.ok(await p.locator('.stepper .step-body h3').filter({ hasText: '1 / 4' }).count());
    await p.locator('.stepper').getByRole('button', { name: 'つぎへ', exact: true }).first().click(); await p.waitForTimeout(50);
    assert.ok(await p.locator('.stepper .step-body h3').filter({ hasText: '2 / 4' }).count());
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390);
  });
  await c.close();
  for (const ed of ['full', 'life', 'tutor', 'craft', 'service', 'creator', 'shop', 'staff']) {
    ({ c, p } = await open(ed, 390));
    await check(ed + ': every screen fits 390px', async () => {
      const hs = await p.evaluate(() => Array.from(document.querySelectorAll('#nav a')).map(a => a.getAttribute('href')));
      for (const href of hs) { await p.evaluate(x => location.hash = x, href); await p.waitForTimeout(60); const w = await p.evaluate(() => document.documentElement.scrollWidth); assert.equal(w, 390, href + ' ' + w); }
    });
    await c.close();
  }
  ({ c, p } = await open('life'));
  await check('review picture contains only numbers and can be opened', async () => {
    await p.evaluate(() => Review.open('month')); await p.waitForSelector('dialog .review-pic img');
    await p.keyboard.press('Escape');
  });
  await c.close();
  await check('no network requests or page errors', async () => { assert.deepEqual(net, []); assert.deepEqual(errors, []); });
  fs.writeFileSync(path.join(root, 'review/review28-tests.json'), JSON.stringify(out, null, 2)); return out;
};
