/*
 * こもれびデスク — シフトの作成・調整（v2.8）
 * ・職員ごとの勤務形態メモ（できる勤務・月や週の上限・決まった休み）と、本人からの休み希望・勤務希望
 * ・勤務の種類（早番・日勤・遅番・夜勤など。名前・時間・必要人数は自由に変更）
 * ・ボタン1つで、希望と負担を考えたシフト案を作る（手で固定したところは変えない）
 *   負担を減らす決まり：夜勤の翌日は「明け」、明けの翌日はなるべく休み、連続勤務の上限、遅番の翌日に早番を入れない、
 *   週・月の上限、夜勤回数・土日の勤務・勤務日数の偏りをならす。足りない日は「人が足りない日」として表示（無理に埋めない）
 * ・月のシフト表、年・月を選んで見る一覧、印刷（全員分の表／1人ずつの配布用）、CSV
 * 外部通信なし。サンプルはすべて架空。労働時間・休憩・休日などの法令の判断は、事業所の就業規則と専門家の確認で。
 */
(function (root) {
  'use strict';
  var U = root.UI, h = U.h, C = root.Calc, St = root.Store, num = C.num, KD = root.KD;
  function A() { return root.App; }
  var WD = '日月火水木金土';
  var OFF = '休', AKE = '明', PAID = '有';
  function f(k, label, type, extra) { var o = { k: k, label: label, type: type || 'text' }; if (extra) Object.keys(extra).forEach(function (x) { o[x] = extra[x]; }); return o; }
  var cols = {
    shiftStaff: { title: '職員と勤務形態', desc: '職員は呼び名かIDで。「できる勤務」は勤務の略号をカンマ区切りで（例：早,日,遅）。空なら全部できる扱い。本人の希望や事情は「勤務形態メモ」へ。',
      fields: [f('code', '職員（呼び名・ID）'), f('role', '職種'), f('style', '勤務形態', 'select', { options: ['常勤', 'パート', '日勤のみ', '夜勤専従', 'その他'], free: true }), f('allowed', 'できる勤務（略号）'),
        f('maxDays', '月の上限日数', 'number'), f('weekMax', '週の上限日数', 'number'), f('maxNights', '月の夜勤上限', 'number'), f('fixedOff', '決まった休みの曜日（例：土,日）'),
        f('memo', '勤務形態メモ（本人の希望・事情）', 'textarea'), f('active', '在籍', 'check')] },
    shiftTypes: { title: '勤務の種類', desc: '略号はシフト表に出る1〜2文字。必要人数は平日と土日で分けられます。祝日を土日扱いにするかは「作るときの決まり」で選べます。夜勤にチェックすると、翌日は自動で「明け」になります。',
      fields: [f('code', '略号'), f('name', '名前'), f('start', '開始', 'time'), f('end', '終了', 'time'), f('night', '夜勤', 'check'), f('needWeekday', '平日の必要人数', 'number'), f('needWeekend', '土日の必要人数', 'number'), f('order', '表示順', 'number')] },
    shiftRequests: { title: '休み希望・勤務希望', desc: '本人からの希望。シフトを作るときに最優先で反映します（必要人数より優先）。理由は書かなくても大丈夫です。',
      fields: [f('date', '日付', 'date'), f('code', '職員'), f('kind', '希望', 'select', { options: ['休み希望', '有給希望', 'この勤務を希望', 'この日は勤務できない'] }), f('want', '希望する勤務（略号）'), f('reason', '理由（任意）'), f('status', '状況', 'select', { options: ['受付', '反映済', '調整中', '相談'] })] },
    shiftNeeds: { title: '日ごとの必要人数（特別な日）', desc: '行事・繁忙日など、ふだんと必要人数が違う日だけ入れます。',
      fields: [f('date', '日付', 'date'), f('type', '勤務（略号）'), f('count', '必要人数', 'number'), f('memo', 'メモ')] },
    shiftDayNotes: { title: '日付ごとの共通備考', desc: '会議、行事、連絡事項など。全員用・個人用のシフトと印刷に表示します。', fields: [f('date','日付','date'), f('memo','その日の備考','textarea')] },
    shiftPlan: { title: 'シフト（1日1人1行）', desc: 'シフト表のもとになる記録。シフト表のマスを押して変えるのがかんたんです。「固定」にした行は、作り直しても変わりません。',
      fields: [f('date', '日付', 'date'), f('code', '職員'), f('type', '勤務（略号）'), f('locked', '固定', 'check'), f('memo', 'メモ')] }
  };
  
  ['shiftTogether','shiftApart'].forEach(function(key){cols[key]={title:key==='shiftTogether'?'一緒に組みたい組合せ':'重なりを避けたい組合せ',fields:[f('codeA','職員1'),f('codeB','職員2'),f('scope','対象の勤務','select',{options:['同じ勤務枠','同じ日に勤務','勤務時間が重なる']}),f('tolerance',key==='shiftTogether'?'別々でもよい日数':'重なってもよい日数','number'),f('month','対象月（空欄なら毎月）','month'),f('active','この条件を使う','check')]};});

  function ss() { return St.modSettings('shift'); }
  function list(s) { return String(s || '').split(/[,、\s]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function daysOf(m) { var n = C.daysInMonth(m), out = []; for (var i = 1; i <= n; i++) out.push(m + '-' + C.pad(i)); return out; }
  function wday(d) { return new Date(d + 'T00:00:00').getDay(); }
  function isWeekend(d) { var w = wday(d); return w === 0 || w === 6; }


  // 内閣府公表値（確認日2026-10-20）。未収録年を計算で推測しない。
  var HOLIDAYS = {
    '2026-01-01':'元日','2026-01-12':'成人の日','2026-02-11':'建国記念の日','2026-02-23':'天皇誕生日','2026-03-20':'春分の日','2026-04-29':'昭和の日','2026-05-03':'憲法記念日','2026-05-04':'みどりの日','2026-05-05':'こどもの日','2026-05-06':'振替休日','2026-07-20':'海の日','2026-08-11':'山の日','2026-09-21':'敬老の日','2026-09-22':'国民の休日','2026-09-23':'秋分の日','2026-10-12':'スポーツの日','2026-11-03':'文化の日','2026-11-23':'勤労感謝の日',
    '2027-01-01':'元日','2027-01-11':'成人の日','2027-02-11':'建国記念の日','2027-02-23':'天皇誕生日','2027-03-21':'春分の日','2027-03-22':'振替休日','2027-04-29':'昭和の日','2027-05-03':'憲法記念日','2027-05-04':'みどりの日','2027-05-05':'こどもの日','2027-07-19':'海の日','2027-08-11':'山の日','2027-09-20':'敬老の日','2027-09-23':'秋分の日','2027-10-11':'スポーツの日','2027-11-03':'文化の日','2027-11-23':'勤労感謝の日'
  };
  function customHolidays(set) { return list((set || {}).holidayDates).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && C.addDays(d, 0) === d; }); }
  function holidayName(d, set) { return HOLIDAYS[d] || (customHolidays(set).indexOf(d) >= 0 ? '指定した休日' : ''); }
  function holidayPolicy(set) { return set && /^(weekend|closed)$/.test(set.holidayMode) ? set.holidayMode : 'weekday'; }
  function dayNeed(d, t, settings, needs) {
    var set = settings || {}, special = (needs || []).filter(function (n) { return n.date === d && n.type === t.code; })[0];
    if (special) return Math.max(0, Math.floor(num(special.count)));
    if (list(set.closedDays).indexOf(WD[wday(d)]) >= 0) return 0;
    var holiday = holidayName(d, set), policy = holidayPolicy(set);
    if (holiday && policy === 'closed') return 0;
    return Math.max(0, Math.floor(num(isWeekend(d) || (holiday && policy === 'weekend') ? t.needWeekend : t.needWeekday)));
  }
  function closedOn(d, set, needs) {
    // 日別に必要人数を指定した日は、休業設定よりそちらを優先する。
    if ((needs || []).some(function (n) { return n.date === d && num(n.count) > 0; })) return false;
    return list(set.closedDays).indexOf(WD[wday(d)]) >= 0 || (!!holidayName(d, set) && holidayPolicy(set) === 'closed');
  }
  function holidayLabel(m, set) {
    var known = /^(2026|2027)$/.test(m.slice(0,4));
    var labels = daysOf(m).filter(function (d) { return holidayName(d, set); }).map(function (d) { return Number(d.slice(8)) + '日 ' + holidayName(d, set); });
    return (known ? '祝日データ：2026〜2027年（内閣府・2026-10-20確認）。' : 'この年の国民の祝日は未収録です。公式情報を確認し「追加する休日」に日付を入れてください。') + (labels.length ? ' 今月：' + labels.join('／') : '');
  }

  // ================= シフトを作る（純粋な関数。画面と保存から独立していてテストできる） =================
  // input: { month, staff:[...], types:[...], requests:[...], needs:[...], locked:[{date,code,type}], prevTail:{code:[type,...直前の数日]}, settings, rand }
  function generateBase(input) {
    var days = daysOf(input.month), set = input.settings || {}, rand = input.rand || Math.random;
    var maxConsec = Math.max(2, num(set.maxConsecutive) || 5), closed = list(set.closedDays).map(function (x) { return WD.indexOf(x); }).filter(function (x) { return x >= 0; });
    var staff = input.staff.filter(function (s) { return s.active !== false && s.code; });
    var types = input.types.filter(function (t) { return t.code; }).slice().sort(function (a, b) { return (b.night ? 1 : 0) - (a.night ? 1 : 0) || num(a.order) - num(b.order); });
    var grid = Object.create(null), why = [], count = Object.create(null);
    staff.forEach(function (s) { grid[s.code] = {}; count[s.code] = { days: 0, nights: 0, weekend: 0, byType: {} }; });
    function put(code, d, t, src) { if (!grid[code]) return; grid[code][d] = { type: t, src: src }; }
    // 1) 手で固定した分
    (input.locked || []).forEach(function (r) { if (grid[r.code] && days.indexOf(r.date) >= 0) put(r.code, r.date, r.type, 'locked'); });
    // 2) 本人の希望（休み・有給・不可・勤務希望）
    (input.requests || []).forEach(function (r) {
      if (!grid[r.code] || days.indexOf(r.date) < 0 || grid[r.code][r.date]) return;
      if (r.kind === '休み希望' || r.kind === 'この日は勤務できない') put(r.code, r.date, OFF, 'request');
      else if (r.kind === '有給希望') put(r.code, r.date, PAID, 'request');
    });
    // 3) 決まった休みの曜日・定休日
    staff.forEach(function (s) { var fo = list(s.fixedOff).map(function (x) { return WD.indexOf(x); }); days.forEach(function (d) { if (!grid[s.code][d] && (fo.indexOf(wday(d)) >= 0 || closedOn(d, set, input.needs))) put(s.code, d, OFF, 'fixed'); }); });
    function typeOf(code) { return types.filter(function (t) { return t.code === code; })[0]; }
    function isWork(t) { return t && t !== OFF && t !== PAID && t !== AKE; }
    function at(code, i) { if (i >= 0) { var c = grid[code][days[i]]; return c ? c.type : ''; } var tail = (input.prevTail || {})[code] || []; return tail[tail.length + i] || ''; }
    function consecBefore(code, i) { var n = 0; for (var j = i - 1; j >= i - 14; j--) { var t = at(code, j); if (isWork(t) || t === AKE) n++; else break; } return n; }
    function weekCount(code, i) { var w = (wday(days[i]) + 6) % 7, n = 0; for (var j = i - w; j < i - w + 7; j++) if (j >= 0 && j < days.length && isWork(at(code, j))) n++; return n; }
    function allowed(s, t) { var a = list(s.allowed); if (s.style === '日勤のみ' && t.night) return false; if (s.style === '夜勤専従' && !t.night) return false; return !a.length || a.indexOf(t.code) >= 0; }
    function need(d, t) { return dayNeed(d, t, set, input.needs); }
    staff.forEach(function(s){var prior=typeOf(at(s.code,-1));if(prior&&prior.night&&!grid[s.code][days[0]])put(s.code,days[0],AKE,'auto');days.forEach(function(d,i){var cell=grid[s.code][d],tt=cell&&typeOf(cell.type),next=days[i+1];if(tt&&tt.night&&next&&!grid[s.code][next])put(s.code,next,AKE,'auto');});});
    function canWork(s, i, t) {
      var d = days[i], c = count[s.code];
      if (grid[s.code][d]) return false;
      if (!allowed(s, t)) return false;
      var prev = at(s.code, i - 1), prevT = typeOf(prev);
      if (prevT && prevT.night) return false;                       // 夜勤の翌日は明け
      if (prev === AKE && !t.night && set.restAfterAke !== false) { /* 明けの翌日は、できれば休み（あとで点数で避ける） */ }
      if (consecBefore(s.code, i) >= (t.night ? maxConsec - 1 : maxConsec)) return false; // 連続勤務の上限（夜勤は翌日の明けも数える）
      var future=days.slice(i+1).filter(function(date){var cell=grid[s.code][date];return cell&&isWork(cell.type);}).length;
      if (num(s.maxDays) && c.days+future >= num(s.maxDays)) return false;
      if (num(s.weekMax) && weekCount(s.code, i) >= num(s.weekMax)) return false;
      var futureNights=days.slice(i+1).filter(function(date){var cell=grid[s.code][date],tt=cell&&typeOf(cell.type);return tt&&tt.night;}).length;
      if (t.night && num(s.maxNights) >= 0 && s.maxNights !== '' && s.maxNights !== undefined && c.nights+futureNights >= num(s.maxNights)) return false;
      if (t.night) { var nx = days[i + 1]; if (nx && grid[s.code][nx] && grid[s.code][nx].type !== AKE) return false; }  // 翌日に予定があれば夜勤にしない
      if (set.avoidLateEarly !== false && prevT && prevT.end && t.start && prevT.end > '19:00' && t.start < '08:00') return false; // 遅番→早番を避ける
      return true;
    }
    function score(s, i, t) {
      var c = count[s.code], prev = at(s.code, i - 1), sc = c.days * 10 + (c.byType[t.code] || 0) * 6 + (t.night ? c.nights * 25 : 0) + (isWeekend(days[i]) || (holidayName(days[i], set) && holidayPolicy(set) === 'weekend') ? c.weekend * 8 : 0);
      if (prev === AKE && set.restAfterAke!==false) sc += 60;                                    // 明けの翌日はなるべく休ませる
      sc += consecBefore(s.code, i) * 12;                            // 連勤を短く
      (input.requests || []).forEach(function (r) { if (r.code === s.code && r.date === days[i] && r.kind === 'この勤務を希望') sc += r.want === t.code ? -500 : 40; });
      return sc + pairBias(s,i,t,grid,input,types,days) + rand() * 18;                                        // 同じくらいなら、くじで決める
    }
    // 4) 1日ずつ、夜勤など難しい勤務から順に埋める
    days.forEach(function (d, i) {
      types.forEach(function (t) {
        var n = need(d, t), have = staff.filter(function (s) { var c = grid[s.code][d]; return c && c.type === t.code; }).length;
        while (have < n) {
          var cands = staff.filter(function (s) { return canWork(s, i, t); });
          if (!cands.length) { why.push({ date: d, type: t.code, short: n - have }); break; }
          var ranked=cands.map(function(person){return {person:person,score:score(person,i,t)};});ranked.sort(function(a,b){return a.score-b.score;});
          var s = ranked[0].person; put(s.code, d, t.code, 'auto'); have++;
          if (t.night && days[i + 1] && !grid[s.code][days[i + 1]]) put(s.code, days[i + 1], AKE, 'auto');
          var c = count[s.code]; c.days++; c.byType[t.code] = (c.byType[t.code] || 0) + 1; if (t.night) c.nights++; if (isWeekend(d) || (holidayName(d, set) && holidayPolicy(set) === 'weekend')) c.weekend++;
        }
      });
      // 固定・希望で入った勤務も数える
      staff.forEach(function (s) { var cell = grid[s.code][d]; if (cell && cell.src !== 'auto' && isWork(cell.type) && !cell.counted) { var c = count[s.code], t = typeOf(cell.type); cell.counted = true; c.days++; c.byType[cell.type] = (c.byType[cell.type] || 0) + 1; if (t && t.night) c.nights++; if (isWeekend(d) || (holidayName(d, set) && holidayPolicy(set) === 'weekend')) c.weekend++; } });
    });
    // 5) 残りは休み
    var rows = [];
    staff.forEach(function (s) { days.forEach(function (d) { var cell = grid[s.code][d] || { type: OFF, src: 'auto' }; rows.push({ date: d, code: s.code, type: cell.type, locked: cell.src === 'locked', memo: cell.src === 'request' ? '希望を反映' : '' }); }); });
    return { rows: rows, shortages: why, counts: count };
  }

  // Pair preferences are soft goals, counted per calendar start-day. No personal reasons are collected.
  var PAIR_SCOPES = ['同じ勤務枠', '同じ日に勤務', '勤務時間が重なる'];
  function pairRules(input) {
    var staff = input.staff.filter(function(s){return s.active!==false&&s.code;}), known=Object.create(null), seen=Object.create(null), rules=[], errors=[];
    staff.forEach(function(s){if(known[s.code])errors.push('職員IDが重複しています：'+s.code);known[s.code]=1;});
    [['together',input.together||[]],['apart',input.apart||[]]].forEach(function(group){group[1].forEach(function(r,i){
      if(r.active===false||(r.month&&r.month!==input.month))return;
      var label=(group[0]==='together'?'一緒に組む':'重なりを避ける')+' '+(i+1)+'行目', a=String(r.codeA||'').trim(),b=String(r.codeB||'').trim(), scope=r.scope||'同じ勤務枠', raw=r.tolerance, tol=raw===''||raw===undefined?null:Number(raw);
      if(!a||!b||a===b||!known[a]||!known[b]){errors.push(label+'：在籍する別々の職員を2人選んでください。');return;}
      if(PAIR_SCOPES.indexOf(scope)<0){errors.push(label+'：対象の勤務を選んでください。');return;}
      if(tol===null||!Number.isInteger(tol)||tol<0||tol>31){errors.push(label+'：許容日数は0〜31の整数を入力してください。');return;}
      var key=group[0]+'|'+[a,b].sort().join('|')+'|'+scope;
      if(seen[key]){errors.push(label+'：同じ組合せ・対象の条件が重複しています。');return;}seen[key]=true;
      rules.push({id:r._id||key,kind:group[0],codeA:a,codeB:b,scope:scope,tolerance:tol});
    });});
    if(rules.length>100)errors.push('有効な組合せは月100件までです。');
    return {rules:rules,errors:errors};
  }
  function pairWork(t) {return !!t&&t!==OFF&&t!==AKE&&t!==PAID;}
  function pairIndex(rows){var out=Object.create(null);(rows||[]).forEach(function(r){if(!out[r.code])out[r.code]=Object.create(null);out[r.code][r.date]=r.type;});return out;}
  function interval(date,code,types){var t=types.filter(function(x){return x.code===code;})[0];if(!pairWork(code))return null;if(!t||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.end)||t.start===t.end)return false;
    var begin=Date.parse(date+'T00:00:00Z')/60000, a=Number(t.start.slice(0,2))*60+Number(t.start.slice(3)),b=Number(t.end.slice(0,2))*60+Number(t.end.slice(3));if(b<a)b+=1440;return [begin+a,begin+b];}
  function pairMatch(rule,date,index,types){
    var aa=index[rule.codeA]||{},bb=index[rule.codeB]||{},a=aa[date]||'',b=bb[date]||'';
    if(rule.scope==='同じ勤務枠')return pairWork(a)&&pairWork(b)&&a===b;
    if(rule.scope==='同じ日に勤務')return pairWork(a)&&pairWork(b);
    var prev=C.addDays(date,-1), candidates=[[date,a,date,b],[date,a,prev,bb[prev]],[prev,aa[prev],date,b]],unknown=false;
    for(var j=0;j<candidates.length;j++){var p=candidates[j],x=interval(p[0],p[1],types),y=interval(p[2],p[3],types);if(x===false&&pairWork(p[3])||y===false&&pairWork(p[1]))unknown=true;if(x&&y&&Math.max(x[0],y[0])<Math.min(x[1],y[1]))return true;}
    return unknown?null:false;
  }
  function evaluatePairs(input,rows,prepared){
    var prep=prepared||pairRules(input),index=pairIndex((input.prevPlan||[]).concat(rows)),days=daysOf(input.month);
    var reports=prep.rules.map(function(rule){var separate=[],overlap=[],unknown=[],joint=[];
      days.forEach(function(d){var a=(index[rule.codeA]||{})[d],b=(index[rule.codeB]||{})[d],match=pairMatch(rule,d,index,input.types);
        if(match===null){unknown.push(d);return;}if(match){overlap.push(d);joint.push(d);}else if(pairWork(a)||pairWork(b))separate.push(d);
      });var violated=rule.kind==='together'?separate:overlap;
      return {id:rule.id,kind:rule.kind,codeA:rule.codeA,codeB:rule.codeB,scope:rule.scope,tolerance:rule.tolerance,days:violated.length,excess:Math.max(0,violated.length-rule.tolerance),dates:violated,unknown:unknown,jointDays:joint.length};
    });return {reports:reports,errors:prep.errors,excess:reports.reduce(function(n,r){return n+r.excess;},0),unknown:reports.reduce(function(n,r){return n+r.unknown.length;},0)};
  }
  function pairBias(s,i,t,grid,input,types,days){
    var score=0; (input._pairRules||[]).forEach(function(r){if(s.code!==r.codeA&&s.code!==r.codeB)return;var other=s.code===r.codeA?r.codeB:r.codeA,cell=grid[other]&&grid[other][days[i]];
      if(!cell)return;var match=r.scope==='同じ日に勤務'?pairWork(cell.type):r.scope==='同じ勤務枠'?pairWork(cell.type)&&cell.type===t.code:false;
      if(r.scope==='勤務時間が重なる'){var x=interval(days[i],t.code,types),y=interval(days[i],cell.type,types);match=!!(x&&y&&Math.max(x[0],y[0])<Math.min(x[1],y[1]));}
      score+=r.kind==='together'?(match?-65:pairWork(cell.type)?65:35):(match?110:0);
    });return score;
  }
  function staffViolations(s,map,input){
    var days=daysOf(input.month),types=input.types,by=Object.create(null),max=Math.max(2,num(input.settings&&input.settings.maxConsecutive)||5),allowed=list(s.allowed),n=0,night=0,week=Object.create(null),errors=0;
    function at(i){if(i<0){var tail=(input.prevTail||{})[s.code]||[];return tail[tail.length+i]||'';}return map[days[i]]||'';}
    function ty(code){return types.filter(function(t){return t.code===code;})[0];}
    var run=0;for(var p=-14;p<0;p++){var pre=at(p);run=pairWork(pre)||pre===AKE?run+1:0;}
    days.forEach(function(d,i){var code=at(i),t=ty(code),prev=ty(at(i-1));if(pairWork(code)||code===AKE)run++;else run=0;if(run>max)errors++;
      if(prev&&prev.night&&code!==AKE)errors++;
      if(!pairWork(code))return;n++;if(!t){errors++;return;}if(allowed.length&&allowed.indexOf(code)<0||s.style==='日勤のみ'&&t.night||s.style==='夜勤専従'&&!t.night)errors++;
      if(list(s.fixedOff).indexOf(WD[wday(d)])>=0)errors++;
      if(t.night)night++;
      if((input.settings||{}).avoidLateEarly!==false&&prev&&prev.end>'19:00'&&t.start<'08:00')errors++;
      var monday=C.addDays(d,-((wday(d)+6)%7));week[monday]=(week[monday]||0)+1;
    });
    if(num(s.maxDays)&&n>num(s.maxDays))errors+=n-num(s.maxDays);if(s.maxNights!==''&&s.maxNights!==undefined&&night>num(s.maxNights))errors+=night-num(s.maxNights);
    Object.keys(week).forEach(function(k){if(num(s.weekMax)&&week[k]>num(s.weekMax))errors+=week[k]-num(s.weekMax);});return errors;
  }
  function objective(input,result,prep){
    var map=pairIndex(result.rows),hard=input.staff.filter(function(s){return s.active!==false&&s.code;}).reduce(function(n,s){return n+staffViolations(s,map[s.code]||{},input);},0),requests=0;
    (input.requests||[]).forEach(function(r){if(r.kind==='この勤務を希望'&&String(r.date||'').slice(0,7)===input.month&&(map[r.code]||{})[r.date]!==r.want)requests++;});
    var p=evaluatePairs(input,result.rows,prep),counts=Object.keys(map).map(function(k){return Object.keys(map[k]).filter(function(d){return pairWork(map[k][d]);}).length;}),fair=counts.reduce(function(n,v){return n+v*v;},0);
    return [hard,result.shortages.reduce(function(n,r){return n+r.short;},0),requests,p.unknown,p.excess,fair];
  }
  function better(a,b){for(var i=0;i<a.length;i++){if(a[i]<b[i])return true;if(a[i]>b[i])return false;}return false;}
  function improvePairs(input,result,prep){
    var staff=input.staff.filter(function(s){return s.active!==false&&s.code;}),days=daysOf(input.month),index=Object.create(null),protectedCells=Object.create(null),map=pairIndex(result.rows),best=objective(input,result,prep),steps=0;
    result.rows.forEach(function(r,i){index[r.code+'|'+r.date]=i;});
    (input.locked||[]).concat((input.requests||[]).filter(function(r){return r.kind!=='この勤務を希望';})).forEach(function(r){protectedCells[r.code+'|'+r.date]=1;});
    function canSwap(s,d){var pos=index[s.code+'|'+d],r=result.rows[pos];return r&&!r.locked&&!protectedCells[s.code+'|'+d]&&list(s.fixedOff).indexOf(WD[wday(d)])<0&&!closedOn(d,input.settings||{},input.needs);}
    // Bounded local search: swap one day, or a night+following-day block. Never move protected cells.
    for(var pass=0;pass<4&&steps<(input._sampleFast?160:1400);pass++){var changed=false;
      for(var di=0;di<days.length&&steps<(input._sampleFast?160:1400);di++)for(var ai=0;ai<staff.length&&steps<(input._sampleFast?160:1400);ai++)for(var bi=ai+1;bi<staff.length&&steps<(input._sampleFast?160:1400);bi++){
        var a=staff[ai],b=staff[bi],d=days[di],a0=(map[a.code]||{})[d],b0=(map[b.code]||{})[d];if(a0===b0||!canSwap(a,d)||!canSwap(b,d))continue;
        if(!prep.rules.some(function(r){return r.codeA===a.code||r.codeB===a.code||r.codeA===b.code||r.codeB===b.code;}))continue;
        var block=input.types.some(function(t){return t.night&&(t.code===a0||t.code===b0);})?2:1;if(di+block>days.length)continue;
        if(block===2&&(!canSwap(a,days[di+1])||!canSwap(b,days[di+1])))continue;
        steps++;var oldA=[],oldB=[];for(var z=0;z<block;z++){var day=days[di+z];oldA.push(map[a.code][day]);oldB.push(map[b.code][day]);map[a.code][day]=oldB[z];map[b.code][day]=oldA[z];result.rows[index[a.code+'|'+day]].type=oldB[z];result.rows[index[b.code+'|'+day]].type=oldA[z];}
        var score=objective(input,result,prep);if(better(score,best)){best=score;changed=true;}else for(var q=0;q<block;q++){var dd=days[di+q];map[a.code][dd]=oldA[q];map[b.code][dd]=oldB[q];result.rows[index[a.code+'|'+dd]].type=oldA[q];result.rows[index[b.code+'|'+dd]].type=oldB[q];}
      }if(!changed)break;
    }return result;
  }
  function generate(input){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month||''))throw new Error('対象月を指定してください。');
    if(input.staff.filter(function(s){return s.active!==false&&s.code;}).length>100)throw new Error('一括作成は在籍100人までです。');
    var typeIDs=Object.create(null);input.types.forEach(function(t){if(!t.code||typeIDs[t.code]||['休','明','有','__proto__','constructor','prototype'].indexOf(t.code)>=0)throw new Error('勤務の略号に空欄・重複・予約語があります。勤務の種類を確認してください。');typeIDs[t.code]=true;});
    var prep=pairRules(input);if(prep.errors.length)throw new Error(prep.errors.join('\n'));
    var scoped=Object.assign({},input,{_pairRules:prep.rules}),best=generateBase(scoped),score=objective(input,best,prep);
    if(prep.rules.length){for(var attempt=0;attempt<(input._sampleFast?1:7);attempt++){var candidate=generateBase(scoped),next=objective(input,candidate,prep);if(better(next,score)){best=candidate;score=next;}}best=improvePairs(input,best,prep);}
    best.pairs=evaluatePairs(input,best.rows,prep);best.constraintWarnings=objective(input,best,prep)[0];
    var counts=Object.create(null);input.staff.filter(function(s){return s.active!==false&&s.code;}).forEach(function(s){counts[s.code]={days:0,nights:0,weekend:0,byType:{}};});
    best.rows.forEach(function(r){if(!pairWork(r.type)||!counts[r.code])return;var c=counts[r.code],t=input.types.filter(function(x){return x.code===r.type;})[0];c.days++;c.byType[r.type]=(c.byType[r.type]||0)+1;if(t&&t.night)c.nights++;if(isWeekend(r.date))c.weekend++;});best.counts=counts;return best;
  }

  function pairInput(m){return {month:m,staff:staffList(),types:typeList(),together:St.rows('shiftTogether'),apart:St.rows('shiftApart'),prevPlan:St.rows('shiftPlan').filter(function(r){return r.date===C.addDays(m+'-01',-1);})};}
  function pairResultsView(m,result){
    var inp=pairInput(m),made=result||St.rows('shiftPlan').some(function(r){return A().inMonth(r.date,m);}),p=result?result.pairs:evaluatePairs(inp,St.rows('shiftPlan').filter(function(r){return A().inMonth(r.date,m);}));
    var v=h('div',{class:'pair-results'});if(p.errors.length)v.appendChild(h('p',{class:'warn',role:'alert'},p.errors.join(' ')));
    if(!p.reports.length){v.appendChild(h('p',{class:'small muted'},'この月の有効な組合せはまだありません。'));return v;}
    if(!made){v.appendChild(h('p',{class:'small muted'},'シフト案を作ると、実際の別勤務・重複日数をここで確認できます。'));return v;}
    v.appendChild(U.miniTable(['組合せ','希望','判定する対象','許容','実際','許容を超えた日','内容'],p.reports.map(function(r){return [r.codeA+' ＋ '+r.codeB,r.kind==='together'?'一緒に組みたい':'重なりを避けたい',r.scope,r.tolerance+'日まで',r.days+'日',r.excess?r.excess+'日':r.unknown.length?'未判定あり':'許容内',h('details',null,h('summary',null,'日付を見る'),h('p',null,(r.kind==='together'?'別々になった日：':'重なった日：')+(r.dates.join('、')||'なし')),r.unknown.length?h('p',{class:'warn'},'勤務時間が未登録で判定できない日：'+r.unknown.join('、')):null)];})));
    if(result&&result.constraintWarnings)v.appendChild(h('p',{class:'warn'},'固定したマス等に勤務ルールとの矛盾が '+result.constraintWarnings+'件あります。固定・希望を確認してください。'));
    return v;
  }
  function editPair(kind,m,original){
    var pending=original,key=kind==='together'?'shiftTogether':'shiftApart',staff=staffList();if(staff.length<2){U.toast('先に在籍する職員を2人以上登録してください');return;}
    var a=h('select',{'aria-label':'職員1'},h('option',{value:''},'選んでください')),b=h('select',{'aria-label':'職員2'},h('option',{value:''},'選んでください')),scope=h('select',{'aria-label':'対象の勤務'}),tol=h('input',{type:'number',min:0,max:31,step:1,'aria-label':kind==='together'?'別々でもよい日数':'重なってもよい日数'}),month=h('input',{type:'month','aria-label':'対象月'}),active=h('input',{type:'checkbox','aria-label':'この条件を使う'}),error=h('p',{class:'warn',role:'alert'}),close;
    staff.forEach(function(s){a.appendChild(h('option',{value:s.code},s.code));b.appendChild(h('option',{value:s.code},s.code));});PAIR_SCOPES.forEach(function(x){scope.appendChild(h('option',{value:x},x));});
    a.value=original?original.codeA:'';b.value=original?original.codeB:'';scope.value=original?original.scope:kind==='together'?'同じ勤務枠':'勤務時間が重なる';tol.value=original?original.tolerance:0;month.value=original?original.month:m;active.checked=original?original.active!==false:true;
    var body=h('div',null,A().form([A().field('職員1',a),A().field('職員2',b),A().field('対象の勤務',scope,'同じ勤務枠＝略号が同じ。同じ日＝時間帯が違っても勤務あり。時間の重なり＝開始・終了時刻で判定。'),A().field(kind==='together'?'別々でもよい日数（月）':'重なってもよい日数（月）',tol,'0〜31日。0なら、できるだけ毎回希望どおりにします。両方休みの日は別勤務に数えません。'),A().field('対象月',month,'空欄なら毎月に使う条件です。'),A().field('この条件を使う',active)]),error,h('p',{class:'small muted'},'理由や私的な事情は記入不要です。保存しても今のシフトは変わりません。「シフト案を作る」で反映します。'));
    body.appendChild(h('div',{class:'btn-row'},h('button',{type:'button',class:'btn',on:{click:function(){
      var row={codeA:a.value,codeB:b.value,scope:scope.value,tolerance:tol.value,month:month.value,active:active.checked};var inp=pairInput(m);inp[kind]=St.rows(key).filter(function(r){return !pending||r._id!==pending._id;}).concat([row]);
      // Validate even a rule for a different month and disabled drafts.
      var check=pairRules(Object.assign({},inp,{month:row.month||m,[kind]:inp[kind].map(function(r){return r===row?Object.assign({},r,{active:true}):r;})}));
      if(check.errors.length){error.textContent=check.errors.join(' ');return;}
      try{if(pending)St.setRow(key,pending._id,row);else pending=St.addRow(key,row);St.flush().then(function(){close(true);A().render();U.toast('組合せの条件をこの端末に保存しました');},function(){error.textContent='保存できませんでした。入力は残っています。上部の保存状態とバックアップを確認してください。';});}catch(e){error.textContent=e.message;}
    }}},'条件をこの端末に保存'),h('button',{type:'button',class:'btn ghost',on:{click:function(){close(false);}}},'取り消す')));
    U.ask(kind==='together'?'一緒に組みたい組合せ':'重なりを避けたい組合せ',body,[],{onOpen:function(d,done){close=done;a.focus();}});
  }
  function pairRulesCard(m){var v=h('div');
    v.appendChild(h('p',null,'一緒に組みたい2人と、重なりを避けたい2人を設定します。各条件の許容日数を超えた分を減らすよう、複数の案と入替えを比較します。'));
    v.appendChild(h('p',{class:'small muted'},'休み・勤務不可・勤務形態・固定・必要人数を優先します。希望を全部満たせるとは限りません。日数は勤務開始日基準。同じ夜勤同士は1日、前夜の夜勤と翌朝の重なりは翌朝側の日に1日と数えます。休憩時間は差し引きません。'));
    [['together','shiftTogether','一緒に組みたい','別々でもよい'],['apart','shiftApart','重なりを避けたい','重なってもよい']].forEach(function(p){var rows=St.rows(p[1]);v.appendChild(h('h4',null,p[2]));v.appendChild(h('button',{type:'button',class:'btn ghost small',on:{click:function(){editPair(p[0],m);}}},p[2]+'組合せを追加'));
      v.appendChild(rows.length?U.miniTable(['職員1','職員2','対象','許容','対象月','使用','操作'],rows.map(function(r){return [r.codeA,r.codeB,r.scope,p[3]+' '+r.tolerance+'日',r.month||'毎月',r.active?'使う':'休止',h('div',{class:'btn-row'},h('button',{type:'button',class:'btn ghost small',on:{click:function(){editPair(p[0],m,r);}}},'編集'),h('button',{type:'button',class:'btn ghost small',on:{click:function(){U.confirmDanger('この組合せを外しますか？',r.codeA+' と '+r.codeB+' の希望だけを外します。今のシフトは変わりません。','組合せを外す').then(function(ok){if(ok){St.deleteRow(p[1],r._id);A().render();U.toast('組合せを外しました',{label:'元に戻す',fn:function(){St.undo();}});}});}}},'外す'))];})):U.empty('組合せはまだありません。'));
    });v.appendChild(h('h4',null,'今のシフトへの反映状況'));v.appendChild(pairResultsView(m));return U.card('組合せの希望と許容日数',{wide:true},v);}

  // ================= 画面まわり =================
  function staffList() { return St.rows('shiftStaff').filter(function (s) { return s.active !== false && s.code; }); }
  function typeList() { return St.rows('shiftTypes').filter(function (t) { return t.code; }).sort(function (a, b) { return num(a.order) - num(b.order); }); }
  function planMap(m) { var o = {}; St.rows('shiftPlan').forEach(function (r) { if (A().inMonth(r.date, m)) (o[r.code] = o[r.code] || {})[r.date] = r; }); return o; }
  function prevTail(m) {
    var first = m + '-01', o = {};
    St.rows('shiftPlan').filter(function (r) { return r.date < first && C.daysUntil(r.date) !== null && r.date >= C.addDays(first, -7); }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
      .forEach(function (r) { (o[r.code] = o[r.code] || []).push(r.type); });
    return o;
  }
  function makeFor(m, keepAuto) {
    var plan = St.rows('shiftPlan').filter(function (r) { return A().inMonth(r.date, m); });
    var locked = plan.filter(function (r) { return r.locked; }).map(function (r) { return { date: r.date, code: r.code, type: r.type }; });
    var res = generate({ month: m, staff: staffList(), types: typeList(), together:St.rows('shiftTogether'),apart:St.rows('shiftApart'),prevPlan:pairInput(m).prevPlan, requests: St.rows('shiftRequests').filter(function (r) { return A().inMonth(r.date, m); }), needs: St.rows('shiftNeeds'), locked: locked, prevTail: prevTail(m), settings: ss(), rand: cryptoRand });
    return res;
  }
  function cryptoRand() { var a = new Uint32Array(1); root.crypto.getRandomValues(a); return a[0] / 4294967296; }
  function applyPlan(m, res) {
    var keep = St.rows('shiftPlan').filter(function (r) { return !A().inMonth(r.date, m) || r.locked; });
    var lockedKey = {}; keep.forEach(function (r) { lockedKey[r.date + '|' + r.code] = 1; });
    var add = res.rows.filter(function (r) { return !lockedKey[r.date + '|' + r.code]; });
    if (keep.length + add.length > 5000) throw new Error('シフトの行が多すぎます（1表5000行まで）。古い月をCSVで保存してから消してください。');
    var map=pairIndex(res.rows),requests=St.rows('shiftRequests').map(function(r){if(!A().inMonth(r.date,m)||r.status!=='受付')return r;var t=(map[r.code]||{})[r.date],ok=r.kind==='有給希望'?t===PAID:r.kind==='この勤務を希望'?t===r.want:t===OFF||t===PAID;return Object.assign({},r,{status:ok?'反映済':'調整中'});});
    St.commitBatch({shiftPlan:keep.concat(add),shiftRequests:requests},'シフト案と希望の結果を反映');
  }
  function generateFlow(m) {
    if (!staffList().length || !typeList().length) { U.toast('先に「職員と勤務形態」と「勤務の種類」を入れてください'); return; }
    var has = St.rows('shiftPlan').some(function (r) { return A().inMonth(r.date, m) && !r.locked; });
    var res;try{res=makeFor(m);}catch(e){U.toast(e.message);return;}var sourceStamp=JSON.stringify([St.rows('shiftStaff'),St.rows('shiftTypes'),St.rows('shiftTogether'),St.rows('shiftApart'),St.rows('shiftRequests'),St.rows('shiftNeeds'),St.rows('shiftPlan'),ss()]);
    var body = h('div', null, h('p', null, A().ymLabel(m) + 'のシフト案を作ります。本人の希望・決まった休み・「固定」にしたマスはそのまま残します。'),
      has ? h('p', { class: 'warn' }, '今ある' + A().ymLabel(m) + 'の（固定していない）シフトは置き換わります。直後なら「元に戻す」で戻せます。') : null,
      res.shortages.length ? h('div', null, h('p', null, '決まりを守ると人が足りない日があります（無理に埋めていません）：'), h('ul', { class: 'list small' }, res.shortages.slice(0, 12).map(function (x) { return h('li', null, x.date.slice(5) + '（' + WD[wday(x.date)] + '）' + x.type + '：あと' + x.short + '人'); }))) : h('p', { class: 'ok' }, '必要人数をすべて満たせました。'));
    body.appendChild(h('h4',null,'組合せの希望を反映した結果'));body.appendChild(pairResultsView(m,res));
    U.ask('シフト案を作りますか？', body, [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '作る', value: true }]).then(function (ok) {
      if (!ok) return;
      if(sourceStamp!==JSON.stringify([St.rows('shiftStaff'),St.rows('shiftTypes'),St.rows('shiftTogether'),St.rows('shiftApart'),St.rows('shiftRequests'),St.rows('shiftNeeds'),St.rows('shiftPlan'),ss()])||St.conflict()||St.saveFailed()){U.toast('条件または保存状態が変わったため中止しました。現在の条件を確認して作り直してください。');return;}
      try { applyPlan(m,res);St.flush().then(function(){U.toast(A().ymLabel(m)+'のシフト案をこの端末に保存しました',{label:'元に戻す',fn:function(){St.undo();}});},function(){U.toast('シフト案を保存できませんでした。画面には残っています。上部の保存状態とバックアップを確認してください。');});}catch(e){U.toast(e.message);}
    });
  }
  function cellDialog(code, d, row) {
    var types = typeList(), cur = row ? row.type : '';
    var opts = types.map(function (t) { return [t.code, t.code + '（' + (t.name || '') + (t.start ? ' ' + t.start + '〜' + t.end : '') + '）']; }).concat([[OFF, '休み'], [PAID, '有給'], [AKE, '明け']]);
    var lock = h('input', { type: 'checkbox', checked: row ? row.locked : true });
    var memo = h('input', { type: 'text', maxlength: '100', 'aria-label': 'メモ' }); memo.value = row ? row.memo || '' : '';
    var btns = opts.map(function (o) { return h('button', { type: 'button', class: 'btn ' + (o[0] === cur ? '' : 'ghost') + ' shift-pick', 'data-code': o[0] }, o[1]); });
    var chosen = cur;
    btns.forEach(function (b) { b.addEventListener('click', function () { chosen = b.getAttribute('data-code'); btns.forEach(function (x) { x.className = 'btn ' + (x === b ? '' : 'ghost') + ' shift-pick'; }); }); });
    U.ask(code + '：' + d.slice(5).replace('-', '/') + '（' + WD[wday(d)] + '）', h('div', null, h('div', { class: 'shift-picks' }, btns), A().field('メモ', memo), h('label', { class: 'field check' }, lock, h('span', null, '固定（作り直しても変えない）'))),
      [{ label: 'やめる', value: false, tone: 'ghost' }, { label: '保存', value: true }]).then(function (ok) {
      if (!ok || !chosen) return;
      if (row) St.setRow('shiftPlan', row._id, { type: chosen, locked: lock.checked, memo: memo.value }); else St.addRow('shiftPlan', { date: d, code: code, type: chosen, locked: lock.checked, memo: memo.value });
      U.toast('変更しました', { label: '元に戻す', fn: function () { St.undo(); } });
    });
  }
  function reqMap(m) { var o = {}; St.rows('shiftRequests').forEach(function (r) { if (A().inMonth(r.date, m)) o[r.code + '|' + r.date] = r; }); return o; }
  function needFor(d, t) { return dayNeed(d, t, ss(), St.rows('shiftNeeds')); }
  function typeClass(code) { var t = typeList().filter(function (x) { return x.code === code; })[0]; return code === OFF || code === PAID ? 'off' : code === AKE ? 'ake' : t && t.night ? 'night' : t ? 'work t' + Math.min(5, Math.max(0, typeList().indexOf(t))) : ''; }
  function dayNote(d) { return St.rows('shiftDayNotes').filter(function(r){return r.date===d;})[0]; }
  function editDayNote(d) {
    var old=dayNote(d), inp=h('textarea',{rows:4,maxlength:'1500','aria-label':'その日の備考'}); inp.value=old?old.memo||'':'';
    U.ask(d+' の共通備考',h('div',null,A().field('会議・行事・連絡',inp)),[{label:'やめる',value:false,tone:'ghost'},{label:'保存',value:true}]).then(function(ok){if(!ok)return; if(old)St.setRow('shiftDayNotes',old._id,{memo:inp.value});else St.addRow('shiftDayNotes',{date:d,memo:inp.value});U.toast('日付の備考を保存しました');});
  }
  function shiftTable(m, forPrint) {
    var days = daysOf(m), pm = planMap(m), rq = reqMap(m), staff = staffList(), types = typeList();
    var head = h('tr', null, h('th', { scope: 'col', class: 'sticky' }, '職員'), days.map(function (d) { return h('th', { scope: 'col', class: isWeekend(d) || holidayName(d, ss()) ? 'we' : '', title: holidayName(d, ss()) || '' }, Number(d.slice(8)), h('br'), WD[wday(d)], (function(){var n=dayNote(d);return forPrint?null:h('button',{type:'button',class:'btn ghost tiny',title:'この日の共通備考を編集',on:{click:function(){editDayNote(d);}}},n&&n.memo?'備考：'+n.memo:'＋備考');})(), holidayName(d, ss()) ? h('span', { class: 'holiday-mark', 'aria-label': holidayName(d, ss()) }, '祝') : null); }), h('th', { scope: 'col' }, '勤務'), h('th', { scope: 'col' }, '夜勤'), h('th', { scope: 'col' }, '休み'));
    var body = staff.map(function (s) {
      var c = { w: 0, n: 0, o: 0 };
      var cells = days.map(function (d) {
        var r = (pm[s.code] || {})[d], t = r ? r.type : '', q = rq[s.code + '|' + d], tt = types.filter(function (x) { return x.code === t; })[0];
        if (tt) { c.w++; if (tt.night) c.n++; } else if (t === OFF || t === PAID) c.o++;
        var label = (t || '・') + (r && r.locked ? '' : '');
        var cell = forPrint ? h('td', { class: 'sc ' + typeClass(t) + (isWeekend(d) || holidayName(d, ss()) ? ' we' : '') }, t, q ? '*' : '')
          : h('td', { class: 'sc ' + typeClass(t) + (isWeekend(d) || holidayName(d, ss()) ? ' we' : '') + (q ? ' req' : '') + (r && r.locked ? ' lock' : '') }, h('button', { type: 'button', 'aria-label': s.code + ' ' + d + ' ' + (t || '未定') + (q ? '（' + q.kind + '）' : '') + (r && r.locked ? '（固定）' : ''), title: q ? q.kind + (q.want ? '：' + q.want : '') + (q.reason ? '（' + q.reason + '）' : '') : '', on: { click: function () { cellDialog(s.code, d, r); } } }, label));
        return cell;
      });
      return h('tr', null, h('th', { scope: 'row', class: 'sticky' }, s.code, s.role ? h('span', { class: 'small muted' }, ' ' + s.role) : null), cells, h('td', { class: 'num' }, c.w), h('td', { class: 'num' }, c.n), h('td', { class: 'num' }, c.o));
    });
    var foot = types.map(function (t) {
      return h('tr', { class: 'need-row' }, h('th', { scope: 'row', class: 'sticky' }, t.code + ' の人数'), days.map(function (d) {
        var have = staff.filter(function (s) { var r = (pm[s.code] || {})[d]; return r && r.type === t.code; }).length, n = needFor(d, t);
        return h('td', { class: 'num' + (have < n ? ' short' : '') + (isWeekend(d) || holidayName(d, ss()) ? ' we' : ''), title: '必要 ' + n + '人' }, have < n ? have + '/' + n : String(have));
      }), h('td'), h('td'), h('td'));
    });
    return h('div', { class: 'table-wrap shift-wrap', tabindex: '0', role: 'region', 'aria-label': A().ymLabel(m) + 'のシフト表' }, h('table', { class: 'shift-grid' }, h('thead', null, head), h('tbody', null, body), h('tfoot', null, foot)));
  }
  function legend() { return h('p', { class: 'small muted shift-legend' }, typeList().map(function (t) { return t.code + '＝' + (t.name || '') + (t.start ? '（' + t.start + '〜' + t.end + '）' : '') + '　'; }), '休＝休み　有＝有給　明＝夜勤明け　＊＝本人の希望あり'); }
  function printAll(m) {
    var s = ss();
    U.printDoc(h('div', { class: 'shift-print landscape' }, h('h1', null, (s.place || '') + ' シフト表　' + A().ymLabel(m)), h('p', null, '作成日：' + C.today()), shiftTable(m, true), (function(){var notes=daysOf(m).map(function(d){var r=dayNote(d);return {date:d,memo:r&&r.memo||''};}).filter(function(x){return x.memo;});return notes.length?h('section',{class:'shift-print-notes'},h('strong',null,'日付ごとの備考（印刷用一覧）'),h('div',{class:'shift-note-list'},notes.map(function(n,i){return h('div',{class:'shift-note-entry'},h('strong',null,'※'+(i+1)+' '+Number(n.date.slice(8))+'日'),h('span',null,n.memo));}))):null;})(), legend(),
      h('p', { class: 'small' }, '変更があるときは、担当者に知らせてください。')));
  }
  function printEach(m, only) {
    var days = daysOf(m), pm = planMap(m), types = typeList(), s0 = ss();
    var pages = staffList().filter(function (s) { return !only || s.code === only; }).map(function (s) {
      var rows = days.map(function (d) { var r = (pm[s.code] || {})[d], t = r ? r.type : '', tt = types.filter(function (x) { return x.code === t; })[0];
        return h('tr', { class: isWeekend(d) ? 'we' : '' }, h('td', null, h('div',null,Number(d.slice(5, 7)) + '/' + Number(d.slice(8)) + '（' + WD[wday(d)] + '）' + (holidayName(d, ss()) ? ' ' + holidayName(d, ss()) : '')), dayNote(d)&&dayNote(d).memo?h('div',{class:'small'},'備考：'+dayNote(d).memo):null), h('td', null, tt ? (tt.name || tt.code) : t === OFF ? '休み' : t === PAID ? '有給' : t === AKE ? '明け' : '—'), h('td', null, tt && tt.start ? tt.start + '〜' + tt.end : ''), h('td', null, r&&r.memo?r.memo:'')); });
      var work = days.filter(function (d) { var r = (pm[s.code] || {})[d]; return r && types.some(function (x) { return x.code === r.type; }); }).length;
      return h('section', { class: 'person-slip' }, h('h1', null, s.code + 'さん　' + A().ymLabel(m) + 'のシフト'), h('p', null, (s0.place ? s0.place + '　' : '') + '勤務 ' + work + '日'),
        h('table', null, h('thead', null, h('tr', null, ['日付', '勤務', '時間', 'メモ'].map(function (x) { return h('th', null, x); }))), h('tbody', null, rows)),
        h('p', { class: 'small' }, '休みの希望や体調のことは、遠慮なく担当者に伝えてください。'));
    });
    if (!pages.length) { U.toast('印刷する職員がいません'); return; }
    U.printDoc(h('div', { class: 'shift-print' }, pages));
  }
  function csv(m) {
    var days = daysOf(m), pm = planMap(m);
    return C.toCSV([['職員'].concat(days)].concat(staffList().map(function (s) { return [s.code].concat(days.map(function (d) { var r = (pm[s.code] || {})[d]; return r ? r.type : ''; })); })));
  }
  function yearView(y) {
    var types = typeList(), staff = staffList(), months = []; for (var i = 1; i <= 12; i++) months.push(y + '-' + C.pad(i));
    var by = {}; St.rows('shiftPlan').forEach(function (r) { if (String(r.date).slice(0, 4) !== String(y)) return; var mm = r.date.slice(0, 7), t = types.filter(function (x) { return x.code === r.type; })[0]; if (!t) return; var o = ((by[r.code] = by[r.code] || {})[mm] = (by[r.code] || {})[mm] || { w: 0, n: 0 }); o.w++; if (t.night) o.n++; });
    return h('div', { class: 'shift-year' }, U.miniTable(['職員'].concat(months.map(function (m) { return Number(m.slice(5)) + '月'; }), ['合計']), staff.map(function (s) {
      var tot = 0; return [s.code].concat(months.map(function (m) { var o = (by[s.code] || {})[m]; if (!o) return '—'; tot += o.w; return o.w + (o.n ? '（夜' + o.n + '）' : ''); }), [tot]);
    })));
  }
  function summary(m) {
    var res = { short: 0 }, days = daysOf(m), pm = planMap(m), types = typeList(), staff = staffList();
    days.forEach(function (d) { types.forEach(function (t) { var have = staff.filter(function (s) { var r = (pm[s.code] || {})[d]; return r && r.type === t.code; }).length; if (have < needFor(d, t)) res.short++; }); });
    var req = St.rows('shiftRequests').filter(function (r) { return A().inMonth(r.date, m); }), honored = req.filter(function (r) { var c = (pm[r.code] || {})[r.date]; if (!c) return false; return (r.kind === '休み希望' || r.kind === 'この日は勤務できない') ? c.type === OFF || c.type === PAID : r.kind === '有給希望' ? c.type === PAID : r.kind === 'この勤務を希望' ? c.type === r.want : false; }).length;
    var made = St.rows('shiftPlan').some(function (r) { return A().inMonth(r.date, m); });
    return h('div', { class: 'stats' }, U.stat('シフト', made ? '作成済み' : 'まだ', made ? '' : '「シフト案を作る」で作れます', made ? 'good' : ''), U.stat('人が足りないマス', res.short + '件', res.short ? '下の表の赤い数字' : '', res.short ? 'warn' : 'good'), U.stat('希望の反映', honored + ' / ' + req.length + '件', req.length && honored < req.length ? '反映できていない希望があります' : ''));
  }
  function sample(H, st0) {
    var night = ['salon', 'shop', 'tutor', 'craft', 'service', 'freelance'].indexOf(KD.edition) < 0;
    var types = night ? [['早','早番','07:00','16:00',false,1,1,1],['日','日勤','09:00','18:00',false,2,1,2],['遅','遅番','11:00','20:00',false,1,1,3],['夜','夜勤','17:00','09:00',true,1,1,4]] : [['早','早番','09:00','17:00',false,2,2,1],['遅','遅番','12:00','20:00',false,2,3,2]];
    var configs = night ? [
      ['管理者','常勤','早,日,遅',22,5,0,'土,日','平日の早番・日勤を中心に組む見本'],
      ['生活支援員','常勤','',22,5,5,'','夜勤も含めて担当する見本'],
      ['生活支援員','常勤','',22,5,5,'','早番・遅番を含む見本'],
      ['職業指導員','日勤のみ','早,日,遅',21,5,0,'','夜勤を入れない見本'],
      ['生活支援員','パート','日',12,3,0,'水','週3日までの日勤の見本'],
      ['生活支援員','夜勤専従','夜',10,4,10,'','夜勤と明け・休みの並びを見る見本'],
      ['看護職員','パート','日',8,2,0,'土,日','週2日までの日勤の見本'],
      ['生活支援員','常勤','',22,5,4,'','月の夜勤上限を変えた見本'],
      ['生活支援員','パート','遅',14,4,0,'','遅番だけの見本'],
      ['世話人','パート','早,日',12,3,0,'日','日曜は勤務しない見本']
    ] : [
      ['責任者','常勤','',22,5,0,'','早番・遅番どちらも担当する見本'],
      ['スタッフ','常勤','',21,5,0,'日','日曜を休みにする見本'],
      ['スタッフ','パート','早',12,3,0,'','早番だけ・週3日までの見本'],
      ['スタッフ','パート','遅',12,3,0,'月','遅番だけ・月曜休みの見本'],
      ['スタッフ','常勤','',20,5,0,'','月の上限日数を変えた見本'],
      ['スタッフ','パート','早',14,4,0,'水','水曜休みの見本'],
      ['スタッフ','パート','遅',14,4,0,'火','火曜休みの見本'],
      ['スタッフ','常勤','',22,5,0,'','勤務の偏りを見る見本'],
      ['スタッフ','パート','早,遅',12,3,0,'土','土曜休みの見本'],
      ['スタッフ','パート','早,遅',10,3,0,'日','短い月上限の見本']
    ];
    configs=configs.concat(configs.map(function(c,i){var out=c.slice();out[3]=Math.max(8,out[3]-(i%3));out[7]=['新人の手順確認を先輩と同じ勤務で行う見本','繁忙日の受付を補助する見本','月後半の在庫確認を担当する見本','作業室と送迎の担当を分ける見本','午前の準備と片付けを担当する見本'][i%5];return out;}));
    var staff=configs.map(function(s,i){return {code:'DEMO-S'+C.pad(i+1),role:s[0],style:s[1],allowed:s[2],maxDays:s[3]-H.int(0,2),weekMax:s[4],maxNights:s[5],fixedOff:s[6],memo:'完全架空のサンプル職員'+C.pad(i+1)+'：'+s[7],active:true};});
    var ty=types.map(function(t){return {code:t[0],name:t[1],start:t[2],end:t[3],night:t[4],needWeekday:t[5],needWeekend:t[6],order:t[7]};});
    var m=H.month(0),requests=[],seen={};if(st0&&st0.settings.mod.shift)st0.settings.mod.shift.sampleMonth=m;
    staff.forEach(function(s,i){for(var j=0;j<3;j++){var n=H.int(1,28);while(seen[s.code+'-'+n])n=n%28+1;seen[s.code+'-'+n]=true;requests.push({date:H.dom(n),code:s.code,kind:j===0?'休み希望':H.pick(['有給希望','この日は勤務できない']),want:'',reason:'架空の希望例・理由の記入は不要',status:'受付'});}});
    staff.slice(0,8).forEach(function(s){var n=H.int(1,28);while(seen[s.code+'-'+n])n=n%28+1;seen[s.code+'-'+n]=true;requests.push({date:H.dom(n),code:s.code,kind:'この勤務を希望',want:list(s.allowed)[0]||ty[0].code,reason:'勤務希望を確認する架空例',status:'受付'});});
    var settings=night?{}:{closedDays:H.weekday(H.today)===2?'月':'火'};
    if(st0&&st0.settings&&st0.settings.mod&&st0.settings.mod.shift&&settings.closedDays)st0.settings.mod.shift.closedDays=settings.closedDays;
    var needs=[7,14,25].map(function(n,i){return {date:H.dom(n),type:ty[i%ty.length].code,count:H.int(3,4),memo:'架空の繁忙日：通常より多い必要人数の見本'};});
    var together=[{codeA:'DEMO-S02',codeB:'DEMO-S12',scope:'同じ勤務枠',tolerance:3,month:m,active:true},{codeA:'DEMO-S03',codeB:'DEMO-S13',scope:'同じ日に勤務',tolerance:4,month:m,active:true}],apart=[{codeA:'DEMO-S01',codeB:'DEMO-S08',scope:'勤務時間が重なる',tolerance:2,month:m,active:true},{codeA:'DEMO-S04',codeB:'DEMO-S14',scope:'同じ勤務枠',tolerance:1,month:m,active:true}];
    var result=generate({month:m,staff:staff,types:ty,together:together,apart:apart,requests:requests,needs:needs,locked:[],prevTail:{},settings:settings,rand:H.r,_sampleFast:true});
    requests.forEach(function(r){var row=result.rows.filter(function(x){return x.code===r.code&&x.date===r.date;})[0];var ok=row&&(r.kind==='有給希望'?row.type===PAID:r.kind==='この勤務を希望'?row.type===r.want:row.type===OFF||row.type===PAID);r.status=ok?'反映済':'調整中';});
    return {shiftStaff:staff,shiftTypes:ty,shiftRequests:requests,shiftNeeds:needs,shiftPlan:result.rows,shiftTogether:together,shiftApart:apart,shiftDayNotes:[{date:H.day(2),memo:'架空の全体会議（14時）'},{date:H.day(9),memo:'架空の避難訓練（午前）'},{date:H.day(16),memo:'架空の設備点検日'}]};
  }
  function view() {
    var m = A().ui.month, v = h('div'), live = A().live, F = A().field, S = A().set;
    var y = A().ui.shiftYear || m.slice(0, 4);
    v.appendChild(A().viewHead('シフト', '本人の希望と勤務形態をもとに、負担が偏らないシフト案を作ります。作ったあとはマスを押して手で直せます。', A().monthPicker()));
    v.appendChild(h('div',{class:'notice'},h('strong',null,'20人分の動き方を試す'),h('p',{class:'small'},'通常の記録を消さず、別の保存領域で架空サンプルを開けます。現在の画面にサンプルが出ない場合もこちらを使ってください。'),h('a',{class:'btn ghost small',href:'?demo=20#shift',target:'_blank',rel:'noopener'},'20人の架空サンプルを別画面で開く')));
    v.appendChild(A().grid(
      U.card(A().ymLabel(m) + 'のシフト', { wide: true, cls: 'accent', action: h('div', { class: 'btn-row tight' },
        h('button', { type: 'button', class: 'btn', on: { click: function () { generateFlow(m); } } }, 'シフト案を作る'),
        h('button', { type: 'button', class: 'btn ghost small', on: { click: function () { printAll(m); } } }, 'シフト表を印刷'),
        h('button', { type: 'button', class: 'btn ghost small', on: { click: function () { printEach(m); } } }, '1人ずつ印刷（配布用）'),
        h('button', { type: 'button', class: 'btn ghost small', on: { click: function () { U.saveFile('komorebi-shift-' + m + '.csv', csv(m), 'text/csv'); } } }, 'CSV')) },
        live(function () { return summary(m); }), live(function () { return staffList().length ? shiftTable(m, false) : U.empty('「職員と勤務形態」に職員を入れると、ここにシフト表が出ます。'); }), legend()),
      U.card('作るときの決まり', null, h('p', { class: 'small muted holiday-note' }, holidayLabel(m, ss())), A().form([
        F('連続勤務の上限（日）', S('mod.shift.maxConsecutive', 'number', { min: 2 }), '明けも勤務として数えます'),
        F('明けの翌日はなるべく休み', S('mod.shift.restAfterAke', 'check')), F('遅番の翌日に早番を入れない', S('mod.shift.avoidLateEarly', 'check')),
        F('定休日の曜日（例：火）', S('mod.shift.closedDays', 'text'), '日別の必要人数を指定した日はそちらを優先します'), F('祝日の扱い', S('mod.shift.holidayMode', 'select', { options: [['weekday', '従来どおり（曜日の必要人数）'], ['weekend', '土日と同じ必要人数'], ['closed', '休業日にする']], render: true }), '保存済みシフトは変わりません。次に作る案から反映します'), F('追加する休日', S('mod.shift.holidayDates', 'textarea', { render: true }), '例：2028-01-01。日付を改行かカンマで区切ります'), F('印刷に出す事業所・店名', S('mod.shift.place', 'text'))]),
        h('p', { class: 'small muted' }, '本人の休み希望・決まった休み・固定したマスが最優先です。足りない日は無理に埋めず、表の下の赤い数字で知らせます。労働時間や休日の法令の確認は、就業規則と専門家に。')),
      U.card('年・月ごとの一覧', null, h('label', { class: 'month-pick' }, '年 ', (function () { var sel = h('select', { 'aria-label': '年を選ぶ', on: { change: function (e) { A().ui.shiftYear = e.target.value; A().render(); } } }); var cy = new Date().getFullYear(); for (var i = cy - 2; i <= cy + 1; i++) sel.appendChild(h('option', { value: String(i), selected: String(i) === String(y) }, i + '年')); return sel; })()),
        live(function () { return staffList().length ? yearView(y) : U.empty(); }), h('p', { class: 'small muted' }, '数字は勤務した日数（夜＝夜勤の回数）。月を選ぶと上のシフト表が切り替わります。'),
        h('div', { class: 'btn-row tight month-links' }, (function () { var out = []; for (var i = 1; i <= 12; i++) (function (mm) { out.push(h('button', { type: 'button', class: 'btn tiny ghost' + (mm === m ? ' on' : ''), on: { click: function () { A().ui.month = mm; A().render(); } } }, Number(mm.slice(5)) + '月')); })(y + '-' + C.pad(i)); return out; })()))));
    if(St.get().sample&&ss().sampleMonth&&ss().sampleMonth!==m)v.appendChild(U.card('サンプルの対象月',null,h('p',null,'20人分のサンプルは '+ss().sampleMonth+' に入っています。'),h('button',{type:'button',class:'btn ghost',on:{click:function(){A().ui.month=ss().sampleMonth;A().render();}}},'サンプルの月を開く')));
    v.appendChild(pairRulesCard(m));
    v.appendChild(U.table('shiftRequests', { filter: function (r) { return !r.date || A().inMonth(r.date, m); }, sort: function (a, b) { return String(a.date).localeCompare(String(b.date)); }, newRow: function () { return { date: m + '-01' > C.today() ? m + '-01' : C.today(), kind: '休み希望', status: '受付' }; } }));
    v.appendChild(U.table('shiftStaff', { sort: function (a, b) { return String(a.code).localeCompare(String(b.code)); }, newRow: function () { return { active: true, style: '常勤', maxDays: 22, weekMax: 5 }; },
      rowActions: [{ label: '配布用を印刷', onClick: function (r) { printEach(m, r.code); } }] }));
    v.appendChild(U.table('shiftTypes', { sort: function (a, b) { return num(a.order) - num(b.order); }, newRow: function () { return { order: typeList().length + 1, needWeekday: 1, needWeekend: 1 }; } }));
    v.appendChild(U.table('shiftDayNotes', {filter:function(r){return !r.date||A().inMonth(r.date,m);},newRow:function(){return {date:C.today()};}}));
    v.appendChild(U.table('shiftNeeds', { filter: function (r) { return !r.date || A().inMonth(r.date, m); }, newRow: function () { return { date: C.today() }; } }));
    v.appendChild(U.table('shiftPlan', { filter: function (r) { return !r.date || A().inMonth(r.date, m); }, sort: function (a, b) { return String(a.date).localeCompare(String(b.date)) || String(a.code).localeCompare(String(b.code)); }, limit: 60 }));
    return v;
  }
  function home() {
    return [A().homeCard('今日のシフト', { action: A().navBtn('shift', 'シフトを開く') }, A().live(function () {
      var t = C.today(), rows = St.rows('shiftPlan').filter(function (r) { return r.date === t; }), types = typeList();
      var work = rows.filter(function (r) { return types.some(function (x) { return x.code === r.type; }); });
      return work.length ? U.miniTable(['職員', '勤務'], work.map(function (r) { var tt = types.filter(function (x) { return x.code === r.type; })[0]; return [r.code, (tt.name || tt.code) + (tt.start ? '（' + tt.start + '〜' + tt.end + '）' : '')]; })) : U.empty('今日のシフトはまだありません。');
    }))];
  }
  KD.shift = { generate: generate, evaluatePairs:evaluatePairs,validatePairs:pairRules,staffViolations:staffViolations,applyPlan:applyPlan, holidayName: holidayName, dayNeed: dayNeed, holidayYears: [2026, 2027] };
  KD.mod({ id: 'shift', title: 'シフト', icon: '番', order: 66, collections: cols, sample: sample, view: view, home: home, defaults: { maxConsecutive: 5, restAfterAke: true, avoidLateEarly: true, closedDays: '', place: '', holidayMode: 'weekday', holidayDates: '', sampleMonth: '' } });
})(this);
