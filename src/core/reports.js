/* Individual report utilities. No network or HTML insertion. */
(function(root){'use strict';var U=root.UI,h=U.h,St=root.Store,C=root.Calc;
function format(tpl,row){return String(tpl||'').replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,function(_,k){return row[k]===undefined?'':String(row[k]||'');});}
function editor(mod,key,label,defaultText){var v=h('div'),ta=h('textarea',{rows:6,'aria-label':label});ta.value=St.modSettings(mod)[key]||defaultText;v.appendChild(root.App.field(label,ta));v.appendChild(h('button',{type:'button',class:'btn small ghost',on:{click:function(){St.setSetting("mod."+mod+"."+key,ta.value);U.toast('帳票テンプレートを保存しました');}}},'テンプレートを保存'));return v;}
function report(title,text,photo){
 var section=h('section',null,h('h1',null,title),h('div',{class:'report-body'},String(text).split('\n').map(function(line){return h('p',null,line||' ');})));if(!photo){U.printDoc(section);return;}
 var img=h('img',{class:'record-photo','aria-label':'添付写真'}),printed=false;
 function finish(){if(printed)return;printed=true;U.printDoc(section);}
 img.addEventListener('load',finish);img.addEventListener('error',finish);
 section.appendChild(img);img.src=photo;
}
root.KDReports={format:format,editor:editor,report:report};
})(this);
