# Redmine-Chart プロジェクト

## 概要

My Redmine（SaaS）のチケット単票とチケット一覧画面にガントチャートを表示するバンドルファイルを作成するプロジェクト。

My Redmineはサーバー側の設定が変更できないが、View Customize設定でJavaScriptを埋め込むことができる。
当プロジェクトで作成した1ファイルのバンドルを、View CustomizeのJavaScriptでインジェクションすることでグラフを表示する。この方式は別プロジェクト「Redmine-Graph」と同じ。

- チケット単票ページ：表示しているチケットの子チケットを対象とする

- チケット一覧ページ：そのチケット一覧の条件を満たすチケットを対象とする

## 技術スタック

| 項目       | 採用技術                                      |
| -------- | ----------------------------------------- |
| ビルドツール   | Vite（ライブラリモード / iife形式）                   |
| UI       | React  + TypeScript                       |
| ガントチャート  | vis-timeline                              |
| セレクトボックス | react-select（絞り込み条件のフィールド選択でテキスト補完）       |
| CSS処理    | vite-plugin-css-injected-by-js（CSSをJSに内包） |
| Lint     | ESLint（Viteデフォルト）                         |

## ディレクトリ構造

```
src/
  main.tsx              # React マウントエントリポイント（#moca-react-chart-root）
  App.tsx               # API 取得・グルーピング state・レイアウト
  components/
    GanttChart.tsx      # vis-timeline ラッパーコンポーネント
  utils/
    redmine.ts          # Redmine API 取得・vis-timeline 変換・グルーピング
    dummyData.ts        # （開発用ダミーデータ、未使用）
dist/
  moca-react-chart.iife.js   # ビルド成果物（CSS 込み1ファイル）
docs/
  spec.md
.github/workflows/
  deploy.yml            # 自動ビルド・デプロイ・jsDelivr パージ
```

## コマンド

```bash
# 開発サーバー起動
npm run dev

# プロダクションビルド
npm run build

# Lint
npm run lint
```

## ビルド成果物

`npm run build` を実行すると `dist/moca-react-chart.iife.js` が生成される。

- CSS込みの1ファイル（追加の `.css` ファイルは不要）
- iife形式のため `<script src="...">` で読み込むだけで即時実行される

## ホスティング

ビルド成果物は GitHub Pages にデプロイし、jsDelivr CDN 経由で配信している。

- **リポジトリ**: https://github.com/kysayo/redmine-chart
- **GitHub Pages**: https://kysayo.github.io/redmine-chart/
- **自動デプロイ**: `master` ブランチへの push で GitHub Actions が自動ビルド・デプロイ・jsDelivrキャッシュパージ
  （ワークフロー: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)）

### jsDelivr CDN URLのバージョン指定

| 用途             | URL形式         | 特徴                           |
| -------------- | ------------- | ---------------------------- |
| **開発中（頻繁に更新）** | `@{コミットハッシュ}` | キャッシュを確実に回避。例: `@ae594ce`    |
| 安定運用           | `@master`     | 常に最新だがCDNキャッシュ伝播に時間がかかる場合あり  |
| バージョン管理        | `@v1.0.0`     | タグ指定で永続キャッシュ（内容が変わらないと保証できる） |

**現在使用中のURL（View Customize設定値）**:

```
https://cdn.jsdelivr.net/gh/kysayo/redmine-chart@99ac3d0/dist/moca-react-chart.iife.js
```

# 
