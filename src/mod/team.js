/* こもれびデスク — チームの仕事。外部通信なし。サンプルはすべて架空。 */
(function(root){'use strict';
 var KD=root.KD,U=root.UI,C=root.Calc,St=root.Store,h=U.h,R=KD.rec,f=R.f,hf=R.hf,date=R.date,note=R.note,id=R.id,register=R.register;
 register({sample:function(H){var jobs=['見積書の単価と数量を照合','月次の請求を取引先別にまとめる','納品フォルダのファイル名を確認','経費の領収書を日付順に整理','打ち合わせ資料の図を差替え','バックアップから復元を試す','在庫数と棚の表示を照合','イベント用の案内文を校正','返事待ちの依頼を整理','共有資料の更新日を確認','来月の担当表を下書き','未入金の明細と入金履歴を照合','注文品の数量を検品','研修の資料を印刷','機材の貸出記録を確認','公開前の画像の権利を確認','作業の手順書を写真付きに更新','週末の進み具合をまとめる'];return {teamTasks:jobs.map(function(t,i){return {title:t+'（架空）',owner:'DEMO-W'+C.pad(i%5+1),due:H.day(H.int(-5,21)),done:i%5===0,memo:['架空例：下書きを担当へ渡して返事待ち','架空例：数量の食い違い1点を確認','架空例：チェック表で最後の照合','架空例：必要な資料はDEMO共有フォルダ'][i%4]};})};},
 id:'team',title:'チームの仕事',icon:'班',order:60,lead:'担当と期限を見える形に。端末間の自動同期はありません。',tables:[{key:'teamTasks',title:'担当・期限・確認',fields:[f('title','仕事'),f('owner','担当ID'),f('due','期限','date'),f('done','完了','check'),note()]}]});
})(this);
