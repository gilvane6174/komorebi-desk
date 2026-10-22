/* こもれびデスク — 制作工程。外部通信なし。サンプルはすべて架空。 */
(function(root){'use strict';
 var KD=root.KD,U=root.UI,C=root.Calc,St=root.Store,h=U.h,R=KD.rec,f=R.f,hf=R.hf,date=R.date,note=R.note,id=R.id,register=R.register;
 register({sample:function(H){var titles=['展示用の布ポーチ','説明カードの台紙','お礼用の小さな巾着','木製の店頭札','教室の練習キット','委託店向けの見本セット'],steps=['計画','材料準備','制作中','検品','納品済'];return {makeJobs:Array.from({length:18},function(_,i){var s=steps[i%steps.length];return {title:'DEMO-J'+C.pad(i+1)+' '+titles[i%titles.length]+'（架空）',stage:s,cost:H.round(H.int(800,6000),100),due:H.day(H.int(-7,35)),done:s==='納品済',memo:H.pick(['架空例：必要な部材をリストと照合','架空例：見本1点で寸法を確認','架空例：納品前に数と仕上げを確認'])};})};},
 id:'make',title:'制作・在庫メモ',icon:'作',order:65,lead:'制作の工程・材料・納品を整理します。',tables:[{key:'makeJobs',title:'制作工程',fields:[f('title','作品・注文ID'),f('stage','工程','select',['計画','材料準備','制作中','検品','納品済']),f('cost','材料費','yen'),f('due','納期','date'),f('done','完了','check'),note()]}]});
})(this);
