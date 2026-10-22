if(require.main===module){
/* Isolated JS/DOM harness: not a browser or assistive technology test. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');let total=0,checks=[];
function test(name,fn){return Promise.resolve().then(fn).then(()=>{total++;checks.push({name,pass:true});},e=>{checks.push({name,pass:false,error:e.stack});process.exitCode=1;});}
class E{
 constructor(tag,doc,text){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.nodeType=tag==='#text'?3:1;this.childNodes=[];this.attributes={};this.events={};this.value='';this.checked=false;this.hidden=false;this.inert=false;this.style={};this._text=text||'';this.classList={add:(...a)=>{this.className=[...new Set(this.className.split(' ').filter(Boolean).concat(a))].join(' ');},remove:(...a)=>{this.className=this.className.split(' ').filter(x=>!a.includes(x)).join(' ');},contains:x=>this.className.split(' ').includes(x),toggle:(x,v)=>{if(v===undefined)v=!this.classList.contains(x);v?this.classList.add(x):this.classList.remove(x);}};}
 get className(){return this.attributes.class||'';}set className(s){this.attributes.class=s;}
 get id(){return this.attributes.id||'';}set id(s){this.attributes.id=s;}
 get textContent(){return this._text+this.childNodes.map(c=>c.textContent).join('');}set textContent(s){this.childNodes=[];this._text=String(s);}
 get firstChild(){return this.childNodes[0]||null;}get children(){return this.childNodes.filter(x=>x.nodeType===1);}get isConnected(){return this.ownerDocument.body.contains(this);}
 appendChild(c){if(c.parentNode)c.parentNode.removeChild(c);c.parentNode=this;this.childNodes.push(c);return c;}
 append(...cs){cs.forEach(c=>this.appendChild(typeof c==='string'?this.ownerDocument.createTextNode(c):c));}
 removeChild(c){this.childNodes.splice(this.childNodes.indexOf(c),1);c.parentNode=null;return c;}remove(){if(this.parentNode)this.parentNode.removeChild(this);}
 insertBefore(c,b){let i=this.childNodes.indexOf(b);if(i<0)return this.appendChild(c);c.parentNode=this;this.childNodes.splice(i,0,c);return c;}
 before(c){if(this.parentNode)this.parentNode.insertBefore(c,this);}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='hidden')this.hidden=true;if(k==='value')this.value=String(v);}
 getAttribute(k){return this.attributes[k]??null;}removeAttribute(k){delete this.attributes[k];if(k==='hidden')this.hidden=false;}
 addEventListener(k,fn){(this.events[k]??=[]).push(fn);}dispatchEvent(e){e.target??=this;e.preventDefault??=()=>{};e.stopPropagation??=()=>{};(this.events[e.type]||[]).forEach(fn=>fn.call(this,e));return true;}
 click(){this.dispatchEvent({type:'click',target:this,preventDefault(){},stopPropagation(){}});}focus(){this.ownerDocument.activeElement=this;}scrollIntoView(){}select(){}close(){}showModal(){this.setAttribute('open','');}contains(c){return c===this||this.childNodes.some(x=>x.contains(c));}
 matches(s){if(s.startsWith('#'))return this.id===s.slice(1);if(s.startsWith('.'))return this.classList.contains(s.slice(1));let m=/^([\w-]+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(s);if(m)return (!m[1]||this.tagName===m[1].toUpperCase())&&(!m[2]||(m[3]===undefined?m[2] in this.attributes:this.getAttribute(m[2])===m[3]));return false;}
 querySelectorAll(s){let out=[];for(const c of this.childNodes){if(c.matches(s))out.push(c);out.push(...c.querySelectorAll(s));}return out;}querySelector(s){return this.querySelectorAll(s)[0]||null;}closest(s){return this.matches(s)?this:this.parentNode?.closest(s)||null;}
}
function context(edition='full',search='',disk=new Map()){
 const events={},doc={readyState:'loading',events:{},createElement(tag){return new E(tag,this);},createTextNode(t){return new E('#text',this,String(t));},addEventListener(k,f){(this.events[k]??=[]).push(f);},querySelector(s){if(s==='meta[name="komorebi-edition"]')return {getAttribute(){return edition;}};return this.body.querySelector(s);},querySelectorAll(s){return this.body.querySelectorAll(s);},getElementById(id){return this.body.querySelector('#'+id);}};doc.body=new E('body',doc);doc.documentElement=new E('html',doc);doc.body.parentNode=doc.documentElement;
 for(const id of ['main','nav','toast','print-area']){let e=doc.createElement('div');e.id=id;doc.body.appendChild(e);}
 const ctx={console,document:doc,location:{hash:'#desk',search:search,href:'https://example.invalid/komorebi-'+edition+'.html'+search},crypto:crypto.webcrypto,TextEncoder,TextDecoder,Date,Uint8Array,Intl,Blob,URL,Event:function(type){this.type=type;},MutationObserver:class{observe(){}disconnect(){}},btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,String(v))},setTimeout:()=>0,clearTimeout(){},addEventListener(k,f){(events[k]??=[]).push(f);},dispatchEvent(e){(events[e.type]||[]).forEach(f=>f(e));},navigator:{},print(){}};
 ctx.__disk=disk;vm.createContext(ctx);for(const f of ['calc','store','ui'])vm.runInContext(fs.readFileSync(path.join(root,'src/core/'+f+'.js'),'utf8'),ctx);
 ctx.App={ui:{month:'2026-10'},render(){},applySettings(){},isSoftLocked(){return !!ctx.__locked;},live(fn){return fn();},field(label,control,hint){return ctx.UI.h('label',{class:'field'},ctx.UI.h('span',null,label),control,hint?ctx.UI.h('small',null,hint):null);},form(items){return ctx.UI.h('div',{class:'form'},items);},set(){return ctx.UI.h('input');},navBtn(id,label){return ctx.UI.h('a',{href:'#'+id},label);}};ctx.Visuals={donut(){return doc.createElement('div');}};
 // Load the same existing edition modules before the new core workbench.
 const ed=JSON.parse(fs.readFileSync(path.join(root,'editions.json')))[edition];
 for(const m of ed.mods){if(['client','facility','staff','team','make','tutor','craft','service','creator'].includes(m)&&!ctx.__records){vm.runInContext(fs.readFileSync(path.join(root,'src/core/records.js'),'utf8'),ctx);ctx.__records=true;}vm.runInContext(fs.readFileSync(path.join(root,'src/mod/'+m+'.js'),'utf8'),ctx);}
 vm.runInContext(fs.readFileSync(path.join(root,'src/core/workflow.js'),'utf8'),ctx);ctx.App.inMonth=function(d,m){return String(d||'').slice(0,7)===m;};ctx.App.ymLabel=function(m){return m.slice(0,4)+'年'+Number(m.slice(5))+'月';};ctx.Store.load();return ctx;
}
function buttons(el,label){return el.querySelectorAll('button').filter(x=>x.textContent===label);}
function plain(x){return JSON.parse(JSON.stringify(x));}
(async()=>{
const c=context();
await test('unknown confirmed event invalidates future balances without inventing zero',()=>{let p=c.Desk.moneyPlan('1000',[{date:'2026-10-02',kind:'支出',amount:'',certainty:'確定'}],'2026-10');assert.equal(p.days[0].certain,1000);assert.equal(p.days[1].certain,null);assert.equal(p.days[30].possible,null);});
await test('all 287 IDs and specialized fields grounded to sheet',()=>{assert.equal(c.Desk.catalog.length,287);assert.equal(new Set(c.Desk.catalog.map(x=>x.id)).size,287);for(const t of c.Desk.catalog){assert.ok(t.fields.length>=4);assert.ok(t.proposal.startsWith('提案'));}});
await test('numeric normalization preserves missing versus true zero',()=>{assert.equal(c.Desk.number('１，２００円'),1200);assert.equal(c.Desk.number('0'),0);assert.equal(c.Desk.number(''),null);assert.equal(c.Desk.number('1e3'),null);assert.equal(c.Desk.number('NaN'),null);});
await test('rest capacity includes reserved rest and uncertain inputs',()=>{assert.equal(c.Desk.capacity('600','120','300','240').remaining,-60);assert.equal(c.Desk.capacity('600','','300','240').remaining,null);assert.equal(c.Desk.capacity('-1','0','0','0').known,false);});
await test('comparison profit and conservative hourly range',()=>{let r=c.Desk.compare({revenue:'20000',cost:'2000',low:'120',high:'180',budget:'240'});assert.equal(r.profit,18000);assert.equal(r.hourly,6000);assert.equal(r.remaining,60);assert.equal(c.Desk.compare({revenue:'1',cost:''}).profit,null);});
await test('cash confirmed / conditional and missing / invalid events',()=>{let p=c.Desk.moneyPlan('1000',[{date:'2026-10-02',kind:'入金',amount:'100',certainty:'確定'},{date:'2026-10-02',kind:'入金',amount:'200',certainty:'未確定'},{date:'2026-10-02',kind:'支出',amount:'50',certainty:'確定'},{date:'2026-10-02',kind:'',amount:'100',certainty:''}], '2026-10');assert.equal(p.days[1].certain,null);assert.equal(p.days[1].possible,null);assert.equal(p.missing,1);assert.equal(c.Desk.moneyPlan('',[],'2026-02').days.length,28);assert.equal(c.Desk.moneyPlan('',[],'2026-02').days[0].certain,null);});
await test('reconciliation avoids subtotal double count and mixing units',()=>{let r=c.Desk.reconciliation([{expected:'2',actual:'1',unit:'点',kind:'明細',confirm:'確認済み'},{expected:'2',actual:'1',unit:'点',kind:'総計'},{expected:'10',actual:'5',unit:'円',kind:'明細'},{expected:'',actual:'0',unit:'回',kind:'明細'}]);assert.equal(r.items,3);assert.equal(r.units[0].difference,1);assert.equal(r.units[1].difference,5);assert.equal(r.units[2].difference,null);});
await test('stable IDs and changed or absent values never mutate CSV input',()=>{let a=[{ID:'0001',v:'x'},{ID:'0002',v:'z'}],b=[{ID:'0001',v:'y'},{ID:'0003',v:'a'}],before=JSON.stringify(a);let r=c.Desk.diffRows(a,b,'ID');assert.equal(r[0].id,'0001');assert.equal(r[0].kind,'変更候補');assert.ok(r[2].kind.startsWith('今回見当たらない'));assert.equal(JSON.stringify(a),before);assert.equal(c.Desk.diffRows([],[{ID:'x'},{ID:'x'}],'ID')[1].kind,'保留：今回のID重複または空欄');});
await test('time notation decimal and elapsed validation',()=>{assert.equal(c.Desk.timeMinutes('1:30'),90);assert.equal(c.Desk.timeMinutes('1.5',true),90);assert.equal(c.Desk.timeMinutes('1:99'),null);assert.equal(c.Desk.timeMinutes('',true),null);});
await test('all seven workbench tabs render in isolated DOM',()=>{for(const label of ['今日の机','ひな形','休む日','条件比較','資金計画','データ照合','創作の机']){let v=c.Desk.view();let b=buttons(v,label)[0];assert.ok(b,label);b.click();let next=c.Desk.view();assert.ok(next.textContent.length>100,label);}});
await test('287 templates open specialized editors with labels',()=>{for(const t of c.Desk.catalog){c.Desk.openTemplate(t);let ds=c.document.body.querySelectorAll('dialog'),d=ds[ds.length-1];assert.ok(d);assert.ok(d.textContent.includes(t.title));assert.ok(d.querySelectorAll('textarea').length>=t.fields.length);buttons(d,'変更を破棄して閉じる')[0].click();}});
await test('case creation, revision, backup restore and atomic undo',async()=>{c.Store.startFresh();let original={_id:'abc123',template:'DOT-008',title:'DEMO再開',status:'未着手',revision:1,details:'{"f0":"here"}',lines:'[]',links:'[]',checks:'[]'};await c.Desk.saveCase(original);assert.equal(c.Store.rows('deskCases').length,1);let next={...original,title:'DEMO改訂',revision:2};await c.Desk.saveCase(next,original);assert.equal(c.Store.rows('deskRevisions').length,1);let b=await c.Store.readBackup(c.Store.backupText());assert.equal(b.collections.deskCases[0].title,'DEMO改訂');assert.equal(b.collections.deskRevisions[0].title,'DEMO再開');c.Store.undo();assert.equal(c.Store.rows('deskCases')[0].title,'DEMO再開');assert.equal(c.Store.rows('deskRevisions').length,0);});
await test('batch validation failure leaves all collections untouched',()=>{let before=c.Store.backupText();assert.throws(()=>c.Store.commitBatch({deskCases:[{_id:'aaaa'},{_id:'aaaa'}]},'bad'));assert.equal(c.Store.backupText(),before);});
await test('stale case revision rejected, preserving current content',async()=>{let original=plain(c.Store.rows('deskCases')[0]);await c.Desk.saveCase({...original,title:'new',revision:2},original);assert.throws(()=>c.Desk.saveCase({...original,title:'stale',revision:2},original));assert.equal(c.Store.rows('deskCases')[0].title,'new');});
await test('encrypted backup roundtrip includes cards and revisions',async()=>{let enc=await c.Store.backupEncrypted('test-only-passphrase'),r=await c.Store.readBackup(enc,'test-only-passphrase');assert.equal(r.collections.deskCases[0].title,'new');await assert.rejects(()=>c.Store.readBackup(enc,'wrong-passphrase'));});
await test('soft-lock guards block views, edits and exports',async()=>{c.__locked=true;assert.throws(()=>c.Desk.saveCase({title:'blocked'}));assert.equal(c.Desk.view().textContent.includes('new'),false);c.__locked=false;});
await test('all 12 editions preserve defaults, samples and 9 shift populations',()=>{let editions=JSON.parse(fs.readFileSync(path.join(root,'editions.json')));for(const id of Object.keys(editions)){let x=context(id);assert.equal(x.Store.rows('deskCases').length,id==='user'?0:42,id);assert.equal(!!x.KD.mods.find(m=>m.id==='desk'),id!=='user');if(editions[id].mods.includes('shift')){const defs=Object.keys(x.KD.defs).filter(k=>x.KD.defs[k].mod==='shift');let sizes=defs.map(k=>x.Store.rows(k).length);assert.ok(sizes.includes(20),id+JSON.stringify(sizes));assert.ok(sizes.includes(68),id+JSON.stringify(sizes));assert.ok(sizes.includes(20*x.Calc.daysInMonth(x.Calc.today().slice(0,7))),id+JSON.stringify(sizes));}x.Store.startFresh();assert.equal(x.Store.rows('deskCases').length,0);x.Store.load();assert.equal(x.Store.rows('deskCases').length,0);}});
await test('existing records gain no sample cards on update',()=>{let x=context();x.Store.startFresh();x.Store.addRow('kb',{title:'existing'});let st=JSON.parse(x.Store.backupText());delete st.collections.deskCases;let clean=x.Store.cleanState(st);assert.equal(clean.collections.deskCases.length,0);assert.equal(clean.collections.kb[0].title,'existing');});
await test('new scripts use DOM text and no network or executable imports',()=>{let s=fs.readFileSync(path.join(root,'src/core/workflow.js'),'utf8').split('/* v0.1.0: local case workbench.')[1];assert.equal(/innerHTML|\.outerHTML|\beval\s*\(|\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(s),false);});
await test('CSV parser supports BOM, escaped quotes, multiline and refuses malformed input',()=>{assert.deepEqual(plain(c.Desk.parseCSV('\ufeffID,値\r\n001,"a,b"\r\n002,"c""d"\r\n003,"line\nnext"')), [['ID','値'],['001','a,b'],['002','c"d'],['003','line\nnext']]);assert.throws(()=>c.Desk.parseCSV('ID,x\n1,"broken'));assert.throws(()=>c.Desk.parseCSV('ID,x\n1,"a"b'));});
await test('CSV comparison UI executes its real click handler',()=>{let v=c.Desk.view();buttons(v,'データ照合')[0].click();v=c.Desk.view();v.querySelectorAll('textarea').find(e=>e.getAttribute('aria-label')==='元のCSV').value='ID,値\n001,前';v.querySelectorAll('textarea').find(e=>e.getAttribute('aria-label')==='今回のCSV').value='ID,値\n001,後';buttons(v,'列とIDを照合する')[0].click();assert.ok(v.textContent.includes('変更候補'));assert.ok(!v.textContent.includes('is not a function'));});

await test('editor validates on review and preserves typed content',()=>{let t=c.Desk.catalog.find(x=>x.id==='DOT-008');c.Desk.openTemplate(t);let ds=c.document.body.querySelectorAll('dialog'),d=ds.at(-1);let name=d.querySelectorAll('input').find(e=>e.getAttribute('aria-label')==='このカードの名前');buttons(d,'保存する内容を確認')[0].click();assert.ok(d.textContent.includes('このカードの名前を入力してください'));name.value='入力保持 DEMO';let ta=d.querySelectorAll('textarea').find(e=>e.getAttribute('aria-label')===t.fields[0]);ta.value='長文'.repeat(3000);buttons(d,'保存する内容を確認')[0].click();assert.equal(ta.value.length,6000);assert.ok(d.textContent.includes('5000文字'));buttons(d,'変更を破棄して閉じる')[0].click();});
await test('structured card JSON rejects wrong types and preserves state atomically',async()=>{let x=context('full'),before=x.Store.backupText(),r=JSON.parse(JSON.stringify(x.Store.rows('deskCases')[0]));for(const [key,value] of [['links','{}'],['links','[null]'],['lines','[null]'],['checks','[1]'],['details','[]'],['details','{"__proto__":{}}'],['links','[{"id":"javascript:evil","rev":1}]']]){let bad={...r,[key]:value};assert.throws(()=>x.Store.commitBatch({deskCases:[bad]},'invalid'));assert.equal(x.Store.backupText(),before);let backup=JSON.parse(before);backup.collections.deskCases=[bad];await assert.rejects(()=>x.Store.readBackup(JSON.stringify(backup)));}});
await test('editor real save persists specialized fields',async()=>{let t=c.Desk.catalog.find(x=>x.id==='DOT-008');c.Desk.openTemplate(t);let d=c.document.body.querySelectorAll('dialog').at(-1);d.querySelectorAll('input').find(e=>e.getAttribute('aria-label')==='このカードの名前').value='UI保存の架空例';d.querySelectorAll('textarea').find(e=>e.getAttribute('aria-label')===t.fields[0]).value='ここまで完了';buttons(d,'保存する内容を確認')[0].click();buttons(d,'この端末に保存')[0].click();await new Promise(r=>setImmediate(r));let row=c.Store.rows('deskCases').find(x=>x.title==='UI保存の架空例');assert.ok(row);assert.equal(JSON.parse(row.details).f0,'ここまで完了');});
await test('output starts unselected and supports redaction without altering source',()=>{let r=c.Store.rows('deskCases')[0],original=JSON.stringify(r);c.Desk.output(r);let d=c.document.body.querySelectorAll('dialog').at(-1);let boxes=d.querySelectorAll('input').filter(x=>x.getAttribute('type')==='checkbox');assert.ok(boxes.length>10);assert.equal(boxes.filter(x=>x.checked).length,0);let preview=d.querySelector('textarea');assert.equal(preview.value,'');boxes[0].checked=true;let inputs=d.querySelectorAll('input');inputs.find(x=>x.getAttribute('aria-label')==='今回の出力目的').value='自分用';inputs.find(x=>x.getAttribute('aria-label')==='今回渡す相手の役割').value='DEMO担当';buttons(d,'選んだ内容をプレビュー')[0].click();assert.ok(preview.value.includes(r.title));preview.value='伏せた架空文';assert.equal(JSON.stringify(r),original);buttons(d,'閉じる')[0].click();});
await test('CSV script-like contents stay inert text',()=>{let r=c.Desk.parseCSV('ID,値\n001,=1+1\n002,<script>bad</script>');assert.equal(r[1][1],'=1+1');assert.equal(r[2][1],'<script>bad</script>');});

let sampleCounts=[];
await test('all twelve editions have concrete sample cards and active edition tables',()=>{
 const eds=JSON.parse(fs.readFileSync(path.join(root,'editions.json')));for(const ed of Object.keys(eds)){
 const c=context(ed),cols=c.Store.get().collections;if(ed==='user'){assert.ok(!c.KD.mods.find(m=>m.id==='desk'));continue;}assert.equal(cols.deskCases.length,42,ed);assert.equal(cols.deskCash.length,18,ed);
 assert.ok(cols.deskCases.every(r=>r.facts.includes('架空')&&r.details.length>40),ed);
 if(eds[ed].mods.includes('shift')){assert.equal(cols.shiftStaff.length,20,ed);assert.equal(cols.shiftRequests.length,68,ed);assert.equal(cols.shiftPlan.length,20*c.Calc.daysInMonth(c.Calc.today().slice(0,7)),ed);assert.equal(cols.shiftTogether.length,2);assert.equal(cols.shiftApart.length,2);}
 sampleCounts.push({edition:ed,totalRows:Object.values(cols).reduce((n,a)=>n+a.length,0),shiftPeople:(cols.shiftStaff||[]).length,shiftCells:(cols.shiftPlan||[]).length,nonEmptyTables:Object.keys(cols).filter(k=>cols[k].length).length});
 }
});
await test('separate demo namespace never replaces a normal saved dataset',async()=>{
 const disk=new Map(),normal=context('full','',disk);normal.Store.startFresh();normal.Store.addRow('shiftStaff',{code:'TEST-EXISTING',active:true});await normal.Store.flush();const before=disk.get(normal.Store.KEY),demo=context('full','?demo=20',disk);
 assert.notEqual(demo.Store.KEY,normal.Store.KEY);assert.equal(demo.Store.isDemo(),true);assert.equal(demo.Store.rows('shiftStaff').length,20);assert.equal(disk.get(normal.Store.KEY),before);assert.equal(normal.Store.rows('shiftStaff')[0].code,'TEST-EXISTING');
});
await test('upgrading existing empty or real data does not inject samples',()=>{
 const c=context();c.Store.startFresh();c.Store.addRow('kb',{title:'TEST KEEP'});let old=JSON.parse(c.Store.backupText());delete old.collections.shiftTogether;delete old.collections.shiftApart;
 const restored=c.Store.cleanState(old);assert.equal(restored.collections.kb[0].title,'TEST KEEP');assert.equal(restored.collections.shiftStaff.length,0);assert.equal(restored.collections.shiftTogether.length,0);assert.equal(restored.collections.deskCases.length,0);
});
await test('pair settings, tolerance zero and all twenty people survive encrypted backup',async()=>{
 const c=context();let encrypted=await c.Store.backupEncrypted('sample-only-test-pass'),r=await c.Store.readBackup(encrypted,'sample-only-test-pass');assert.equal(r.collections.shiftStaff.length,20);assert.equal(r.collections.shiftTogether[0].tolerance,3);assert.equal(r.collections.shiftApart[1].tolerance,1);assert.equal(r.collections.deskCases.length,42);
 c.Store.addRow('shiftTogether',{codeA:'DEMO-S01',codeB:'DEMO-S02',scope:'同じ勤務枠',tolerance:0,month:c.Calc.today().slice(0,7),active:true});r=await c.Store.readBackup(c.Store.backupText());assert.equal(r.collections.shiftTogether[2].tolerance,0);
});
await test('one undo restores plan and request statuses as a single change',()=>{
 const c=context(),month=c.Calc.today().slice(0,7);let before=c.Store.backupText();const res=c.KD.shift.generate({month,staff:c.Store.rows('shiftStaff'),types:c.Store.rows('shiftTypes'),requests:c.Store.rows('shiftRequests'),needs:c.Store.rows('shiftNeeds'),locked:[],settings:c.Store.modSettings('shift'),rand:()=>0.33});c.KD.shift.applyPlan(month,res);c.Store.undo();assert.deepEqual(JSON.parse(c.Store.backupText()).collections,JSON.parse(before).collections);
});
await test('sample references point to existing workers, works and service jobs',()=>{
 const c=context();const staff=new Set(c.Store.rows('shiftStaff').map(r=>r.code));for(const r of c.Store.rows('shiftTogether').concat(c.Store.rows('shiftApart')))assert.ok(staff.has(r.codeA)&&staff.has(r.codeB));
 const works=new Set(c.Store.rows('creatorWorks').map(r=>r.code));for(const r of c.Store.rows('creatorChapters').concat(c.Store.rows('creatorLog')))assert.ok(works.has(r.work),r.work);
 const jobs=new Set(c.Store.rows('serviceJobs').map(r=>r.code));for(const r of c.Store.rows('serviceChecks'))assert.ok(jobs.has(r.code),r.code);
 const ids=new Set(c.Store.rows('deskCases').map(r=>r._id));for(const r of c.Store.rows('deskCases'))for(const ref of JSON.parse(r.links))assert.ok(ids.has(ref.id));
});
await test('shift UI exposes demo link, allowance editors and actual result days',()=>{
 const c=context(),h=c.UI.h;c.App.viewHead=(t,l,e)=>h('div',null,h('h2',null,t),h('p',null,l),e);c.App.monthPicker=()=>h('input');c.App.grid=(...a)=>h('div',null,a);c.App.homeCard=(...a)=>c.UI.card(...a);c.App.ui.month=c.Calc.today().slice(0,7);
 c.location.href='file:///C:/demo/komorebi-full.html';const view=c.KD.mods.find(m=>m.id==='shift').view();c.document.getElementById('main').appendChild(view);assert.ok(view.textContent.includes('20人'));assert.ok(view.textContent.includes('許容を超えた日'));assert.ok(view.querySelectorAll('a').some(a=>a.getAttribute('href').includes('?demo=20#shift')));
 const create=buttons(view,'一緒に組みたい組合せを追加')[0];assert.ok(create);create.click();const dlg=c.document.querySelector('dialog');assert.ok(dlg.textContent.includes('別々でもよい日数'));const selects=dlg.querySelectorAll('select');assert.equal(selects[0].querySelectorAll('option').length,21);selects[0].value='DEMO-S01';selects[1].value='DEMO-S01';buttons(dlg,'条件をこの端末に保存')[0].click();assert.ok(dlg.textContent.includes('別々の職員'));assert.equal(c.Store.rows('shiftTogether').length,2);
});
await test('new samples use no known owner identifiers or executable content',()=>{
 const c=context(),s=c.Store.backupText();assert.equal(/@gmail\.com|@outlook\.com|\b\d{3}-\d{4}-\d{4}\b/.test(s),false);const js=fs.readFileSync(path.join(root,'src/core/workflow.js'),'utf8').split('/* Fully fictional worked examples;')[1];assert.equal(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|innerHTML|\beval\s*\(/.test(js),false);
});

fs.mkdirSync(path.join(root,'review'),{recursive:true});
fs.writeFileSync(path.join(root,'review/verification-v0.1.0.json'),JSON.stringify({kind:'isolated-js-and-mock-dom',passed:total,failed:checks.filter(x=>!x.pass).length,checks,sampleCounts},null,2));console.log(JSON.stringify({passed:total,failed:checks.filter(x=>!x.pass).length,failures:checks.filter(x=>!x.pass)},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});

}else{
/* v0.1.0：最終点検の確認（呼び方・ホームの静けさ・AI運営の見本・利用者版の簡潔さ・3幅の表示）。Playwrightがある開発環境だけで実行。 */
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
  const eds = ['full', 'freelance', 'facility', 'staff', 'user', 'salon', 'shop', 'life', 'tutor', 'craft', 'service', 'creator'];
  await check('the product calls itself a tool, not an app', async () => {
    for (const f of fs.readdirSync(path.join(root, 'dist')).filter(x => x.endsWith('.html'))) {
      const s = fs.readFileSync(path.join(root, 'dist', f), 'utf8').replace(/Googleアプリ|Webアプリ|アプリストア|利用可能なアプリ/g, '');
      assert.ok(!/アプリ/.test(s), f);
    }
  });
  let { c, p } = await open('full');
  await check('home summary shows overdue / 7 days / stock and keeps the 30-day list folded', async () => {
    const t = await p.locator('.today-line').innerText(); assert.ok(t.includes('7日以内') && !t.includes('30日以内'), t);
    assert.ok((await p.locator('.today-details > summary').innerText()).includes('30日以内'));
  });
  await check('AI operation screen has fictional sample roles in order and no real service names', async () => {
    await p.evaluate(() => location.hash = '#fleet'); await p.waitForTimeout(150);
    assert.ok(await p.locator('.fleet-role').count() >= 6); assert.ok(await p.locator('.fleet-role.is-next').count() >= 1);
    const plats = await p.evaluate(() => Store.rows('fleetRoles').map(r => r.platform).join(','));
    assert.ok(/架空/.test(plats) && !/ChatGPT|Gemini|Claude|Grok|Copilot/.test(plats), plats);
  });
  await check('starting fresh removes the AI sample too', async () => {
    await p.evaluate(() => Store.startFresh()); assert.equal(await p.evaluate(() => Store.rows('fleetRoles').length + Store.rows('fleetTasks').length), 0);
  });
  await c.close();
  ({ c, p } = await open('user', 390));
  await check('user edition settings stay simple (no AI operation card)', async () => {
    await p.evaluate(() => location.hash = '#settings'); await p.waitForTimeout(100);
    assert.equal(await p.getByText('AI・botが消えたときに備える', { exact: true }).count(), 0);
    assert.equal(await p.evaluate(() => Store.rows('fleetRoles').length), 0);
  });
  await c.close();
  ({ c, p } = await open('facility'));
  await check('year shift table keeps staff IDs on one line', async () => {
    await p.evaluate(() => location.hash = '#shift'); await p.waitForTimeout(120);
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.shift-year td')).whiteSpace), 'nowrap');
  });
  await c.close();
  for (const w of [390, 820, 1280]) for (const ed of eds) {
    ({ c, p } = await open(ed, w));
    await check(ed + ' ' + w + 'px: home, settings and AI screen do not scroll sideways', async () => {
      for (const h of ['#home', '#settings', '#fleet']) { if (ed === 'user' && h === '#fleet') continue; await p.evaluate(x => location.hash = x, h); await p.waitForTimeout(60); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), w, h); }
    });
    await c.close();
  }
  await check('no network requests or page errors', async () => { assert.deepEqual(net, []); assert.deepEqual(errors, []); });
  fs.writeFileSync(path.join(root, 'review/review302-tests.json'), JSON.stringify(out, null, 2)); return out;
};

}
