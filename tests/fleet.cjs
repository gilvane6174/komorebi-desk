const assert=require('assert/strict'),fs=require('fs'),path=require('path');
module.exports=async(browser,root)=>{
 const out=[],net=[],errors=[],cx=await browser.newContext({viewport:{width:1280,height:900}}),p=await cx.newPage();p.setDefaultTimeout(5000);
 p.on('request',r=>{if(/^https?:/.test(r.url()))net.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
 const test=async(name,fn)=>{try{await fn();out.push({name,pass:true});}catch(e){out.push({name,pass:false,error:e.message});}};
 await p.goto('file:///'+path.join(root,'dist/komorebi-full.html').replaceAll('\\','/'));await p.getByRole('button',{name:'サンプルを見てみる',exact:true}).click();
 await test('sample mode shows fictional roles and DEMO jobs only; clearing leaves the optional feature empty',async()=>{const r=await p.evaluate(()=>{var d=Fleet.data(),demo=d.tasks.every(t=>/^DEMO-/.test(t.code)&&/架空/.test(t.title+t.resultRef)),log=d.log.length;['fleetRoles','fleetTasks','fleetLog'].forEach(k=>{Store.get().collections[k]=[];});Store.changed();return {roles:d.roles.length,demo,log,after:Fleet.data().roles.length+Fleet.data().tasks.length+Fleet.data().log.length};});assert.deepEqual(r,{roles:13,demo:true,log:0,after:0});});
 await test('seed keeps other business records and preserves custom role instructions',async()=>{
  assert.deepEqual(await p.evaluate(async()=>{var before=JSON.stringify(Store.rows('ledger'));await Fleet.initialize(Store.backupText());return {roles:Fleet.data().roles.length,same:before===JSON.stringify(Store.rows('ledger')),instructions:Fleet.data().roles.every(r=>r.instructions.length>100)};}),{roles:13,same:true,instructions:true});
 });
 await test('seeding twice does not overwrite saved profiles',async()=>assert.equal(await p.evaluate(async()=>{try{await Fleet.initialize(Store.backupText());return false;}catch(e){return Fleet.data().roles.length===13;}}),true));
 await test('the first bot is followed by safety and then remaining roles',async()=>{
  assert.deepEqual(await p.evaluate(async()=>{var a=(await Fleet.nextRoles(Fleet.data())).map(r=>r.key);await Fleet.confirmRole('organize',Store.backupText());var b=(await Fleet.nextRoles(Fleet.data())).map(r=>r.key);await Fleet.confirmRole('safety',Store.backupText());var c=(await Fleet.nextRoles(Fleet.data())).map(r=>r.key);await Fleet.confirmRole('review',Store.backupText());return {a,b,c:c.length};}),{a:['organize'],b:['safety'],c:11});
 });
 await test('future dependencies cannot be confirmed prematurely',async()=>{
  assert.equal(await p.evaluate(async()=>{var d=Fleet.data();d.roles.find(r=>r.key==='draft').after='tool';try{Fleet.validate(d);Store.setRow('fleetRoles',d.roles.find(r=>r.key==='draft')._id,{after:'tool'});await Fleet.confirmRole('draft',Store.backupText());return false;}catch(e){Store.setRow('fleetRoles',d.roles.find(r=>r.key==='draft')._id,{after:'safety'});return true;}}),true);
 });
 await test('cycles, dangling dependencies and repeated role keys are rejected',async()=>assert.deepEqual(await p.evaluate(()=>[d=>{d.roles[0].after='safety'},d=>{d.roles[0].after='missing'},d=>{d.roles[1].key=d.roles[0].key}].map(f=>{var d=Fleet.data();f(d);try{Fleet.validate(d);return false}catch(e){return true}})),[true,true,true]));
 await test('recovery package includes only fleet records and all role cards',async()=>{
  const buf=Buffer.from(await p.evaluate(async()=>{var x=await Fleet.snapshot(),b=await Fleet.bundle(x).arrayBuffer();return Array.from(new Uint8Array(b));}));
  let at=0,names=[],texts=[];while(buf.readUInt32LE(at)===0x04034b50){let n=buf.readUInt16LE(at+26),size=buf.readUInt32LE(at+18),name=buf.subarray(at+30,at+30+n).toString('utf8');names.push(name);texts.push(buf.subarray(at+30+n,at+30+n+size).toString('utf8'));at+=30+n+size;}
  assert.equal(names.length,16);assert.ok(names.includes('00_START_HERE.md')&&names.includes('00_OWNER.md')&&names.includes('roles/review.md'));const x=JSON.parse(texts[names.indexOf('fleet.json')]);assert.deepEqual(Object.keys(x.payload).sort(),['log','roles','tasks']);assert.ok(texts[0].includes('2体目'));assert.ok(texts[1].includes('再認証')||texts[1].includes('認証'));
 });
 await test('default tasks start unapproved and completed or stopped tasks are not issued',async()=>{
  assert.deepEqual(await p.evaluate(async()=>{for(var i=0;i<6;i++)Store.addRow('fleetTasks',{code:'job'+i,title:'架空の仕事'+i,roleKey:'organize',reviewerKey:'review',status:i===4?'停止':i===5?'完了':'未着手',checkpoint:'架空の地点',next:'次の差分',approved:i!==3});var x=await Fleet.prepareCycle();globalThis.__packet=x;return {n:x.items.length,codes:x.items.map(t=>t.code),same:x.responseTemplate.packetId===x.packetId};}),{n:3,codes:['job0','job1','job2'],same:true});
 });
 await test('a work packet is bounded and cannot be issued twice',async()=>{
  assert.equal(await p.evaluate(async()=>{await Fleet.issue(__packet,Store.backupText());try{await Fleet.issue(__packet,Store.backupText());return false}catch(e){try{await Fleet.prepareCycle();return false}catch(e){return true}}}),true);
 });
 await test('altered or duplicate packet items are rejected before storage changes',async()=>{
  assert.equal(await p.evaluate(async()=>{var n=Fleet.data().log.length,old=Store.rows('fleetTasks')[3];Store.setRow('fleetTasks',old._id,{approved:true});var p=await Fleet.prepareCycle();p.items.push(p.items[0]);try{await Fleet.issue(p,Store.backupText());return false}catch(e){return Fleet.data().log.length===n;}}),true);
 });
 await test('creator cannot self-approve completion or change permissions in the report',async()=>{
  assert.deepEqual(await p.evaluate(async()=>{var r=JSON.parse(JSON.stringify(__packet.responseTemplate));r.results=r.results.slice(0,1);r.results[0].outcome='完了候補';try{await Fleet.previewResult(JSON.stringify(r));var a=false}catch(e){var a=true}r.results[0].outcome='確認待ち';r.results[0].approved=true;try{await Fleet.previewResult(JSON.stringify(r));return [a,false]}catch(e){return [a,true]}}),[true,true]);
 });
 await test('report preview does not mutate records; human commit hands work to a different reviewer',async()=>{
  assert.deepEqual(await p.evaluate(async()=>{var r=JSON.parse(JSON.stringify(__packet.responseTemplate));r.results=r.results.slice(0,1);r.results[0].checkpoint='下書きできた';r.results[0].resultRef='draft/example.md';var before=Store.backupText();await Fleet.previewResult(JSON.stringify(r));var same=before===Store.backupText();await Fleet.applyResult(JSON.stringify(r),before);globalThis.__report=JSON.stringify(r);var next=await Fleet.prepareCycle();globalThis.__reviewPacket=next;var t=next.items.find(t=>t.code==='job0');return {same,status:Store.rows('fleetTasks')[0].status,role:t.roleKey,phase:t.phase};}),{same:true,status:'確認待ち',role:'review',phase:'確認'});
 });
 await test('already applied reports cannot be applied again',async()=>assert.equal(await p.evaluate(async()=>{try{await Fleet.applyResult(__report,Store.backupText());return false}catch(e){return true}}),true));
 await test('review → fix → fresh creator packet respects the last checkpoint',async()=>{
  assert.deepEqual(await p.evaluate(async()=>{var p=__reviewPacket;p.items=p.items.filter(t=>t.code==='job0');await Fleet.issue(p,Store.backupText());var r={format:'komorebi-cycle-result-v1',packetId:p.packetId,results:[{taskId:p.items[0].taskId,outcome:'修正',checkpoint:'根拠1点を修正',resultRef:'review/example.md'}]};await Fleet.applyResult(JSON.stringify(r),Store.backupText());var q=await Fleet.prepareCycle(),t=q.items.find(x=>x.code==='job0');return {role:t.roleKey,phase:t.phase,last:t.checkpoint};}),{role:'organize',phase:'作成',last:'根拠1点を修正'});
 });
 await test('changing a task or stopping it rejects the stale result',async()=>{
  assert.equal(await p.evaluate(async()=>{var t=Store.rows('fleetTasks').find(t=>t.code==='job1');Store.setRow('fleetTasks',t._id,{status:'停止'});var r=JSON.parse(JSON.stringify(__packet.responseTemplate));r.results=r.results.filter(x=>x.taskId===t._id);try{await Fleet.previewResult(JSON.stringify(r));return false}catch(e){return true}}),true);
 });
 await test('edited tasks remain blocked until their old packet is cancelled',async()=>{assert.equal(await p.evaluate(async()=>{var t=Store.rows('fleetTasks').find(t=>t.code==='job2');Store.setRow('fleetTasks',t._id,{next:'差分を変更'});var q=await Fleet.prepareCycle();if(q.items.some(x=>x.taskId===t._id))return false;await Fleet.cancelPacket(__packet.packetId,Store.backupText());q=await Fleet.prepareCycle();return q.items.some(x=>x.taskId===t._id);}),true);});
 await test('changed profiles require fresh human verification',async()=>assert.deepEqual(await p.evaluate(async()=>{var r=Store.rows('fleetRoles')[0];Store.setRow('fleetRoles',r._id,{purpose:r.purpose+' 変更'});var v=await Fleet.readiness(Fleet.data());return [v.ready.organize,v.ready.safety,v.ready.review];}),[false,false,false]));
 await test('snapshot hash, secret patterns and dangerous keys are checked',async()=>{
  assert.deepEqual(await p.evaluate(async()=>{var x=await Fleet.snapshot(),a=JSON.parse(JSON.stringify(x));a.payload.roles[0].purpose+='改変';try{await Fleet.readSnapshot(JSON.stringify(a));var h=false}catch(e){var h=true}var d=Fleet.data();d.roles[0].instructions='api_key=DEMO_SECRET_123456789';try{Fleet.validate(d);var s=false}catch(e){var s=true}try{await Fleet.readSnapshot('{"__proto__":{}}');return [h,s,false]}catch(e){return [h,s,true]}}),[true,true,true]);
 });
 await test('restore preview leaves state; import retains checkpoints, stop/done states and other tables',async()=>{
  assert.deepEqual(await p.evaluate(async()=>{var x=await Fleet.snapshot(),before=Store.backupText(),ledger=JSON.stringify(Store.rows('ledger'));await Fleet.readSnapshot(JSON.stringify(x));var same=before===Store.backupText();await Fleet.restore(JSON.stringify(x),before);var d=Fleet.data();return {same,approved:d.tasks.some(t=>t.approved),ready:Object.values((await Fleet.readiness(d)).ready).some(Boolean),pending:d.log.some(l=>l.kind==='作業パック'&&!l.closed),stopped:d.tasks.find(t=>t.code==='job1').status,done:d.tasks.find(t=>t.code==='job5').status,last:d.tasks.find(t=>t.code==='job0').checkpoint,ledger:ledger===JSON.stringify(Store.rows('ledger'))};}),{same:true,approved:false,ready:false,pending:false,stopped:'停止',done:'完了',last:'根拠1点を修正',ledger:true});
 });
 await test('snapshot survives actual reload and a second AI starts from the saved index',async()=>{
  await p.evaluate(async()=>{await Store.flush();globalThis.__snapshotText=JSON.stringify(await Fleet.snapshot());});await p.reload();await p.evaluate(()=>location.hash='#fleet');assert.equal(await p.evaluate(()=>Fleet.data().roles.length),13);assert.equal(await p.evaluate(async()=>(await Fleet.nextRoles(Fleet.data()))[0].key),'organize');
 });
 await test('concurrent owner edits invalidate a pending restore',async()=>assert.equal(await p.evaluate(async()=>{var x=await Fleet.snapshot(),before=Store.backupText();Store.setSetting('ownerName','架空の変更');try{await Fleet.restore(JSON.stringify(x),before);return false}catch(e){return true}}),true));
 await test('operator UI has recovery, human-step instructions and no horizontal overflow',async()=>{
  await p.evaluate(()=>App.render());assert.ok(await p.getByRole('button',{name:'復旧ZIPを確認して保存',exact:true}).count());assert.ok((await p.locator('#main').innerText()).includes('人間の操作'));await p.setViewportSize({width:390,height:820});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);
 });
 await test('offline operation has no HTTP requests or page errors',async()=>{assert.deepEqual(net,[]);assert.deepEqual(errors,[]);});
 await cx.close();fs.writeFileSync(path.join(root,'review/fleet-tests.json'),JSON.stringify(out,null,2));return out;
};
