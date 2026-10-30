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
- **グルーピング**: `groupings[]`(対象項目 + グループ名 → 値の一覧 + 未割当のまとめ先)。プリセット JSON に含まれる。
- **進捗率**: `statusProgress`(ステータス名 → %)。未割当は 終了済み=100 / それ以外=done_ratio。
- **イナズマ線**: 基準日(既定=今日)の予定位置と実績位置(進捗率×期間)の差を行ごとに結ぶ。対象行の選び方は `inazuma/strategies.ts` の戦略で差し替え可能。現在は `leafOnly` のみ。戦略を足す場合は `STRATEGIES` に登録し、`InazumaStrategyId`(types)を増やす。
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
