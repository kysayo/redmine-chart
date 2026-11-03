# Redmine-Chart プロジェクト

## 概要

My Redmine(SaaS)のチケット一覧画面に、一覧クエリで絞り込まれたチケットの**カスタマイズ可能なガントチャート**を表示するバンドルを作るプロジェクト。
姉妹プロジェクト `E:\Projects\redmine-graph` と同じ方式(1ファイルのバンドルを View Customize の JavaScript から注入)。

## 技術スタック

| 項目 | 採用技術 |
| --- | --- |
| ビルド | Vite 7(ライブラリモード / iife) |
| UI | React 19 + TypeScript(strict。`erasableSyntaxOnly` のため enum は使えない) |
| セレクト | react-select |
| CSS | vite-plugin-css-injected-by-js(CSS を JS に内包)。クラスは `rc-` 接頭辞 + `#moca-react-chart-root` 配下に限定 |
| ガント描画 | 自前実装(HTML + SVG)。外部ガントライブラリは使わない |

## ディレクトリ構造

```
src/
├── main.tsx            # エントリ(#moca-react-chart-root にマウント)
├── App.tsx             # 折り畳み制御・遅延フェッチ・状態管理
├── types/index.ts      # 型(ChartSettings / TreeNode / TeamPreset など)
├── components/
│   ├── GanttChart.tsx          # 左の表 + 日付軸 + バー + 今日線 + イナズマ線
│   ├── ChartSettingsPanel.tsx  # 階層 / グルーピング / 列 / ステータス進捗率 / イナズマ / プリセット
│   └── ViewFilterBar.tsx       # アプリ内フィルタ(再取得なし)
└── utils/
    ├── redmineApi.ts   # 一覧クエリを引き継いで issues.json を全件取得
    ├── fields.ts       # 利用可能な列の取得、チケットからの値取得(標準列 + cf_N)
    ├── hierarchy.ts    # チケット → 階層ツリー(項目 / グルーピング / 子チケット)
    ├── progress.ts     # ステータス → 進捗率
    ├── filters.ts      # アプリ内フィルタの適用
    ├── inazuma/        # strategies.ts(戦略) と compute.ts(SVG用の線)
    ├── config.ts       # 既定値 / プリセットのマージ / data-team-presets 読込 / JSON出力
    ├── storage.ts      # localStorage(redmine-chart:settings:{projectId})
    ├── dateUtils.ts    # 日付は day number(整数)で扱う
    └── mockIssues.ts   # 開発専用ダミー(本番バンドルには入らない)
```

## コマンド

```bash
npm run dev     # localhost:5173。Redmine に繋がらないため、ダミーデータで動く
npm run build   # tsc -b && vite build → dist/moca-react-chart.iife.js
npm run lint
```

## 設計メモ

- **取得**: 一覧ページの URL クエリ(`f[]` / `query_id` 等)をそのまま `issues.json` に渡す。`status_id` は上書きしない(一覧と同じ範囲)。`limit=100` でページング。
- **フィールド**: キーは Redmine の列名(`status`, `assigned_to`, `cf_N` など)に統一。列候補は一覧ページの `#available_c` / `#selected_c` から取得。階層・列・フィルタ共通。
- **階層**: `levels` の各要素が「項目(+任意でグルーピング)」か「子チケット(parent_id の入れ子)」。「子チケット」より下の階層は無視。
- **カスタムフィールドの id → 表示名**: ユーザー型・バージョン型・キー/値リスト型のカスタムフィールドは、チケット API では id が返る。`utils/valueLabels.ts` が、一覧ページの絞り込み用の選択肢(Redmine 標準・管理者権限不要)から名前を引く。選択肢が少ないものは `availableFilters[cf_N].values` の `[名前, id]` を同期で登録し、`remote: true` のものは `/queries/filter?name=cf_N` を、使われている項目だけ取得する。変換は `getFieldValues`(fields.ts)で行うので、列・階層・グルーピング・絞り込みのすべてが名前を使う。名前=値の普通のリストや「自分(me)」は対象外。選択肢に出てこない値(無効化されたユーザーなど)は id のまま。
- **グルーピング**: `groupings[]`(対象項目 + グループ名 → 値の一覧 + 未割当のまとめ先)。プリセット JSON に含まれる。
- **グルーピングの CSV 取り込み**: 設定画面の「CSV から取り込み」。1列目=項目の値、2列目以降=グルーピング(ヘッダー=名前、セル=グループ名)。UTF-8 / Shift-JIS 自動判別。列ごとに1グルーピングを作り、同名・同項目は置き換える。未登録の値は「(未分類)」に入る。取り込み後の階層(どの順でグルーピングを使うか、子チケットをどこに混ぜるか)は手動で設定する。処理は `utils/csvGrouping.ts` と `components/GroupingCsvImport.tsx`。
- **進捗率の設定に出るステータス**: ページに埋め込まれた `availableFilters.status_id.values` + `/queries/filter?name=status_id`(サブプロジェクトのステータスを含む。`fetchStatusNamesFromFilter`)+ 実データのステータス + 設定済みのもの。トラッカーごとのワークフロー(使えるステータス)は REST API では取れない(`/trackers.json` は `default_status` のみ)。
- **進捗率**: `statusProgress`(ステータス名 → %)。未割当は ステータスが終了系(`status.is_closed`)=100 / それ以外=0。チケットの done_ratio は使わず、`closed_on` も使わない(再オープンしても残るため)。
- **イナズマ線**: 基準日(既定=今日)の予定位置と実績位置(進捗率×期間)の差を行ごとに結ぶ。対象行の選び方は `inazuma/strategies.ts` の戦略で差し替え可能。現在は `leafOnly` のみ。戦略を足す場合は `STRATEGIES` に登録し、`InazumaStrategyId`(types)を増やす。
- **列**: `columns[]`(キー・幅px・折り返し・表示切替グループ)、`nameColumn`(「チケット」列の幅・折り返し)、`freezeAt`(固定する範囲の右端の列キー。`''`=チケット列のみ、未設定=全列固定)。旧形式(キーの文字列の配列)は `normalizeColumns` で読み替える。列幅は設定の値のみ(マウスで変えられるようにはしていない。個人ごとに幅が変わるのを避けるため)。
- **表示切替グループ**: 同じ数字の列は、見出しの＋/－で同時に表示・非表示。畳んだ状態は個人の表示状態で、設定には保存しない。畳むと先頭の列の位置に＋ボタンだけの細い列が残る。
- **ラベル行と罫線(Excel の入れ子グループ風)**: グループ行は常に「ラベル行」。子を持つチケットは `labelRows.parentAsLabel` でラベル扱いにできる(オフ=バー付きのチケット行)。ラベル行は階層ごとの色(`labelColors`、ラベルの入れ子の深さ順)で塗り、列は出さず右端まで同じ色にする。下の階層の行が続く間、左端に祖先の色帯(`GanttRow.labelDepth` 本、1本 20px)が縦につながる。チケットの名前列の幅は「色帯 + 名前 = 設定の幅」なので、列の位置は揃う。ラベル行のバーは `labelRows.showBar`、イナズマ線は `inazuma.includeLabels` で出し分ける(ラベル行の進捗は配下リーフの平均)。罫線: 列の間の縦線=濃い実線、ラベルの範囲の境(ラベル行の上・直後・範囲を抜けた行の上)=濃い実線、同じグループ内のチケット間=薄い破線。種類の判定は `GanttChart.tsx` の `topKinds`。行の上の罫線は色帯(`.rc-band`)には引かず、その右の名前・列の部分(`.rc-cell` / `.rc-labelcell` / `.rc-lscroll`)にだけ引く(App.css の `rc-top-dark` / `rc-top-dash`)ので、色帯は縦に途切れずつながる。タイムライン側では、土日の網掛けより上にラベル行の色を描く(ラベル行は土日でもラベルの色)。行の色ルール(`rowColors`)はラベル行には適用しない。
- **行の高さ**: 折り返しのある行は高くなる。`GanttChart.tsx` が各行を `ResizeObserver` で実測し(`heights`)、バー・イナズマ線・行の色・追従行の位置は行ごとの累積高さ(`rowTops`)から求める。行の高さを固定値と仮定しないこと。
- **左右スクロールボタン**: ＜＞はチャートの見えている範囲の縦中央に出る(位置はスクロールのたびに ref 経由で更新)。端まで来ると隠れる。
- **行の色**: `rowColors[]`(ルール: 完了扱い or ステータス名の複数指定 + 背景色 + 任意の文字色)。上から順に最初に合致したものを適用。「完了扱い」はステータス名ではなく `status.is_closed` で判定する(Redmine が返さない版では合致しない)。判定は `utils/rowStyle.ts`。
- **タスクの終了日**: `endDate.field`(日付項目。空=期日 due_date)がバーの右端。無ければ開始日で代用。`endDate.highlightMissing` で、終了日が無い行を赤にする(行の色ルールが優先)。日付のカスタムフィールドは `availableFilters` の型から判定する。
- **表示範囲**: `range`(`auto`=チケットの日付に合わせる / `relative`=今日の何日前〜何日後 / `fixed`=開始日〜終了日、空欄の側は auto)。範囲外のバーは見切れる。
- **規模**: 数百件想定のため仮想スクロールなし。重ければ追加する。

## 設定とプリセット

- 設定パネルの変更は localStorage に保存される。
- 「Preset JSON を出力」で `{ name, settings }` を出力 → View Customize の `data-team-presets` に `[ ... ]` で囲んで貼ると、チームプリセットとして全員が使える。
- 保存済み設定が無い初回は、先頭のチームプリセットが自動適用される。

## Redmine への埋め込み(View Customize)

**種別: JavaScript、挿入位置: 全ページのヘッダ**。`script.src` はデプロイ後の URL に置き換える。

```javascript
(function() {
  function insertChart() {
    if (document.getElementById('chart-section')) return;

    var optionsFieldset = document.querySelector('fieldset#options.collapsible');
    if (!optionsFieldset) return;

    var fieldset = document.createElement('fieldset');
    fieldset.className = 'collapsible';
    fieldset.id = 'chart-section';

    var legend = document.createElement('legend');
    legend.setAttribute('onclick', 'toggleFieldset(this);');
    legend.className = 'icon icon-collapsed';
    legend.textContent = 'Chart';

    var root = document.createElement('div');
    root.id = 'moca-react-chart-root';
    root.setAttribute('data-api-key', (ViewCustomize && ViewCustomize.context && ViewCustomize.context.user && ViewCustomize.context.user.apiKey) || '');
    // チームプリセット(設定パネルの「Preset JSON を出力」の内容を [ ] で囲んで貼る)
    // root.setAttribute('data-team-presets', JSON.stringify([ { name: "...", settings: { ... } } ]));
    root.classList.add('hidden');

    fieldset.appendChild(legend);
    fieldset.appendChild(root);
    fieldset.classList.add('collapsed');
    optionsFieldset.parentNode.insertBefore(fieldset, optionsFieldset.nextSibling);

    var script = document.createElement('script');
    script.src = 'https://{デプロイID}.redmine-chart.pages.dev/moca-react-chart.iife.js';
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertChart);
  } else {
    insertChart();
  }
})();
```

## ホスティング・デプロイ

Cloudflare Pages(Direct Upload)で配信。GitHub Actions は使わない。`dist/` は git 管理外。

- **リポジトリ**: https://github.com/kysayo/redmine-chart(公開)
- **Cloudflare Pages プロジェクト**: `redmine-chart`
- **本番URL(常に最新)**: `https://redmine-chart.pages.dev/moca-react-chart.iife.js`
- **デプロイごとの固有URL**: `https://{デプロイID}.redmine-chart.pages.dev/moca-react-chart.iife.js`(View Customize にはこちらを貼る)

```bash
npm run build
npx wrangler pages deploy dist/ --project-name redmine-chart --commit-dirty=true --commit-message='deploy'
# 出力された固有URLを View Customize の script.src に貼り替える
```

- 初回のみ `npx wrangler login`(トークン期限切れのときも)。日本語のコミットメッセージだと wrangler がエラーになるため `--commit-message` が必要。
- プロジェクト作成時のみ、新しい wrangler が Workers に誘導するため `--force` を使った。プロジェクト作成済みの今は不要。
