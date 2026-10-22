/* v2.9: holidays, statement mapping, invalid rows, and user confirmation. */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
module.exports = async (browser, root) => {
  const results = [], net = [], errors = [];
  const check = async (name, fn) => { try { await fn(); results.push({name, pass:true}); } catch(e) { results.push({name,pass:false,error:e.message}); } };
  const cx = await browser.newContext({viewport:{width:1280,height:900}}), p = await cx.newPage();
  p.setDefaultTimeout(5000);
  p.on('request', r => { if (/^https?:/.test(r.url())) net.push(r.url()); });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('file:///' + path.join(root, 'dist/komorebi-full.html').replaceAll('\\','/'));
  await p.getByRole('button',{name:'サンプルを見てみる',exact:true}).click();
  await check('published holiday dates include substitute and bridge days', async()=>{
    assert.deepEqual(await p.evaluate(()=>['2026-05-06','2026-09-22','2027-03-22','2028-01-01'].map(d=>KD.shift.holidayName(d,{}))), ['振替休日','国民の休日','振替休日','']);
  });
  await check('holiday settings preserve legacy weekdays and support weekend or closure', async()=>{
    assert.deepEqual(await p.evaluate(()=>{const t={code:'D',needWeekday:2,needWeekend:1};return [{},{holidayMode:'weekend'},{holidayMode:'closed'}].map(s=>KD.shift.dayNeed('2026-11-03',t,s,[]));}),[2,1,0]);
  });
  await check('date-specific staffing overrides holiday and weekday closures', async()=>{
    assert.equal(await p.evaluate(()=>KD.shift.dayNeed('2026-11-03',{code:'D',needWeekday:2,needWeekend:1},{holidayMode:'closed',closedDays:'火'},[{date:'2026-11-03',type:'D',count:3}])),3);
  });
  await check('holiday generator closes dates, honours leave, preserves locks and opens special needs', async()=>{
    const r=await p.evaluate(()=>{const input={month:'2026-11',staff:[{code:'A',active:true},{code:'B',active:true}],types:[{code:'D',needWeekday:1,needWeekend:1}],requests:[{date:'2026-11-03',code:'B',kind:'有給希望'}],locked:[{date:'2026-11-23',code:'A',type:'D'}],needs:[],settings:{holidayMode:'closed'},rand:()=>0.5};const a=KD.shift.generate(input);const b=KD.shift.generate({...input,needs:[{date:'2026-11-03',type:'D',count:1}]});return {a:a.rows.filter(x=>x.date==='2026-11-03').map(x=>x.type),locked:a.rows.find(x=>x.date==='2026-11-23'&&x.code==='A').locked,opened:b.rows.filter(x=>x.date==='2026-11-03').map(x=>x.type),short:b.shortages.filter(x=>x.date==='2026-11-03').length};});
    assert.deepEqual(r,{a:['休','有'],locked:true,opened:['D','有'],short:0});
  });
  await check('custom holidays reject invalid dates and do not infer unknown years',async()=>{
    assert.deepEqual(await p.evaluate(()=>['2028-01-01','2028-02-30','2028-02-29'].map(d=>KD.shift.holidayName(d,{holidayDates:'2028-01-01,2028-02-30\n2028-02-29'}))),['指定した休日','','指定した休日']);
  });
  await check('bank headers with units select transaction date and separate debit/credit',async()=>{
    assert.deepEqual(await p.evaluate(()=>BankCSV.guessCols(['照会口座','番号','勘定日','(起算日)','出金金額(円)','入金金額(円)','残高(円)','摘要'])),{date:2,desc:7,out:4,inn:5,amount:-1});
  });
  await check('card amount avoids fees, totals, monthly payment and carry-forward balance',async()=>{
    assert.deepEqual(await p.evaluate(()=>BankCSV.guessCols(['利用日','利用店名・商品名','支払方法','利用金額','支払手数料','支払総額','10月支払金額','11月繰越残高'])),{date:0,desc:1,out:-1,inn:-1,amount:3});
  });
  await check('English and full-width headings map without substring guesses',async()=>{
    assert.deepEqual(await p.evaluate(()=>BankCSV.guessCols([' Ｄａｔｅ ','Description','Debit','Credit','Balance'])),{date:0,desc:1,out:2,inn:3,amount:-1});
  });
  await check('ambiguous duplicate headings remain unselected',async()=>{
    assert.equal(await p.evaluate(()=>BankCSV.guessCols(['日付','摘要','金額','金額']).amount),-1);
  });
  await check('header recognition skips a date-only preamble',async()=>{
    assert.equal(await p.evaluate(()=>BankCSV.headerIndex([['日付','ダウンロード日'],['架空明細'],['取引日','摘要欄','入金額','出金額'],['2026/10/01','架空',0,100]])),2);
  });
  await check('conflicting or overlapping column mappings are rejected',async()=>{
    assert.deepEqual(await p.evaluate(()=>[{date:0,desc:1,out:2,inn:-1,amount:3},{date:0,desc:0,out:2,inn:-1,amount:-1},{date:0,desc:1,out:-1,inn:-1,amount:9}].map(ci=>{try{BankCSV.validateColumns(ci,4);return false}catch(e){return true}})),[true,true,true]);
  });
  await check('strict amounts accept ordinary formats and reject malformed or oversized values',async()=>{
    assert.deepEqual(await p.evaluate(()=>['１，２００円','△1,200円','(1,200)','1,00','12oops','9007199254740992',''].map(BankCSV.parseAmount)),[1200,-1200,-1200,null,null,null,0]);
  });
  await check('invalid dates, amounts and simultaneous debit/credit are counted separately',async()=>{
    assert.deepEqual(await p.evaluate(()=>{const r=BankCSV.prepareRows([['2026/10/01','架空',100,0],['bad','架空',100,0],['2026/10/02','架空','abc',0],['2026/10/03','架空',100,200],['2026/10/04','架空',0,500]],{date:0,desc:1,out:2,inn:3,amount:-1},'銀行振込',false);return {n:r.items.length,skipped:r.skipped,amounts:r.items.map(x=>x.amount),in:r.items.map(x=>x.isIn)};}),{n:2,skipped:3,amounts:[100,500],in:[false,true]});
  });
  await check('negative card refund follows the explicitly selected option',async()=>{
    assert.deepEqual(await p.evaluate(()=>[false,true].map(opt=>BankCSV.prepareRows([['2026/10/01','架空返品','-1200']],{date:0,desc:1,out:-1,inn:-1,amount:2},'カード',opt).items[0].isIn)),[false,true]);
  });
  await check('UTF-8 and Shift_JIS decode actual byte arrays',async()=>{
    assert.deepEqual(await p.evaluate(async()=>{const a=await BankCSV.readFile(new Blob([new TextEncoder().encode('日付,摘要\n2026/10/01,架空')]));const b=await BankCSV.readFile(new Blob([new Uint8Array([0x93,0xfa,0x95,0x74,0x2c,0x93,0x45,0x97,0x76])]));return [a.split('\n')[0],b];}),['日付,摘要','日付,摘要']);
  });
  await check('malformed or excessive CSV is rejected without silent truncation',async()=>{
    assert.deepEqual(await p.evaluate(()=>['日付,摘要\n2026/10/01,"未閉鎖',Array.from({length:5001},()=> 'a,b').join('\n'),Array.from({length:101},()=> 'a').join(',')].map(s=>{try{BankCSV.parseCSV(s);return false}catch(e){return true}})),[true,true,true]);
  });
  await check('changing holiday mode keeps stored plans until generation is confirmed',async()=>{
    await p.evaluate(()=>{App.ui.month='2026-11';location.hash='#shift';}); await p.waitForSelector('.shift-grid');
    const before=await p.evaluate(()=>JSON.stringify(Store.rows('shiftPlan')));
    await p.getByLabel('祝日の扱い').selectOption('closed');
    assert.equal(await p.evaluate(()=>JSON.stringify(Store.rows('shiftPlan'))),before);
    assert.ok((await p.locator('.holiday-note').innerText()).includes('3日 文化の日'));
    assert.ok(await p.locator('.holiday-mark').count()>=2);
    await p.getByRole('button',{name:'シフト案を作る',exact:true}).click();
    await p.locator('dialog').getByRole('button',{name:'やめる',exact:true}).click();
    assert.equal(await p.evaluate(()=>JSON.stringify(Store.rows('shiftPlan'))),before);
  });
  await check('unknown holiday year is visible in the interface',async()=>{
    await p.evaluate(()=>{App.ui.month='2028-01';App.render();});
    assert.ok((await p.locator('.holiday-note').innerText()).includes('未収録'));
  });
  await check('statement upload and mapping do not write before final confirmation',async()=>{
    await p.evaluate(()=>location.hash='#tax');
    const before=await p.evaluate(()=>JSON.stringify(Store.rows('ledger')));
    await p.getByRole('button',{name:'明細CSVを取り込む',exact:true}).click();
    await p.getByLabel('明細CSVファイル',{exact:true}).setInputFiles({name:'fictional.csv',mimeType:'text/csv',buffer:Buffer.from('ダウンロード日,2026/10/20\n取引日,摘要,出金金額(円),入金金額(円)\n2026/10/01,架空入金,,500\n2026/10/02,架空誤入力,100,200\n')});
    await p.locator('dialog').getByRole('button',{name:'次へ',exact:true}).click();
    assert.equal(await p.getByLabel('日付の列',{exact:true}).inputValue(),'0');
    await p.locator('dialog').getByRole('button',{name:'次へ',exact:true}).click();
    assert.ok((await p.locator('dialog').innerText()).includes('1行は日付・金額'));
    assert.equal(await p.evaluate(()=>JSON.stringify(Store.rows('ledger'))),before);
    await p.locator('dialog').getByRole('button',{name:'やめる',exact:true}).click();
    assert.equal(await p.evaluate(()=>JSON.stringify(Store.rows('ledger'))),before);
  });
  await check('no unexpected network requests or page errors',async()=>{assert.deepEqual(net,[]);assert.deepEqual(errors,[]);});

  // v0.1.0: fictional examples across all editions, without touching owner records.
  await check('sample records cover every business module with richer linked examples',async()=>{
    await p.evaluate(()=>Store.resetSample());
    assert.deepEqual(await p.evaluate(()=>({staff:Store.rows('shiftStaff').length,requests:Store.rows('shiftRequests').length,needs:Store.rows('shiftNeeds').length,users:Store.rows('facilityBenefits').length,clients:Store.rows('clients').length,customers:Store.rows('customers').length,products:Store.rows('products').length,students:Store.rows('lessonStudents').length,fees:Store.rows('lessonFees').length,orders:Store.rows('craftOrders').length,works:Store.rows('creatorWorks').length,jobs:Store.rows('serviceJobs').length,team:Store.rows('teamTasks').length,make:Store.rows('makeJobs').length,months:Store.rows('household').length})),{staff:20,requests:68,needs:3,users:18,clients:16,customers:36,products:18,students:20,fees:120,orders:54,works:10,jobs:56,team:30,make:30,months:12});
  });
  await check('fictional IDs connect requests, plans, invoices, lessons and recipes',async()=>{
    assert.equal(await p.evaluate(()=>{const has=(k,f,v)=>Store.rows(k).some(r=>r[f]===v);return Store.rows('shiftRequests').every(r=>has('shiftStaff','code',r.code))&&Store.rows('shiftPlan').every(r=>has('shiftStaff','code',r.code))&&Store.rows('facilityPlans').every(r=>has('facilityBenefits','person',r.person))&&Store.rows('invoices').every(r=>has('clients','name',r.client))&&Store.rows('lessonFees').every(r=>has('lessonStudents','student',r.student))&&Store.rows('craftRecipes').every(r=>has('craftProducts','code',r.product)&&has('craftMaterials','code',r.material));}),true);
  });
  await check('sample shift requests use distinct person/date pairs and honest statuses',async()=>{
    assert.equal(await p.evaluate(()=>{const requests=Store.rows('shiftRequests'),rows=Store.rows('shiftPlan');return new Set(requests.map(r=>r.code+'|'+r.date)).size===68&&new Set(requests.map(r=>r.code)).size===20&&requests.every(r=>{const v=rows.find(x=>x.code===r.code&&x.date===r.date),ok=v&&(r.kind==='有給希望'?v.type==='有':r.kind==='この勤務を希望'?v.type===r.want:v.type==='休'||v.type==='有');return r.status===(ok?'反映済':'調整中');});}),true);
  });
  await check('random sample regeneration changes data while retaining twenty anonymous shift staff',async()=>{
    assert.equal(await p.evaluate(()=>{const before=JSON.stringify(Store.rows('shiftRequests'));Store.resetSample();return before!==JSON.stringify(Store.rows('shiftRequests'))&&Store.rows('shiftStaff').length===20&&Store.rows('shiftStaff').every(r=>/^DEMO-S[0-9]{2}$/.test(r.code)&&r.memo.includes('完全架空'));}),true);
  });
  await check('existing saved owner records are not reseeded on reload',async()=>{
    const count=await p.evaluate(()=>{Store.addRow('teamTasks',{title:'OWNER_TEST',owner:'TEST',due:'',done:false,memo:'synthetic test marker'});return Store.rows('teamTasks').length;});await p.evaluate(()=>Store.flush());await p.reload();assert.equal(await p.evaluate(()=>Store.rows('teamTasks').length),count);assert.equal(await p.evaluate(()=>Store.rows('teamTasks').filter(x=>x.title==='OWNER_TEST').length),1);
  });
  await check('clearing sample data leaves all business and fleet collections empty',async()=>{
    await p.evaluate(()=>Store.startFresh());assert.equal(await p.evaluate(()=>Object.values(Store.get().collections).reduce((s,r)=>s+r.length,0)),0);assert.equal(await p.evaluate(()=>Store.get().sample),false);
  });
  await check('all twelve editions generate examples cleanly and every shift edition has twenty staff',async()=>{
    const eds=JSON.parse(fs.readFileSync(path.join(root,'editions.json')));const sampleErrors=[];p.on('console',m=>{if(m.type()==='error')sampleErrors.push(m.text());});
    for(const [id,ed] of Object.entries(eds)){const c2=await browser.newContext(),q=await c2.newPage();q.on('pageerror',e=>sampleErrors.push(e.message));q.on('console',m=>{if(m.type()==='error')sampleErrors.push(m.text());});await q.goto('file:///'+path.join(root,'dist/komorebi-'+id+'.html').replaceAll('\\','/'));await q.getByRole('button',{name:'サンプルを見てみる',exact:true}).click();const count=await q.evaluate(()=>Store.rows('shiftStaff').length);assert.equal(count,ed.mods.includes('shift')?20:0,id);if(ed.mods.includes('shift')){await q.evaluate(()=>location.hash='#shift');assert.ok(await q.locator('.shift-grid').count(),id);}assert.equal(await q.evaluate(()=>Object.values(Store.get().collections).flat().some(r=>Object.values(r).some(v=>typeof v==='string'&&/undefined|NaN/.test(v)))),false,id);await c2.close();}assert.deepEqual(sampleErrors,[]);
  });
  await check('sample screens remain offline and rendering reports no page errors',async()=>{assert.deepEqual(net,[]);assert.deepEqual(errors,[]);});

  await cx.close();
  fs.writeFileSync(path.join(root,'review/review29-tests.json'),JSON.stringify(results,null,2));
  return results;
};
