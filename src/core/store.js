/*
 * こもれびデスク — 保存と検証（このブラウザの localStorage だけ。外部送信なし）
 * ・各画面（モジュール）は KD.mod({...}) で表と画面を登録する
 * ・読み込むファイルは型を確かめ、危険なキーや知らない値を捨ててから取り込む
 * ・「ロック」をオンにすると、保存データ自体をパスフレーズで暗号化（AES-GCM 256bit）
 */
(function (root) {
  'use strict';
  var C = root.Calc;
  var meta = root.document.querySelector('meta[name="komorebi-edition"]');
  var EDITION = meta && /^[a-z]{2,20}$/.test(meta.getAttribute('content')) ? meta.getAttribute('content') : 'full';
  // 開発用（src/index.html）だけ：?edition=salon のように版を切り替えて確認できる。配布ファイルでは使わない
  var DEV = root.KD_EDITIONS && EDITION === 'dev' ? root.KD_EDITIONS : null;
  if (DEV) { var q = /[?&]edition=([a-z]{2,20})/.exec(root.location.search); EDITION = q && DEV[q[1]] ? q[1] : 'full'; }
  else if (EDITION === 'dev') EDITION = 'full';
  var DEMO=/(?:^|[?&])demo=20(?:&|$)/.test(root.location.search||'');
  var KEY = DEMO?'komorebi-desk:demo-v3.2:'+EDITION:'komorebi-desk:v2:'+EDITION;
  var MAX_IMPORT = 8 * 1024 * 1024;
  var BAD = Object.create(null); ['__proto__','constructor','prototype'].forEach(function(k){ BAD[k]=1; });

  // ---- モジュール登録 ----
  var KD = { edition: EDITION, mods: [], defs: {}, modDefaults: {}, devNet: DEV ? !!DEV[EDITION].net : null };
  KD.mod = function (m) {
    if (DEV && !m.core && DEV[EDITION].mods.indexOf(m.id) < 0) return;
    KD.mods.push(m);
    Object.keys(m.collections || {}).forEach(function (k) { m.collections[k].mod = m.id; KD.defs[k] = m.collections[k]; });
    if (m.defaults) KD.modDefaults[m.id] = m.defaults;
    KD.mods.sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  KD.has = function (id) { return KD.mods.some(function (m) { return m.id === id; }); };
  root.KD = KD;

  var CORE_DEFAULTS = {
    navRank:'', homeGroup:'all', tableMode: 'list', navUsage: '', navPins: '', updateCount: 0, ownerName: 'オーナー', fontScale: 100, theme: 'auto', contrast: false, reduceMotion: false, easyMode: false, kanaMode: false,
    backupRemindDays: 30, autoLockMin: 15, homeNotice: '', archiveNote: '', lockNoticeOff: false
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function rand(n) { var a = new Uint8Array(n); root.crypto.getRandomValues(a); return a; }
  function uid() { return Array.prototype.map.call(rand(8), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  var OWNER_NAMES = { user: 'わたし', facility: '事業所', staff: '支援者', salon: 'サロン', shop: 'お店' };
  function defaults() { var s = clone(CORE_DEFAULTS); s.ownerName = OWNER_NAMES[EDITION] || s.ownerName; if(EDITION==='user'){s.fontScale=120;s.easyMode=true;} s.mod = clone(KD.modDefaults); return s; }

  // ---- 値の検証 ----
  function cleanValue(f, v) {
    switch (f.type) {
      case 'check': return v === true || v === 'true';
      case 'number': case 'yen': case 'pct':
        if (v === '' || v === null || v === undefined) return '';
        var n = Number(v); return isFinite(n) ? Math.max(-1e12, Math.min(1e12, n)) : '';
      case 'date': var d = String(v); var dt = new Date(d + 'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(dt) && dt.toISOString().slice(0,10) === d ? d : '';
      case 'month': return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v)) ? String(v) : '';
      case 'time': return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : '';
      case 'image': return typeof v==='string' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length<=120000 ? v : '';
      case 'url': return /^https:\/\/[^\s"'<>]{1,2000}$/i.test(String(v)) ? String(v) : '';
      case 'select': if (v === null || v === undefined) return ''; if (f.free) return String(v).slice(0, 200); return f.options && f.options.indexOf(String(v)) >= 0 ? String(v) : '';
      default: return v === null || v === undefined ? '' : String(v).slice(0, 5000);
    }
  }
  // 段取りの構造化文字列はJSONとしての妥当性だけでなく用途別の型も確認する。
  function validateDeskRow(def, row) {
    if (!def.fields.some(function(f){return f.k==='template';}) || !def.fields.some(function(f){return f.k==='links';})) return;
    ['details','lines','links','checks'].forEach(function(k){
      var raw=row&&row[k]; if(raw===undefined||raw===null||raw==='')return;
      if(typeof raw!=='string'||raw.length>5000)throw new Error('段取りの'+k+'は5000文字以内のJSONにしてください。');
      var v;try{v=JSON.parse(raw);}catch(e){throw new Error('段取りの'+k+'のJSONが不正です。');}
      validateSizes(v,0);
      var ok;
      if(k==='details')ok=v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length<=100&&Object.keys(v).every(function(x){return /^f[0-9]{1,3}$/.test(x)&&typeof v[x]==='string';});
      else if(k==='checks')ok=Array.isArray(v)&&v.length<=100&&v.every(function(x){return typeof x==='boolean';});
      else if(k==='links')ok=Array.isArray(v)&&v.length<=100&&v.every(function(x){return x&&typeof x==='object'&&!Array.isArray(x)&&/^[0-9a-f]{1,32}$/.test(x.id)&&Number.isSafeInteger(Number(x.rev))&&Number(x.rev)>=0;});
      else ok=Array.isArray(v)&&v.length<=100&&v.every(function(x){return x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length<=12&&Object.keys(x).every(function(y){return ['label','kind','expected','actual','unit','confirm'].indexOf(y)>=0&&(typeof x[y]==='string'||typeof x[y]==='number'&&isFinite(x[y]));});});
      if(!ok)throw new Error('段取りの'+k+'の型または件数が不正です。取り込み・保存を中止しました。');
    });
  }
  function cleanRow(def, row) {
    validateDeskRow(def,row);
    var out = { _id: row && typeof row._id === 'string' && /^[0-9a-f]{1,32}$/.test(row._id) ? row._id : uid() };
    def.fields.forEach(function (f) { if (!BAD[f.k]) out[f.k] = cleanValue(f, row ? row[f.k] : ''); });
    return out;
  }
  // この版で使わない表（他の版のデータ）は、平らな値だけにして保持する（版をまたいでも消えない）
  function cleanExtraRows(rows) {
    if (!Array.isArray(rows)) return []; if (rows.length > 5000) throw new Error('1表5000件の上限を超えています。取り込みを中止しました。');
    return rows.slice(0, 5000).filter(function (r) { return r && typeof r === 'object' && !Array.isArray(r); }).map(function (r) {
      var o = {};
      Object.keys(r).slice(0, 60).forEach(function (k) {
        if (BAD[k] || !/^[A-Za-z0-9_]{1,40}$/.test(k)) return;
        var v = r[k];
        if (typeof v === 'string') o[k] = v.slice(0, 5000);
        else if (typeof v === 'number' && isFinite(v)) o[k] = v;
        else if (typeof v === 'boolean') o[k] = v;
      });
      return o;
    });
  }
  function cleanByShape(base, v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return base;
    Object.keys(base).forEach(function (k) {
      if (BAD[k] || !(k in v)) return;
      var b = base[k], x = v[k];
      if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = cleanByShape(b, x);
      else if (Array.isArray(b)) { if (Array.isArray(x)) base[k] = x.slice(0, 20).map(Number).filter(isFinite); }
      else if (typeof b === 'number') { var n = Number(x); if (isFinite(n)) base[k] = n; }
      else if (typeof b === 'boolean') base[k] = !!x;
      else base[k] = String(x === null || x === undefined ? '' : x).slice(0, 2000);
    });
    return base;
  }
  function cleanRates(r) {
    if (!r || typeof r !== 'object' || !r.values || typeof r.values !== 'object') return null;
    var vals = {};
    Object.keys(C.RATE_LIMITS).forEach(function (k) {
      var n = Number(r.values[k]), lim = C.RATE_LIMITS[k];
      if (isFinite(n) && n >= lim[0] && n <= lim[1]) vals[k] = n;
    });
    if (!Object.keys(vals).length) return null;
    var src = Array.isArray(r.sources) ? r.sources.slice(0, 20).filter(function (s) { return s && C.isOfficialUrl(s.url); })
      .map(function (s) { return { title: String(s.title || s.url).slice(0, 120), url: String(s.url) }; }) : [];
    return { label: String(r.label || '更新した値').slice(0, 120), checkedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(r.checkedAt)) ? String(r.checkedAt) : '', values: vals, sources: src };
  }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}(T[0-9:.Z+-]{0,20})?$/.test(String(s || '')); }
  function validateSizes(o, depth) {
    if(depth>12) throw new Error('データの階層が深すぎます。');
    if(typeof o==='string' && o.length>5000) throw new Error('5000文字を超える項目があります。データを切り捨てず取り込みを中止しました。');
    if(o && typeof o==='object') { var keys=Object.keys(o); if(keys.length>5000) throw new Error('データ件数が上限を超えています。'); keys.forEach(function(k){if(BAD[k])throw new Error('危険なキーが含まれています。');validateSizes(o[k],depth+1);}); }
  }
  function cleanState(raw) {
    validateSizes(raw,0);
    if (!raw || typeof raw !== 'object' || raw.app !== 'komorebi-desk' || (raw.version !== 1 && raw.version !== 2)) throw new Error('こもれびデスクのバックアップファイルではありません。');
    var st = emptyShell();
    st.sample = !!raw.sample; st.started = raw.version === 1 ? true : !!raw.started; st.introSeen = raw.version === 1 ? true : !!raw.introSeen;
    ['createdAt', 'lastBackupAt', 'remindedAt'].forEach(function (k) { if (isDate(raw[k])) st[k] = String(raw[k]); });
    var rs = raw.settings || {};
    st.settings = cleanByShape(defaults(), rs);
    if (rs.mod && typeof rs.mod === 'object') Object.keys(rs.mod).forEach(function(k){if(!BAD[k] && /^[a-z]{2,20}$/.test(k) && !KD.modDefaults[k] && rs.mod[k] && typeof rs.mod[k] === 'object' && !Array.isArray(rs.mod[k])) st.settings.mod[k]=JSON.parse(JSON.stringify(rs.mod[k]));});
    if (raw.version === 1 && rs) { // 旧版（v1）の設定を引き継ぐ
      if (rs.pension && st.settings.mod.pension) st.settings.mod.pension = cleanByShape(st.settings.mod.pension, rs.pension);
      if (rs.tax && st.settings.mod.tax) st.settings.mod.tax = cleanByShape(st.settings.mod.tax, rs.tax);
    }
    st.rates = cleanRates(raw.rates);
    var cols = raw.collections && typeof raw.collections === 'object' ? raw.collections : {};
    var extra = raw.extra && typeof raw.extra === 'object' ? raw.extra : {};
    Object.keys(KD.defs).forEach(function (k) {
      var rows = Array.isArray(cols[k]) ? cols[k] : Array.isArray(extra[k]) ? extra[k] : [];
      if (rows.length > 5000) throw new Error('1表5000件の上限を超えています。取り込みを中止しました。');
      st.collections[k] = rows.slice(0, 5000).filter(function (r) { return r && typeof r === 'object'; }).map(function (r) { return cleanRow(KD.defs[k], r); });
    });
    [cols, extra].forEach(function (src) {
      Object.keys(src).slice(0, 200).forEach(function (k) {
        if (KD.defs[k] || BAD[k] || !/^[A-Za-z0-9_]{1,40}$/.test(k)) return;
        st.extra[k] = cleanExtraRows(src[k]);
      });
    });
    [st.collections,st.extra].forEach(function(cols){Object.keys(cols).forEach(function(k){var seen=Object.create(null);cols[k].forEach(function(r){if(!r._id)return;if(seen[r._id])throw new Error('同じ表に重複するIDがあります。取り込みを中止しました。');seen[r._id]=true;});});});
    return st;
  }

  // ---- サンプル（架空データを毎回ランダムに作る） ----
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function sampleHelpers(r) {
    var t = C.today();
    var H = {
      r: r, today: t,
      int: function (a, b) { return a + Math.floor(r() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(r() * arr.length)]; },
      chance: function (p) { return r() < p; },
      day: function (off) { return C.addDays(t, off); },
      month: function (off) { return C.addMonths(t.slice(0, 8) + '01', off).slice(0, 7); },
      dom: function (n, off) { var m = H.month(off || 0); return m + '-' + C.pad(Math.min(n, C.daysInMonth(m))); },
      id: function (p, n, w) { return p + ('000' + n).slice(-(w || 3)); },
      round: function (n, u) { return Math.round(n / (u || 100)) * (u || 100); },
      hm: function (h, m) { return C.pad(h) + ':' + C.pad(m); },
      weekday: function (d) { return new Date(d + 'T00:00:00').getDay(); }
    };
    return H;
  }
  function emptyShell() {
    var cols = {};
    Object.keys(KD.defs).forEach(function (k) { cols[k] = []; });
    return { app: 'komorebi-desk', version: 2, edition: EDITION, sample: false, started: false, introSeen: false, createdAt: new Date().toISOString(), lastBackupAt: '', remindedAt: '', settings: defaults(), rates: null, collections: cols, extra: {} };
  }
  function sampleState() {
    var st = emptyShell(), H = sampleHelpers(rng(rand(4).reduce(function (a, b) { return a * 256 + b; }, 0)));
    st.sample = true;
    st.settings.homeNotice = 'いま表示しているのは、ランダムに作った完全架空のサンプルです。人物・会社・記録は実在の利用者の個人情報ではありません。「サンプルを消して始める」で自分の記録を始められます。';
    KD.mods.forEach(function (m) {
      if (!m.sample) return;
      var out = {};
      try { out = m.sample(H, st) || {}; } catch (e) { if (root.console) root.console.error(m.id, e); }
      Object.keys(out).forEach(function (k) { if (KD.defs[k]) st.collections[k] = out[k].slice(0, 5000).map(function (r) { return cleanRow(KD.defs[k], r); }); });
    });
    if(KD.enrichSample){var extra=KD.enrichSample(H,st)||{};Object.keys(extra).forEach(function(k){if(KD.defs[k])st.collections[k]=extra[k].slice(0,5000).map(function(r){return cleanRow(KD.defs[k],r);});});}
    if(DEMO)st.introSeen=true;
    return st;
  }

  // ---- 暗号化（ロック・暗号化バックアップ共通） ----
  function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return root.btoa(s); }
  function unb64(str) { var s = root.atob(String(str || '')), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function cryptoOK() { return !!(root.crypto && root.crypto.subtle && root.TextEncoder); }
  function deriveKey(pass, salt, iter) {
    return root.crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return root.crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function encryptWith(key, salt, iter, text, format) {
    var iv = rand(12);
    return root.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(text)).then(function (ct) {
      return JSON.stringify({ format: format, kdf: 'PBKDF2-SHA256', iter: iter, salt: b64(salt), iv: b64(iv), data: b64(ct) });
    });
  }
  function parseEnvelope(text, format) {
    var o = JSON.parse(text);
    if (!o || o.format !== format) throw new Error('暗号化ファイルの形式が違います。');
    var iter=Number(o.iter); if(!Number.isInteger(iter)||iter<100000||iter>2000000) throw new Error('暗号化の反復回数が不正です。');
    return { iter: iter, salt: unb64(o.salt), iv: unb64(o.iv), data: unb64(o.data) };
  }
  function decryptEnvelope(env, key) {
    return root.crypto.subtle.decrypt({ name: 'AES-GCM', iv: env.iv }, key, env.data).then(function (pt) { return new TextDecoder().decode(pt); });
  }

  // ---- 状態 ----
  var saving = false, lastStored = null, conflict = false, recoveryRaw = '', pendingSave = Promise.resolve(), state = null, listeners = [], session = null, writeSeq = 0, saveError = false; reportStatus();
  function reportStatus(){var el=root.document.getElementById && root.document.getElementById('save-status');if(el){el.textContent=saveError?(conflict?'別タブの変更あり・保存停止。バックアップ後に開き直してください。':'保存できません。バックアップを保存してください。'):(saving?'保存中…':'端末内に保存');el.className=saveError?'warn small':'muted small';}try{if(root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new root.CustomEvent('komorebi-save',{detail:{error:saveError,conflict:conflict}}));}catch(e){}}
  var STORE_LIMIT = 5000000, ROW_LIMIT = 5000;
  function usage() {
    var raw = lastStored || rawStored() || '', tables = Object.keys(KD.defs).map(function (k) { return { key: k, title: KD.defs[k].title, n: rows(k).length }; }).filter(function (t) { return t.n; }).sort(function (a, b) { return b.n - a.n; });
    var top = tables[0] ? tables[0].n : 0, ratio = raw.length / STORE_LIMIT, rowRatio = top / ROW_LIMIT;
    return { chars: raw.length, limit: STORE_LIMIT, ratio: ratio, rowLimit: ROW_LIMIT, rowRatio: rowRatio, tables: tables, level: Math.max(ratio, rowRatio) >= 0.9 ? 'danger' : Math.max(ratio, rowRatio) >= 0.7 ? 'warn' : 'ok' };
  }
  function dateField(k) { var f = (KD.defs[k].fields || []).filter(function (x) { return x.type === 'date'; }); var d = f.filter(function (x) { return x.k === 'date'; })[0] || f[0]; return d ? d.k : ''; }
  function cutOf(x) { x = String(x); return /^\d{4}-\d{2}$/.test(x) ? x + '-01' : /^\d{4}$/.test(x) ? x + '-01-01' : ''; }
  function isOld(r, f, cut) { return /^\d{4}-\d{2}-\d{2}$/.test(r[f] || '') && r[f] < cut; }
  // 指定した月（または年）より前の日付の記録。ids は書き出したファイルとの照合に使う
  function archivePlan(x) {
    var cut = cutOf(x), out = []; if (!cut) return out;
    Object.keys(KD.defs).forEach(function (k) { var f = dateField(k); if (!f || KD.defs[k].noArchive) return; var list = rows(k).filter(function (r) { return isOld(r, f, cut); }); if (list.length) out.push({ key: k, title: KD.defs[k].title, field: f, n: list.length, ids: list.map(function (r) { return r._id; }) }); });
    return out;
  }
  // 書き出したファイル（読み込み・検証済みの状態）に、外す予定の記録が同じ内容で全部入っているか
  function archiveVerify(x, fileState) {
    var plan = archivePlan(x), missing = 0, checked = 0;
    plan.forEach(function (p) { var got = {}; ((fileState.collections || {})[p.key] || []).forEach(function (r) { got[r._id] = JSON.stringify(r); }); rows(p.key).forEach(function (r) { if (p.ids.indexOf(r._id) < 0) return; checked++; if (got[r._id] !== JSON.stringify(r)) missing++; }); });
    return { ok: checked > 0 && missing === 0, checked: checked, missing: missing };
  }
  function archiveBefore(x, fileName) {
    var cut = cutOf(x), plan = archivePlan(x), total = 0; if (!cut) return 0; var snap = [];
    plan.forEach(function (p) { var keep = rows(p.key).filter(function (r) { return !isOld(r, p.field, cut); }); total += rows(p.key).length - keep.length; snap.push({ k: p.key, rows: JSON.stringify(rows(p.key)) }); state.collections[p.key] = keep; });
    if (snap.length) { history.push({ multi: snap, label: cut.slice(0, 7) + 'より前を外す（' + snap.length + '表）' }); if (history.length > 20) history.shift(); }
    if (total) { var note = cut.slice(0, 7) + 'より前の' + total + '件を' + new Date().toISOString().slice(0, 10) + 'に外した（保管ファイル：' + (fileName || '名前不明') + '）'; state.settings.archiveNote = (note + '\n' + String(state.settings.archiveNote || '')).split('\n').slice(0, 20).join('\n').slice(0, 1900); changed(); }
    return total;
  }
  function rawStored() { try { return root.localStorage.getItem(KEY); } catch (e) { return null; } }
  function isLocked() { var s = rawStored(); try { return !!(s && JSON.parse(s).format === 'komorebi-locked-v1'); } catch(e) { return false; } }
  function load() {
    if (isLocked()) return null; // ロック中は解除するまで読まない（上書きもしない）
    var s = rawStored(); lastStored = s;
    try { state = s ? cleanState(JSON.parse(s)) : sampleState(); }
    catch (e) { recoveryRaw = s; saveError = true; reportStatus(); state = emptyShell(); state.started = true; state.introSeen = true; }
    if (!s) save();
    return state;
  }
  function unlock(pass) {
    var env;
    try { env = parseEnvelope(rawStored(), 'komorebi-locked-v1'); } catch (e) { return Promise.reject(new Error('ロックされたデータを読めませんでした。')); }
    lastStored = rawStored();
    return deriveKey(pass, env.salt, env.iter).then(function (key) {
      return decryptEnvelope(env, key).then(function (text) { state = cleanState(JSON.parse(text)); session = { key: key, salt: env.salt, iter: env.iter }; return state; });
    }).catch(function () { throw new Error('パスフレーズが違うか、データが壊れています。'); });
  }
  function save() {
    if (!state || recoveryRaw) { if (recoveryRaw) saveError = true; reportStatus(); return false; }
    if (conflict || rawStored() !== lastStored) { conflict = true; saveError = true; reportStatus(); return false; }
    var text = JSON.stringify(state);
    if (session) {
      var my = ++writeSeq; saving = true; reportStatus();
      pendingSave = encryptWith(session.key, session.salt, session.iter, text, 'komorebi-locked-v1').then(function (enc) {
        if (my === writeSeq) { try { if (rawStored() !== lastStored) { conflict = true; saveError = true; reportStatus(); return; } root.localStorage.setItem(KEY, enc); lastStored = enc; saveError = false; reportStatus(); } catch (e) { saveError = true; reportStatus(); } }
      });
      pendingSave = pendingSave.catch(function () { saveError = true; reportStatus(); }).finally(function(){if(my===writeSeq)saving=false;reportStatus();});
      return true;
    }
    try { root.localStorage.setItem(KEY, text); lastStored = text; saveError = false; reportStatus(); return true; } catch (e) { saveError = true; reportStatus(); return false; }
  }
  // 解除中のパスフレーズ確認（保存に失敗していても、メモリ上の鍵で照合できる）
  function verifyPass(pass) {
    if (!session) return Promise.reject(new Error('ロックはオンではありません。'));
    var s0 = session;
    return encryptWith(s0.key, s0.salt, s0.iter, 'komorebi-check', 'komorebi-locked-v1').then(function (enc) {
      return deriveKey(pass || '', s0.salt, s0.iter).then(function (key) { return decryptEnvelope(parseEnvelope(enc, 'komorebi-locked-v1'), key); });
    }).then(function (t) { if (t !== 'komorebi-check') throw new Error('x'); return true; }, function () { throw new Error('パスフレーズが違います。'); });
  }
  function enableLock(pass) {
    if (!cryptoOK()) return Promise.reject(new Error('このブラウザでは暗号化が使えません。'));
    if (!pass || pass.length < 10) return Promise.reject(new Error('パスフレーズは10文字以上にしてください。'));
    var salt = rand(16), iter = 310000;
    return deriveKey(pass, salt, iter).then(function (key) { session = { key: key, salt: salt, iter: iter }; save(); return pendingSave.then(function () { if (saveError) throw new Error('暗号化したデータを保存できませんでした。バックアップを保存してください。'); }); });
  }
  function disableLock() { ++writeSeq; saving=false; session = null; save(); }
  function get() { return state; }
  function rows(k) { return (state.collections[k] = state.collections[k] || []); }
  function def(k) { return KD.defs[k]; }
  function settings() { return state.settings; }
  function modSettings(id) { return (state.settings.mod[id] = state.settings.mod[id] || clone(KD.modDefaults[id] || {})); }
  // ---- 元に戻す（直前の20操作まで。メモリの中だけに持ち、保存・送信はしない） ----
  var history = [];
  function remember(k, label) { history.push({ k: k, rows: JSON.stringify(rows(k)), label: label || '' }); if (history.length > 20) history.shift(); }
  function undo() { var hst = history.pop(); if (!hst) return ''; if (hst.multi) hst.multi.forEach(function (m) { state.collections[m.k] = JSON.parse(m.rows); }); else state.collections[hst.k] = JSON.parse(hst.rows); changed(); return hst.label || '変更'; }
  function canUndo() { return history.length > 0; }
  function changed() { save(); listeners.forEach(function (fn) { try { fn(); } catch (e) { if (root.console) root.console.error(e); } }); }
  function onChange(fn) { listeners.push(fn); }
  function addRow(k, values, silent) { var r = cleanRow(KD.defs[k], values || {}); if (rows(k).length >= 5000) throw new Error('1表の上限は5000件です。年度別にバックアップしてください。'); remember(k, '追加'); rows(k).push(r); state.started = true; if (silent) save(); else changed(); return r; }
  function addRows(k, list) { if (rows(k).length + list.length > 5000) throw new Error('1表の上限は5000件です。'); var prepared=list.map(function(v){return cleanRow(KD.defs[k],v);}); remember(k, 'まとめて追加'); prepared.forEach(function(v){rows(k).push(v);}); changed(); }
  function updateRow(k, id, field, value) {
    var f = KD.defs[k].fields.filter(function (x) { return x.k === field; })[0], r = rows(k).filter(function (x) { return x._id === id; })[0];
    if (!f || !r) return;
    var candidate=Object.assign({},r);candidate[field]=value;validateDeskRow(KD.defs[k],candidate);
    var nv = cleanValue(f, value); if (r[field] === nv) return; remember(k, '編集');
    r[field] = nv; state.started = true; save();
  }
  function setRow(k, id, values) {
    var r = rows(k).filter(function (x) { return x._id === id; })[0];
    if (!r) return;
    validateDeskRow(KD.defs[k],Object.assign({},r,values));
    remember(k, '編集');
    KD.defs[k].fields.forEach(function (f) { if (f.k in values) r[f.k] = cleanValue(f, values[f.k]); });
    changed();
  }
  // 表をまるごと入れ替える（シフト案の作成などで使う。直前の状態は「元に戻す」で戻せる）
  function commitBatch(changes, label) {
    var keys=Object.keys(changes),prepared={},snap=[];
    keys.forEach(function(k){if(!KD.defs[k]||!Array.isArray(changes[k]))throw new Error('Unknown collection');if(changes[k].length>5000)throw new Error('1表5000件の上限です。関連カードや過去版をバックアップしてください。');var ids=Object.create(null);prepared[k]=changes[k].map(function(row){var r=cleanRow(KD.defs[k],row);if(ids[r._id])throw new Error('同じIDが重複しています。保存を中止しました。');ids[r._id]=1;return r;});snap.push({k:k,rows:JSON.stringify(rows(k))});});
    history.push({multi:snap,label:label||'まとめて保存'});if(history.length>20)history.shift();keys.forEach(function(k){state.collections[k]=prepared[k];});state.started=true;changed();
  }
  function replaceRows(k, list) { if (list.length > 5000) throw new Error('1表の上限は5000件です。'); remember(k, 'まとめて置き換え'); state.collections[k] = list.map(function (v) { return cleanRow(KD.defs[k], v); }); state.started = true; }
  function deleteRow(k, id) { var l = rows(k), i = l.findIndex(function (x) { return x._id === id; }); if (i >= 0) { remember(k, '削除'); l.splice(i, 1); changed(); } }
  function setSetting(path, value) {
    var s = state.settings, p = path.split('.');
    for (var i = 0; i < p.length - 1; i++) { if (BAD[p[i]]) return; s = s[p[i]] = s[p[i]] && typeof s[p[i]] === 'object' ? s[p[i]] : {}; }
    if (BAD[p[p.length - 1]]) return;
    s[p[p.length - 1]] = value; save();
  }
  function setMeta(k, v) { if (['lastBackupAt', 'remindedAt', 'started', 'sample', 'introSeen'].indexOf(k) >= 0) { state[k] = v; save(); } }
  function rates() {
    var base = clone(C.DEFAULT_RATES), r = state.rates;
    if (r) { Object.keys(r.values).forEach(function (k) { base.values[k] = r.values[k]; }); base.label = r.label; base.checkedAt = r.checkedAt; base.sources = r.sources; }
    return base;
  }
  function setRates(r) { state.rates = r ? cleanRates(r) : null; changed(); }

  // 全削除・サンプル（ロック状態と設定の見やすさは残す）
  function keepView(st) { ['fontScale', 'theme', 'contrast', 'reduceMotion', 'easyMode', 'kanaMode', 'tableMode', 'navPins', 'autoLockMin', 'backupRemindDays', 'ownerName'].forEach(function (k) { st.settings[k] = state.settings[k]; }); return st; }
  function startFresh() { history = []; recoveryRaw = ''; var st = keepView(emptyShell()); st.started = true; st.introSeen = true; st.lastBackupAt = state.lastBackupAt; st.rates = state.rates; state = st; changed(); }
  function resetSample() { history = []; recoveryRaw = ''; var st = keepView(sampleState()); st.started = true; st.introSeen = true; st.lastBackupAt = state.lastBackupAt; state = st; changed(); }

  // ---- バックアップ ----
  function backupText() { return JSON.stringify(state, null, 1); }
  function backupEncrypted(pass) {
    if (!cryptoOK()) return Promise.reject(new Error('このブラウザでは暗号化が使えません。'));
    if (!pass || pass.length < 10) return Promise.reject(new Error('パスフレーズは10文字以上にしてください。'));
    var salt = rand(16), iter = 310000;
    return deriveKey(pass, salt, iter).then(function (key) { return encryptWith(key, salt, iter, backupText(), 'komorebi-enc-v1'); });
  }
  function readBackup(text, pass) {
    if (typeof text !== 'string' || text.length > MAX_IMPORT * 2) return Promise.reject(new Error('ファイルが大きすぎます（8MBまで）。'));
    var parsed; try { parsed=JSON.parse(text); } catch(e) { return Promise.reject(new Error('JSONとして読めませんでした。')); }
    var head = text.slice(0, 300);
    if (parsed && (parsed.format === 'komorebi-enc-v1' || parsed.format === 'komorebi-locked-v1')) {
      if (!cryptoOK()) return Promise.reject(new Error('このブラウザでは暗号化が使えません。'));
      var env;
      try { env = parseEnvelope(text, parsed.format); } catch (e) { return Promise.reject(e); }
      return deriveKey(pass || '', env.salt, env.iter).then(function (key) { return decryptEnvelope(env, key); })
        .then(function (t) { return cleanState(JSON.parse(t)); }, function () { throw new Error('パスフレーズが違うか、ファイルが壊れています。'); });
    }
    try { return Promise.resolve(cleanState(JSON.parse(text))); } catch (e) { return Promise.reject(new Error(e instanceof SyntaxError ? 'JSONとして読めませんでした。' : e.message)); }
  }
  function replaceAll(st) { history = []; recoveryRaw = ''; st.started = true; st.introSeen = true; state = st; changed(); }

  // 別のタブ・画面が同じ保存場所へ書いたら、その時点で保存を止めて知らせる（ほぼ同時の保存でも、負けた側の変更は画面に残り「書き出す」で救出できる）
  if(root.addEventListener) root.addEventListener('storage',function(e){if(e.key!==KEY||!state)return;if(e.newValue!==lastStored){conflict=true;saveError=true;reportStatus();}});
  if(root.addEventListener) root.addEventListener('beforeunload',function(e){if(saving || saveError || conflict){e.preventDefault();e.returnValue='保存中です';}});
  root.Store = {
    EDITION: EDITION, KEY: KEY, isDemo: function(){return DEMO;}, recoveryText: function () { return recoveryRaw; }, rawText: rawStored, saving: function(){return saving;}, restoreLocked: function(st){lastStored=rawStored();conflict=false;session=null;recoveryRaw='';replaceAll(st);if(saveError)throw new Error('保存できませんでした。');}, flush: function () { save(); return pendingSave.then(function () { if (saveError) throw new Error('保存に失敗しました。反映済みと扱わず、現在の記録をバックアップしてください。'); }); }, load: load, get: get, rows: rows, def: def, settings: settings, modSettings: modSettings, onChange: onChange, changed: changed,
    commitBatch: commitBatch, undo: undo, canUndo: canUndo, replaceRows: replaceRows, addRow: addRow, addRows: addRows, updateRow: updateRow, setRow: setRow, deleteRow: deleteRow, setSetting: setSetting, setMeta: setMeta,
    rates: rates, setRates: setRates, cleanRates: cleanRates, startFresh: startFresh, resetSample: resetSample,
    backupText: backupText, backupEncrypted: backupEncrypted, readBackup: readBackup, replaceAll: replaceAll, cleanState: cleanState,
    cryptoOK: cryptoOK, isLocked: isLocked, unlock: unlock, enableLock: enableLock, disableLock: disableLock,
    verifyPass: verifyPass, usage: usage, archivePlan: archivePlan, archiveVerify: archiveVerify, archiveBefore: archiveBefore, lockOn: function () { return !!session; }, saveFailed: function () { return saveError; }, conflict: function () { return conflict; }
  };
})(this);
