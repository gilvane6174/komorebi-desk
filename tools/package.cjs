/* Reproducible release ZIPs using Node built-ins only. Run build.cjs first. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {zip}=require('./zip.cjs'),root=path.resolve(__dirname,'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'package-info.json'),'utf8')).version;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const docs=['README.md','SAFE_USE_GUIDE.md','DATA_FORMAT.md','SECURITY.md','LICENSE'];
function walk(folder){const base=path.join(root,folder),out=[];for(const item of fs.readdirSync(base,{withFileTypes:true})){const name=folder+'/'+item.name;if(item.isDirectory())out.push(...walk(name));else if(item.isFile())out.push(name);}return out.sort();}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/manifest.json'),'utf8'));
if(manifest.length!==Object.keys(JSON.parse(fs.readFileSync(path.join(root,'editions.json'),'utf8'))).length)throw Error('Edition manifest does not match');
for(const entry of manifest){const html=fs.readFileSync(path.join(root,'dist',entry.file));if(hash(html)!==entry.sha256)throw Error('Stale HTML hash: '+entry.file);if(!html.toString('utf8').includes('v'+version))throw Error('Stale edition version');}
// 単体利用ZIPは許可リストで組み立てる（distに私的ファイルが置かれていても入れない。想定外のファイルがあれば中止）
const SINGLE_ALLOW=new Set(['index.html','start-here.html','rates.json','manifest.json','SHA256SUMS.txt','AI_PRICING.md','DRIVE_START_KIT.zip',...manifest.map(e=>e.file),...fs.readdirSync(path.join(root,'docs/screens')).map(n=>'screens/'+n)]);
const distFiles=walk('dist').map(p=>p.slice(5));
const unexpected=distFiles.filter(n=>!SINGLE_ALLOW.has(n));
if(unexpected.length)throw Error('Unexpected file(s) in dist (not packaged; remove them and rebuild): '+unexpected.join(', '));
const single=distFiles.filter(n=>SINGLE_ALLOW.has(n)).map(n=>({name:n,data:fs.readFileSync(path.join(root,'dist',n))}));
single.push(...docs.map(p=>({name:p,data:fs.readFileSync(path.join(root,p))})));
const repoPaths=['src','tests','.github','DRIVE_START_KIT','docs'].flatMap(walk).filter(p=>p!=='docs/DOT_COVERAGE_v0.1.0.md').concat([
  'tools/build.cjs','tools/check.cjs','tools/landing.cjs','tools/zip.cjs','tools/screens.py','tools/package.cjs',
  '.gitignore','editions.json','package-info.json',...docs
]);
const repo=repoPaths.map(p=>({name:p,data:fs.readFileSync(path.join(root,p))}));
// 公開物の検査：ツールが書き出す私的ファイル名、記録データの形をしたファイル、既知の私的パターンが入っていたら止める（.gitignoreだけに頼らない）
const PRIVATE_NAME=/(^|\/)(komorebi-[^/]*\.(json|csv|txt|png|zip)|[^/]*_保管\.json|AI確認用_[^/]*\.json|確定申告まとめ_[^/]*\.csv|医療費の明細_[^/]*\.csv|fleet\.json|role-[^/]*\.md|00_OWNER\.md|00_START_HERE\.md|[^/]*\.csv|\.env[^/]*)$/i;
function scanPublic(entries,kind){for(const f of entries){
  if(PRIVATE_NAME.test(f.name))throw Error(kind+': private-looking file: '+f.name);
  if(/\.(json|txt|csv|md)$/i.test(f.name)){const t=f.data.toString('utf8');
    if(/"collections"\s*:/.test(t)&&/"settings"\s*:/.test(t)&&!/^tests\//.test(f.name))throw Error(kind+': saved-record shaped data: '+f.name);
    if(/komorebi-(enc|locked)-v1"[^]{0,200}"data"\s*:/.test(t))throw Error(kind+': encrypted backup: '+f.name);
    if(/-----BEGIN [A-Z ]*PRIVATE KEY-----|\bghp_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}/.test(t))throw Error(kind+': secret-like text: '+f.name);}
}}
scanPublic(single,'single');scanPublic(repo,'github');


if(repo.length+1>100)throw Error('GitHub upload exceeds 100 files: '+(repo.length+1));
const out=path.join(root,'deliverables');fs.mkdirSync(out,{recursive:true});const release=[];
for(const [kind,entries] of [['単体利用_12版一式',single],['GitHubアップロード用',repo]]){
  entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  if(new Set(entries.map(x=>x.name)).size!==entries.length)throw Error('Duplicate ZIP names');
  if(entries.some(x=>/(^|\/)(?:node_modules|deliverables|\.env|\.git)(\/|$)|(?:backup|test-results).*\.json$/i.test(x.name)))throw Error('Unexpected private/runtime file');
  const sums=entries.map(e=>hash(e.data)+'  '+e.name).join('\n')+'\n';
  entries.push({name:'PACKAGE_SHA256SUMS.txt',data:Buffer.from(sums,'utf8')});
  const data=zip(entries),name='こもれびデスク_v'+version+'_'+kind+'.zip';
  fs.writeFileSync(path.join(out,name),data);release.push({name,bytes:data.length,files:entries.length,sha256:hash(data)});
}
fs.writeFileSync(path.join(out,'RELEASE.json'),JSON.stringify({version,files:release},null,2)+'\n');
console.log(JSON.stringify(release));
