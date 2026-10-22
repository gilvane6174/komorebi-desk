const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),root=path.resolve(__dirname,'..');let n=0;
for(const dir of ['src/core','src/mod'])for(const f of fs.readdirSync(path.join(root,dir))){if(!f.endsWith('.js'))continue;new vm.Script(fs.readFileSync(path.join(root,dir,f),'utf8'),{filename:f});n++;}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/manifest.json'),'utf8'));
// 通信先の決まり：build.cjsと同じ条件で「最新情報に更新」の取得先を求め、
// 取得先なし→connect-src 'none'、取得先あり→その https の1か所だけを許す（それ以外は失敗）。
function expectedConnect(){let url=process.env.KOMOREBI_UPDATE_URL||'';const repo=process.env.GITHUB_REPOSITORY||'';
 if(!url&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)){const [o,n]=repo.split('/');url='https://'+o.toLowerCase()+'.github.io/'+n+'/rates.json';}
 if(!url)return "'none'";const u=new URL(url);if(u.protocol!=='https:')throw Error('Update URL must be https');return u.origin;}
const CONNECT=expectedConnect();
function connectSrc(html){const m=html.match(/connect-src ([^;"]*)/);if(!m)throw Error('Network CSP missing');return m[1].trim();}
for(const f of manifest){let html=fs.readFileSync(path.join(root,'dist',f.file),'utf8');if(connectSrc(html)!==CONNECT)throw Error('Network CSP: expected connect-src '+CONNECT+' in '+f.file);if(crypto.createHash('sha256').update(html).digest('hex')!==f.sha256)throw Error('Hash mismatch');for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)){const hash=crypto.createHash('sha256').update(m[1]).digest('base64');if(!html.includes("'sha256-"+hash+"'"))throw Error('Script hash');}if(/<script[^>]+src=|<img|<iframe|<link[^>]+href=/i.test(html))throw Error('External resource element');}
console.log('PASS syntax '+n+' source files; CSP/hashes/resources '+manifest.length+' editions; connect-src '+CONNECT);
