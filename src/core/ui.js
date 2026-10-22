/*
 * こもれびデスク — 画面部品
 * 安全のため、データは必ず textContent / value で入れる（innerHTML は使わない。CSPのTrusted Typesでも禁止）。
 */
(function (root) {
  'use strict';
  var doc = root.document;
  var SAFE_ATTR = /^(spellcheck|class|id|role|title|type|value|min|max|step|placeholder|for|href|src|target|rel|colspan|scope|tabindex|hidden|lang|rows|disabled|autocomplete|autocapitalize|accept|download|maxlength|inputmode|aria-[a-z-]+|data-[a-z-]+)$/;

  function h(tag, attrs) {
    var el = doc.createElement(tag);
    // 入力履歴・校正を抑制する指定。ブラウザ・拡張機能・OS側の送信までは保証しない
    if (tag === 'input' || tag === 'textarea') { el.setAttribute('autocomplete', 'off'); el.setAttribute('spellcheck', 'false'); el.setAttribute('autocapitalize', 'off'); }
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'on') { Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); }); return; }
      if (k === 'checked' || k === 'selected') { el[k] = !!v; return; }
      if (!SAFE_ATTR.test(k)) return;
      if (k === 'src' && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(v))) return;
      if (k === 'href' && !/^(https:\/\/|#)/i.test(String(v)) && String(v)!=='?demo=20#shift') return;
      el.setAttribute(k, v === true ? '' : String(v));
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'object' && c.nodeType ? c : doc.createTextNode(String(c)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function extLink(url, text) {
    if (!/^https:\/\//i.test(url || '')) return text || '';
    return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, text || url, h('span', { class: 'sr' }, '（新しいタブで開きます）'));
  }

  var toastTimer, dialogSeq=0;
  // action: { label: '元に戻す', fn: function () {} } を渡すと、通知の中にボタンを出す
  function toast(msg, action) {
    var t = doc.getElementById('toast');
    clear(t); t.appendChild(doc.createTextNode(msg));
    if (action && action.fn) t.appendChild(h('button', { type: 'button', class: 'toast-action', on: { click: function () { t.hidden = true; action.fn(); } } }, action.label || '元に戻す'));
    t.hidden = false; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, action ? 7000 : 3400);
  }

  // ---- ダイアログ（ブラウザ標準のconfirmではなく、読みやすい確認画面） ----
  // buttons: [{label, value, tone}] → 押されたボタンの value を Promise で返す（Escは null）
  function ask(title, body, buttons, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var titleId='dlg-title-'+(++dialogSeq);
      var dlg = h('dialog', { class: 'dlg' + (opts.cls ? ' ' + opts.cls : ''), 'aria-labelledby': titleId });
      var done = false, opener = doc.activeElement;
      function close(v) { if (done) return; done = true; try { dlg.close(); } catch (e) { /* 閉じ済み */ } dlg.remove(); if(opener && opener.isConnected)opener.focus(); resolve(v); }
      dlg.appendChild(h('h2', { id: titleId }, title));
      dlg.appendChild(h('div', { class: 'dlg-body' }, body));
      dlg.appendChild(h('div', { class: 'btn-row dlg-btns' }, (buttons || [{ label: 'OK', value: true }]).map(function (b) {
        return h('button', { type: 'button', class: 'btn ' + (b.tone || ''), on: { click: function () { close(b.value); } } }, b.label);
      })));
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(null); });
      doc.body.appendChild(dlg);
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      var first = opts.focus || dlg.querySelector('.dlg-btns .btn'); if (first) first.focus();
      if (opts.onOpen) opts.onOpen(dlg, close);
    });
  }
  function confirmDanger(title, text, okLabel) {
    return ask(title, h('p', null, text), [{ label: 'やめる', value: false, tone: 'ghost' }, { label: okLabel || '実行する', value: true, tone: 'danger' }]);
  }

  function card(title, opts) {
    opts = opts || {};
    var body = h('div', { class: 'card-body' });
    var c = h('section', { class: 'card' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : ''), 'aria-label': title },
      h('header', { class: 'card-head' }, h('h3', null, title), opts.action || null),
      opts.desc ? h('p', { class: 'muted small' }, opts.desc) : null, body);
    for (var i = 2; i < arguments.length; i++) append(body, arguments[i]);
    return c;
  }
  function stat(label, value, note, tone) {
    return h('div', { class: 'stat' + (tone ? ' ' + tone : '') }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value' }, value), note ? h('span', { class: 'stat-note' }, note) : null);
  }
  function badge(text, tone) { return h('span', { class: 'badge ' + (tone || '') }, text); }
  function empty(text) { return h('p', { class: 'empty' }, text || 'まだ記録がありません。'); }

  // ---- ファイル保存（保存先を選べるブラウザでは選択画面を出す） ----
  function saveFile(name, text, mime) {
    mime = mime || 'application/json';
    if (root.showSaveFilePicker) {
      var ext = (name.match(/\.[a-z]+$/i) || ['.json'])[0];
      return root.showSaveFilePicker({ suggestedName: name, types: [{ description: name, accept: (function () { var o = {}; o[mime] = [ext]; return o; })() }] })
        .then(function (handle) { return handle.createWritable(); })
        .then(function (w) { return w.write(new Blob([text], { type: mime })).then(function () { return w.close(); }); })
        .then(function () { return true; }, function (e) { if (e && e.name === 'AbortError') return false; return downloadFile(name, text, mime); });
    }
    return Promise.resolve(downloadFile(name, text, mime));
  }
  function downloadFile(name, text, mime) {
    var a = doc.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' })); a.download = name;
    doc.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return 'download'; // ダウンロードを開始しただけ。保存できたかは分からない
  }
  function stamp() { var d = new Date(); return d.getFullYear() + root.Calc.pad(d.getMonth() + 1) + root.Calc.pad(d.getDate()); }

  // ---- 汎用の表（編集・追加・削除・CSV・ページ送り） ----
  var limits = {};
  function inputFor(key, row, f) {
    var v = row[f.k], label = lbl(f);
    function save(val) { root.Store.updateRow(key, row._id, f.k, val); root.App.softRefresh(); }
    if (f.type === 'check') return h('input', { type: 'checkbox', checked: !!v, 'aria-label': label, on: { change: function (e) { save(e.target.checked); } } });
    if (f.type === 'select') {
      var sel = h('select', { 'aria-label': label, on: { change: function (e) { save(e.target.value); } } });
      var opts = f.options.slice();
      if (v && opts.indexOf(v) < 0) opts.push(v);
      opts.forEach(function (o) { sel.appendChild(h('option', { value: o, selected: o === v }, o === '' ? '—' : o)); });
      return sel;
    }
    if(f.type==='image') {
      var preview=h('div'), selected=v||'';
      function draw(){clear(preview);if(selected)preview.appendChild(h('img',{src:selected,'aria-label':'保存された写真',class:'record-photo'}));}
      var inp=h('input',{type:'file',accept:'image/jpeg,image/png,image/webp','aria-label':label,on:{change:function(e){
        var file=e.target.files&&e.target.files[0];if(!file)return;
        if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10*1024*1024){toast('JPEG・PNG・WebPで10MB以下の画像を選択してください');return;}
        var fr=new FileReader();fr.onload=function(){var im=new Image();im.onload=function(){
          var scale=Math.min(1,640/Math.max(im.width,im.height));var can=doc.createElement('canvas');can.width=Math.max(1,Math.round(im.width*scale));can.height=Math.max(1,Math.round(im.height*scale));var ctx=can.getContext('2d');ctx.drawImage(im,0,0,can.width,can.height);
          var data=can.toDataURL('image/jpeg',0.48);if(data.length>120000){toast('画像の保存上限を超えました。もう少し小さい写真にしてください');return;}
          selected=data;save(data);draw();toast('写真を圧縮して記録に保存しました。バックアップも忘れずに');
        };im.onerror=function(){toast('画像を読み取れませんでした')};im.src=String(fr.result);};fr.readAsDataURL(file);
      }}});
      draw();return h('div',null,preview,inp,h('button',{type:'button',class:'btn small ghost',on:{click:function(e){e.preventDefault();e.stopPropagation();selected='';save('');draw();}}},'写真を外す'),h('small',{class:'muted'},'写真は端末内の記録に保存。機微情報を含むためロックと暗号化バックアップを推奨。1画像最大約90KB。'));
    }
    if (f.type === 'textarea') { var ta = h('textarea', { rows: 2, 'aria-label': label, maxlength: '5000', on: { change: function (e) { save(e.target.value); } } }); ta.value = v || ''; return ta; }
    var type = { number: 'number', yen: 'number', pct: 'number', date: 'date', month: 'month', time: 'time', url: 'url' }[f.type] || 'text';
    var inp = h('input', { type: type, 'aria-label': label, step: f.type === 'yen' ? '1' : f.type === 'number' || f.type === 'pct' ? 'any' : null, maxlength: type === 'text' ? '500' : null, inputmode: f.type === 'yen' ? 'numeric' : null, on: { change: function (e) { save(e.target.value); } } });
    inp.value = v === undefined || v === null ? '' : v;
    if (type === 'number') inp.className = 'num';
    return inp;
  }
  // 利用者版の「ひらがなにする」：kana / kanaTitle / hint / hintKana を持つ項目だけ切り替える
  function kanaOn() { try { var s = root.Store.settings(); return !!(s && s.kanaMode); } catch (e) { return false; } }
  function k(normal, kana) { return kanaOn() && kana ? kana : normal; }
  function lbl(f) { return k(f.label, f.kana); }
  function hint(f) { return k(f.hint, f.hintKana); }
  function csvOf(key, list, extra) {
    var def = root.Store.def(key);
    var head = def.fields.map(function (f) { return f.label; }).concat((extra || []).map(function (c) { return c.label; }));
    var rows = list.map(function (r) { return def.fields.map(function (f) { return f.type === 'check' ? (r[f.k] ? '✓' : '') : f.type === 'image' ? (r[f.k] ? '写真あり' : '') : r[f.k]; }).concat((extra || []).map(function (c) { var x = c.value(r); return typeof x === 'object' ? '' : x; })); });
    return root.Calc.toCSV([head].concat(rows));
  }
  var queries = Object.create(null), modes = Object.create(null);
  // ---- 一覧の表示用（読むだけ）。入力欄は「開く」か「まとめて編集」のときだけ出す ----
  function fmtDate(d) {
    var t = new Date(String(d) + 'T00:00:00'); if (isNaN(t)) return String(d);
    var y = t.getFullYear() === new Date().getFullYear() ? '' : t.getFullYear() + '/';
    return y + (t.getMonth() + 1) + '/' + t.getDate() + '（' + '日月火水木金土'[t.getDay()] + '）';
  }
  function display(f, v) {
    if (v === undefined || v === null || v === '') return '';
    if (f.type === 'check') return v ? '✓' : '';
    if (f.type === 'image') return v ? '写真あり' : '';
    if (f.type === 'yen') return root.Calc.yen(v);
    if (f.type === 'date') return fmtDate(v);
    if (f.type === 'month') return String(v).slice(0, 4) + '年' + Number(String(v).slice(5, 7)) + '月';
    if (f.type === 'textarea') { var s = String(v).replace(/\s+/g, ' '); return s.length > 60 ? s.slice(0, 60) + '…' : s; }
    return String(v);
  }
  function rowTitle(def, row) {
    var pick = def.fields.filter(function (f) { return f.type !== 'check' && f.type !== 'date' && f.type !== 'month' && row[f.k] !== '' && row[f.k] !== undefined; })[0];
    return pick ? display(pick, row[pick.k]) : '（空の行）';
  }
  // 定型文：textarea の下にボタンを並べ、押すと書き足す
  function phraseChips(ctl, list) {
    return h('div', { class: 'phrases', role: 'group', 'aria-label': '定型文' }, list.map(function (p) {
      return h('button', { type: 'button', class: 'chip', on: { click: function () { ctl.value = (ctl.value ? ctl.value.replace(/\s+$/, '') + '\n' : '') + p; ctl.dispatchEvent(new Event('change')); ctl.focus(); } } }, p);
    }));
  }
  function templatesOf(key) { var S = root.Store; return S.def('rowTemplates') ? S.rows('rowTemplates').filter(function (t) { return t.table === key; }) : []; }
  function fromTemplate(key, t) {
    var data; try { data = JSON.parse(t.data || '{}'); } catch (e) { data = {}; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    var clean = {}; root.Store.def(key).fields.forEach(function (f) { if (f.k in data) clean[f.k] = data[f.k]; if (f.type === 'date' && f.k === 'date') clean[f.k] = root.Calc.today(); });
    return clean;
  }
  function copyOf(def, row) { var o = {}; def.fields.forEach(function (f) { o[f.k] = row[f.k]; if (f.type === 'date' && f.k === 'date') o[f.k] = root.Calc.today(); if (f.type === 'check') o[f.k] = false; }); return o; }
  // 1行の編集フォーム（入力するとすぐ保存。閉じると一覧に戻る）
  function openForm(key, row, opts) {
    opts = opts || {};
    var S = root.Store, def = S.def(key), first = null, body = h('div', { class: 'row-form' });
    def.fields.forEach(function (f) {
      var t = hint(f), ctl = inputFor(key, row, f);
      if (!first && f.type !== 'check') first = ctl;
      var wrap = h('label', { class: 'field' + (f.type === 'textarea' ? ' span-all' : '') + (f.type === 'check' ? ' check' : '') }, h('span', null, lbl(f)), ctl, t ? h('small', { class: 'muted' }, t) : null);
      body.appendChild(wrap);
      if (f.phrases && f.phrases.length) body.appendChild(phraseChips(ctl, f.phrases));
    });
    (opts.extraCols || []).forEach(function (c) { var v = c.value(row); body.appendChild(h('div', { class: 'field computed-field' }, h('span', null, c.label), h('output', null, v && v.nodeType ? v : String(v === undefined ? '' : v)))); });
    var acts = (opts.rowActions || []).map(function (a) { return h('button', { type: 'button', class: 'btn small ghost', on: { click: function () { a.onClick(row); } } }, a.label); });
    if (acts.length) body.appendChild(h('div', { class: 'btn-row span-all' }, acts));
    var buttons = [{ label: '複製', value: 'copy', tone: 'ghost' }];
    if (S.def('rowTemplates')) buttons.push({ label: 'ひな形に保存', value: 'tpl', tone: 'ghost' });
    buttons.push({ label: '削除', value: 'del', tone: 'ghost danger-text' }, { label: '閉じる', value: 'close' });
    return ask(k(def.title, def.kanaTitle) + '：' + (opts.isNew ? '追加' : '編集'), body, buttons, { cls: 'form-dlg', focus: first }).then(function (v) {
      if (v === 'copy') { var r = S.addRow(key, copyOf(def, row)); toast('複製しました', undoAction()); root.App.render(); return openForm(key, r, opts); }
      if (v === 'tpl') return saveTemplate(key, row).then(function () { root.App.render(); });
      if (v === 'del') return confirmDanger('この行を削除しますか？', '削除した直後なら「元に戻す」で戻せます。', '削除する').then(function (ok) { if (ok) { S.deleteRow(key, row._id); toast('削除しました', undoAction()); } else root.App.render(); });
      root.App.render();
    });
  }
  function saveTemplate(key, row) {
    var name = h('input', { type: 'text', maxlength: '40', 'aria-label': 'ひな形の名前', placeholder: '例：いつもの作業' });
    return ask('ひな形に保存', h('div', null, h('p', null, 'この行の内容を「よく使う入力」として保存します。次からは「ひな形から追加」で同じ内容の行を作れます。'), name), [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '保存', value: true }], { focus: name }).then(function (ok) {
      if (!ok) return;
      var def = root.Store.def(key), data = {}; def.fields.forEach(function (f) { if (f.type !== 'check' && row[f.k] !== '' && row[f.k] !== undefined) data[f.k] = row[f.k]; });
      root.Store.addRow('rowTemplates', { table: key, name: name.value.trim() || rowTitle(def, row), data: JSON.stringify(data).slice(0, 5000) });
      toast('ひな形に保存しました');
    });
  }
  function undoAction() { return root.Store.canUndo && root.Store.canUndo() ? { label: '元に戻す', fn: function () { var l = root.Store.undo(); toast(l ? '元に戻しました' : '戻せる操作はありません'); } } : null; }
  function table(key, opts) {
    opts = opts || {};
    var S = root.Store, def = S.def(key), list = S.rows(key);
    if (opts.filter) list = list.filter(opts.filter);
    var total = list.length, q = queries[key] || '';
    if (q) list = list.filter(function (r) { return def.fields.some(function (f) { return String(r[f.k] === undefined ? '' : r[f.k]).toLocaleLowerCase().indexOf(q.toLocaleLowerCase()) >= 0; }); });
    if (opts.sort) list = list.slice().sort(opts.sort);
    var grid = modes[key] === 'grid' || (modes[key] === undefined && S.settings().tableMode === 'grid');
    var limit = limits[key] || opts.limit || 40, shown = list.slice(0, limit);
    var fields = def.fields, extra = opts.extraCols || [], acts = opts.rowActions || [];
    var easy = S.settings().easyMode && def.mod === 'client';
    var thead = h('thead', null, h('tr', null, fields.map(function (f) { var t = hint(f); return h('th', { scope: 'col' }, lbl(f), t ? h('span', { class: 'th-hint' }, t) : null); }),
      extra.map(function (c) { return h('th', { scope: 'col' }, c.label); }), h('th', { scope: 'col' }, h('span', { class: 'sr' }, '操作'))));
    var tbody = h('tbody');
    shown.forEach(function (row) {
      if (grid) {
        tbody.appendChild(h('tr', null,
          fields.map(function (f) { var t = hint(f); return h('td', { class: 't-' + (f.type || 'text'), 'data-label': lbl(f) + (t ? '（' + t + '）' : '') }, inputFor(key, row, f)); }),
          extra.map(function (c) { return h('td', { class: 'computed', 'data-label': c.label }, root.App.live(function () { return c.value(row); }, 'span')); }),
          h('td', { class: 't-act' }, acts.map(function (a) {
            return h('button', { type: 'button', class: 'btn tiny ghost', title: a.title || a.label, on: { click: function () { a.onClick(row); } } }, a.label);
          }), h('button', { type: 'button', class: 'icon danger', title: 'この行を削除', 'aria-label': 'この行を削除', on: { click: function () {
            confirmDanger('この行を削除しますか？', '削除した直後なら「元に戻す」で戻せます。', '削除する').then(function (ok) { if (ok) { S.deleteRow(key, row._id); toast('削除しました', undoAction()); } });
          } } }, '×'))));
        return;
      }
      var open = function () { openForm(key, row, opts); };
      var cells = fields.map(function (f, i) {
        var t = hint(f), v = display(f, row[f.k]);
        var td = h('td', { class: 't-' + (f.type || 'text') + (v === '' ? ' is-empty' : ''), 'data-label': lbl(f) + (t ? '（' + t + '）' : '') });
        if (i === 0) td.appendChild(h('button', { type: 'button', class: 'row-open', 'aria-label': rowTitle(def, row) + 'を開いて編集' }, v === '' ? '—' : v));
        else if (f.type === 'check') td.appendChild(row[f.k] ? h('span', { class: 'tick' }, '✓', h('span', { class: 'sr' }, '済')) : h('span', { class: 'sr' }, 'まだ'));
        else td.appendChild(doc.createTextNode(v));
        return td;
      });
      var tr = h('tr', { class: 'row-link', on: { click: function (e) { if (e.target.closest('button') && !e.target.classList.contains('row-open')) return; open(); } } }, cells,
        extra.map(function (c) { return h('td', { class: 'computed', 'data-label': c.label }, root.App.live(function () { return c.value(row); }, 'span')); }),
        h('td', { class: 't-act' }, acts.map(function (a) {
          return h('button', { type: 'button', class: 'btn tiny ghost', title: a.title || a.label, on: { click: function (e) { e.stopPropagation(); a.onClick(row); } } }, a.label);
        })));
      tbody.appendChild(tr);
    });
    var query = h('input', { type: 'search', 'data-search-key': key, 'aria-label': def.title + 'を検索', placeholder: 'ID・日付・言葉で検索', maxlength: '100' }); query.value = q;
    var search = h('form', { class: 'table-search', on: { submit: function (e) { e.preventDefault(); queries[key] = query.value.trim().slice(0, 100); limits[key] = 40; root.App.render(); var focused = doc.querySelector('[data-search-key="' + key + '"]'); if (focused) focused.focus(); } } },
      query, h('button', { type: 'submit', class: 'btn small ghost' }, '検索'), h('button', { type: 'button', class: 'btn small ghost', on: { click: function () { queries[key] = ''; root.App.render(); } } }, '解除'),
      h('span', { class: 'muted small', role: 'status' }, list.length + '件／対象' + total + '件'));
    function addNew(values) {
      queries[key] = ''; limits[key] = 40;
      var r = S.addRow(key, values || (opts.newRow ? opts.newRow() : {}));
      if (grid) { toast('行を追加しました', undoAction()); return; }
      openForm(key, r, { extraCols: extra, rowActions: acts, isNew: true });
    }
    var tpls = templatesOf(key);
    var tplSel = tpls.length ? h('select', { class: 'tpl-select', 'aria-label': 'ひな形から追加', on: { change: function (e) { var t = tpls.filter(function (x) { return x._id === e.target.value; })[0]; e.target.value = ''; if (t) addNew(Object.assign(opts.newRow ? opts.newRow() : {}, fromTemplate(key, t))); } } },
      h('option', { value: '' }, 'ひな形から追加…'), tpls.map(function (t) { return h('option', { value: t._id }, t.name || '（名前なし）'); })) : null;
    var tools = h('div', { class: 'btn-row tight' },
      h('button', { type: 'button', class: 'btn small', on: { click: function () { addNew(); } } }, '＋ 追加'), tplSel,
      h('button', { type: 'button', class: 'btn small ghost', 'aria-pressed': grid ? 'true' : 'false', title: '表の中で直接まとめて編集する', on: { click: function () { modes[key] = grid ? 'list' : 'grid'; root.App.render(); } } }, grid ? '一覧に戻す' : 'まとめて編集'),
      h('button', { type: 'button', class: 'btn small ghost', disabled: !list.length, on: { click: function () { ask('絞込結果を印刷しますか', h('p', null, list.length + '件中、先頭' + Math.min(200, list.length) + '件を印刷します。画面の全項目が含まれるため、共有・置き忘れに注意してください。全件はCSVで保存できます。'), [{ label: '中止', value: false, tone: 'ghost' }, { label: '内容を確認して印刷', value: true }]).then(function (ok) { if (!ok) return; var content = h('div', null, h('h1', null, def.title), h('p', null, '作成日：' + root.Calc.today() + '／絞込：' + (q || 'なし') + '／' + Math.min(200, list.length) + '件'), miniTable(def.fields.map(function (f) { return f.label; }), list.slice(0, 200).map(function (r) { return def.fields.map(function (f) { return f.type === 'check' ? (r[f.k] ? '確認済' : '未確認') : f.type === 'image' ? (r[f.k] ? '写真あり（個別帳票へ）' : '') : String(r[f.k] === undefined ? '' : r[f.k]); }); }))); printDoc(content); }); } } }, '印刷'),
      h('button', { type: 'button', class: 'btn small ghost', title: '表計算ソフトで開けるCSVを保存', on: { click: function () {
        saveFile((opts.csvName || key) + '_' + stamp() + '.csv', csvOf(key, list, extra), 'text/csv').then(function (ok) { if (ok) toast(ok === true ? 'CSVを保存しました' : 'CSVのダウンロードを開始しました（保存先はブラウザで確認）'); });
      } } }, 'CSV'));
    var wrap = h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': def.title + 'の表' }, h('table', { class: 'grid' + (grid ? ' is-grid' : ' is-list') + (easy ? ' easy-records' : ''), role: 'table' }, thead, tbody));
    var more = list.length > limit ? h('p', { class: 'more' }, h('span', { class: 'muted small' }, list.length + '件中 ' + limit + '件を表示'), ' ',
      h('button', { type: 'button', class: 'btn small ghost', on: { click: function () { limits[key] = limit + 60; root.App.render(); } } }, 'さらに表示')) : null;
    var sens = def.sensitive ? (sensShown[root.App && root.App._renderSeq] ? h('p', { class: 'sens-mark small' }, '要配慮の記録（氏名ではなくID・呼び名で）') : h('p', { class: 'warn small' }, '要配慮情報を含みます。氏名・診断名・連絡先・住所は入れず、IDや呼び名で管理してください。')) : null;
    if (def.sensitive && root.App) sensShown[root.App._renderSeq] = true;
    var section = card(opts.title || k(def.title, def.kanaTitle), { wide: true, desc: opts.desc || def.desc, action: tools, cls: 'table-card' + (def.sensitive ? ' sensitive' : '') },
      sens, opts.header || null, search, list.length ? wrap : empty(q ? '一致する記録がありません。検索を解除して確認してください。' : '「＋ 追加」から記録できます。'), more, opts.footer || null);
    section.id = 'record-' + key; section.setAttribute('tabindex', '-1'); section.setAttribute('data-table', key);
    return section;
  }
  var sensShown = Object.create(null);

  // 横棒（色だけに頼らず数値も併記）
  function bars(items, fmt) {
    var max = Math.max.apply(null, items.map(function (i) { return Math.abs(i.value); }).concat([1]));
    return h('ul', { class: 'bars' }, items.map(function (i) {
      var fill = h('span', { class: 'bar-fill' + (i.tone ? ' ' + i.tone : '') });
      fill.style.width = Math.round(Math.abs(i.value) / max * 100) + '%';
      return h('li', null, h('span', { class: 'bar-label' }, i.label), h('span', { class: 'bar-track', 'aria-hidden': 'true' }, fill), h('span', { class: 'bar-value' }, fmt ? fmt(i.value) : String(i.value)));
    }));
  }
  // 小さな集計表
  function miniTable(head, rows, numCols) {
    numCols = numCols || [];
    return h('div', { class: 'table-wrap' }, h('table', { class: 'grid compact' },
      h('thead', null, h('tr', null, head.map(function (x) { return h('th', { scope: 'col' }, x); }))),
      h('tbody', null, rows.map(function (r) { return h('tr', null, r.map(function (c, i) { return h('td', { class: numCols.indexOf(i) >= 0 ? 'num' : '' }, c); })); }))));
  }

  // 印刷（請求書・記録票など）。中身は要素で受け取る
  function printDoc(el) {
    var area = doc.getElementById('print-area'); clear(area); area.appendChild(el);
    doc.body.classList.add('printing');
    root.print();
    setTimeout(function () { doc.body.classList.remove('printing'); clear(area); }, 600);
  }

  // 文章をコピーする（クリップボードが使えないときは選んでコピーできる画面を出す）。送信はしない
  function copyText(text, done) {
    function show() { var ta = h('textarea', { rows: 7, 'aria-label': '文章' }); ta.value = text; ask('文章', h('div', null, h('p', null, '下の文を選んでコピーしてください。メールやLINEなどへは自分で貼って送ります（このツールからは送りません）。'), ta), [{ label: '閉じる', value: true }], { focus: ta }); }
    try { if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) return root.navigator.clipboard.writeText(text).then(function () { toast(done || 'コピーしました。自分で貼って送ってください'); }, show); } catch (e) { /* 下へ */ }
    show(); return Promise.resolve();
  }
  // ひな形の {名前} などを置き換える
  function fillTemplate(tpl, values) { return String(tpl || '').replace(/\{([^{}]{1,20})\}/g, function (all, k) { return values[k] !== undefined && values[k] !== null ? String(values[k]) : all; }); }
  root.UI = { copyText: copyText, fillTemplate: fillTemplate, k: k, kanaOn: kanaOn, h: h, clear: clear, extLink: extLink, toast: toast, ask: ask, confirmDanger: confirmDanger, card: card, stat: stat, badge: badge, empty: empty,
    table: table, openForm: openForm, display: display, fmtDate: fmtDate, bars: bars, miniTable: miniTable, printDoc: printDoc, saveFile: saveFile, downloadFile: downloadFile, stamp: stamp, csvOf: csvOf };
})(this);
