# Redmine-Chart 仕様書

## 概要

My Redmine のチケット単票・チケット一覧画面に、ガントチャートを表示する。

---

## 対象ページと取得チケット

| ページ | 対象チケット |
|---|---|
| チケット単票（`/issues/:id`） | 表示中のチケットの子チケット |
| チケット一覧（`/issues`） | その一覧条件を満たすチケット（将来対応） |

---

## 技術スタック

| 項目 | 採用技術 |
|---|---|
| ビルドツール | Vite（ライブラリモード / iife形式） |
| UI | React + TypeScript |
| **ガントチャート** | **vis-timeline**（Frappe Gantt から変更） |
| セレクトボックス | react-select（グルーピングフィールド選択） |
| CSS処理 | vite-plugin-css-injected-by-js（CSSをJSに内包） |

### vis-timeline 採用理由
Frappe Gantt はグルーピング・折りたたみ機能を持たないため変更。
vis-timeline はグループと nestedGroups によるネスト折りたたみをネイティブサポートする。

---

## ガントチャート表示仕様

### デフォルト表示（グルーピングなし）

表示中チケット（例: #46043）の子チケットをフラットに表示する。
子チケット自身がさらに子を持つ場合は折りたたみ可能なネスト表示になる。
表示中チケット自体（#46043）はチャートに表示しない。

```
#46044 WFの通知機能    ████░░
#46045 BP申請機能          ████████
#46049 保守チケット完了              ← 日付なし → バーなし・行は表示
▼ #46050 子チケット（孫あり） ████   ← 自身の子を持つ場合は折りたたみ可能
     #46051 孫チケット        ████
```

### グルーピング指定時

ユーザーが選択したフィールドの値（**子チケット自身のフィールド値**）を最上位グループとし、
フィールド値 → 子チケット（→ 孫チケット） の階層で表示する。

```
▼ Saito Kiyotoshi（担当者 = Saito）
     #46051 問合せ管理...  ████
▼ Sueda Yoshihiro（担当者 = Sueda）
     #46044 WFの通知機能    ████░░
     #46045 BP申請機能          ████████
     ▼ #46050 孫ありチケット   ████
          #46052 孫チケット    ████
▼ （未設定）
     #46049 保守チケット完了
```

### 日付なしチケットの扱い

- 開始日・終了日が空のチケット → バーは描かない
- 行（グループ行）としては表示し、子チケットがあれば折りたたみ可能

---

## グルーピング UI 仕様

- グルーピングフィールドは react-select で選択（テキスト補完あり）
- 選択肢：すべてのフィールド（標準フィールド＋カスタムフィールド）
- デフォルト：グルーピングなし（子チケットのフラット表示）

---

## Redmine API 取得仕様

### チケット取得

**子チケット取得（1回目）**
```
GET /issues.json?parent_id={id}&limit=100
```

**孫チケット取得（2回目・並列）**
```
GET /issues.json?parent_id={child_id}&limit=100  （子チケット全件に対して並列実行）
```

- `parent_id`: チケット単票の場合は URL 中の ID
- `include` は使用しない
- ページネーション注意（デフォルト上限 25件 → `limit=100` で対応）

### 利用するフィールド

| フィールド | 用途 |
|---|---|
| `id`, `subject` | 行ラベル |
| `start_date` | バー開始日 |
| `due_date` | バー終了日 |
| `status`, `priority`, `assigned_to` 等 | グルーピング候補 |
| `custom_fields[]` | グルーピング候補（Current Charge 等） |

---

## Redmineへの埋め込み方

View Customize（管理 → 表示のカスタマイズ）で以下のように設定する。

**種別: JavaScript、挿入位置: 全ページのヘッダ**

```javascript
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    if (!document.querySelector('.issue.details')) return;

    var root = document.createElement('div');
    root.id = 'moca-react-chart-root';

    var issueTree = document.querySelector('#issue_tree');
    if (issueTree) {
      issueTree.insertAdjacentElement('afterend', root);
    } else {
      var content = document.querySelector('#content');
      if (!content) return;
      content.prepend(root);
    }

    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/gh/kysayo/redmine-chart@{コミットハッシュ}/dist/moca-react-chart.iife.js';
    document.head.appendChild(script);
  });
})();
```

**DOM 調査済み情報（misol-dev.cloud.redmine.jp）**
- `#content` — メインコンテンツコンテナ（存在確認済み）
- `#issue_tree` — 子チケットセクション（存在確認済み）
- `.issue.details` — チケット単票の識別セレクタ（存在確認済み）
- `DOMContentLoaded` でラップが必要（View Customize はヘッダで実行されるため）
