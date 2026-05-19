<!-- file: docs/scraper-extension/element-picker.md -->

# ClipLayer Element Picker 技術仕様

Element Picker は **ClipLayer の単独最重要機能**。非エンジニアがコードを書かずに DOM 抽出を設定できる UX を実現する。本ドキュメントは picker の実装仕様を定義する。

---

## 1. UX の 3 段階

```
Stage 1: ROW         リスト行を 1 つクリック → 繰り返し要素を自動検出
Stage 2: ROW_CONFIRM 検出結果をハイライト表示 → ユーザー確認
Stage 3: FIELD       行内のフィールドを順次クリック・ラベル付け
```

各 stage で「戻る」「やり直す」を提供。途中保存もできる（draft profile）。

---

## 2. 起動と注入

### 2.1 起動トリガー
- Side Panel から「Profile 新規作成」→「ピックモード開始」
- background が `chrome.tabs.sendMessage(tabId, { type: "START_PICKER", draftId })`
- content script が picker module を dynamic import してオーバーレイを注入

### 2.2 オーバーレイの実装
- Shadow DOM で対象ページの CSS と完全分離
- `z-index: 2147483647`（最大値）で最前面
- `pointer-events: none` を基本に、操作 UI 部分だけ `pointer-events: auto`

```typescript
// src/content/picker/overlay.ts
export class PickerOverlay {
  private root: ShadowRoot;
  constructor() {
    const host = document.createElement("div");
    host.id = "__cliplayer_picker__";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    document.documentElement.appendChild(host);
    this.root = host.attachShadow({ mode: "closed" });
    this.root.innerHTML = TEMPLATE;
  }
  // highlight / panel / preview メソッド ...
}
```

---

## 3. Stage 1: ROW（リスト行の検出）

### 3.1 クリック捕捉
- `document.addEventListener("click", handler, { capture: true })`
- `preventDefault()` + `stopPropagation()` でページのクリックを無効化
- `mouseover` で要素ハイライト（hover プレビュー）

### 3.2 繰り返し要素検出アルゴリズム

クリックされた要素 `el` から親方向に辿り、**同構造の兄弟が 3 つ以上ある最も内側の要素** を探す。

```typescript
// src/content/picker/repeating.ts
export interface RowDetection {
  row: Element;
  allRows: Element[];
  rootSelector: string;
}

export function detectRepeatingRow(el: Element): RowDetection {
  let current: Element | null = el;
  while (current?.parentElement) {
    const parent = current.parentElement;
    const siblings = Array.from(parent.children).filter(
      (sib) =>
        sib.tagName === current!.tagName &&
        classSimilarity(sib, current!) > 0.7 &&
        structuralSimilarity(sib, current!) > 0.6,
    );
    if (siblings.length >= 3) {
      return {
        row: current,
        allRows: siblings as Element[],
        rootSelector: generateStableSelector(current, parent),
      };
    }
    current = parent;
  }
  // フォールバック: 単独要素として扱う
  return { row: el, allRows: [el], rootSelector: generateStableSelector(el) };
}

function classSimilarity(a: Element, b: Element): number {
  const ca = new Set(Array.from(a.classList));
  const cb = new Set(Array.from(b.classList));
  if (ca.size === 0 && cb.size === 0) return 1;
  const inter = [...ca].filter((c) => cb.has(c)).length;
  const union = new Set([...ca, ...cb]).size;
  return inter / union;
}

function structuralSimilarity(a: Element, b: Element): number {
  // 子要素の tagName 列を比較
  const sa = Array.from(a.children).map((c) => c.tagName).join(",");
  const sb = Array.from(b.children).map((c) => c.tagName).join(",");
  if (sa === sb) return 1;
  // levenshtein 距離ベースの類似度
  const len = Math.max(sa.length, sb.length);
  if (len === 0) return 1;
  return 1 - levenshtein(sa, sb) / len;
}
```

### 3.3 ハイライト
- 検出された全行を半透明ボーダーで強調
- 「N 件検出」のラベル
- 「もっと外側 / もっと内側 / やり直す」ボタン

### 3.4 「もっと外側」ロジック
ユーザーが「行」の認識を間違えた時の調整:
- 現在の `current` の親に切り替えて再検出
- 兄弟が 1 つに減ったら警告

```typescript
function expandRow(current: Element): RowDetection {
  if (!current.parentElement) return /* error */;
  return detectRepeatingRow(current.parentElement);
}
```

---

## 4. Stage 2: ROW_CONFIRM

検出結果を表示し、ユーザーに最終確認させる。

```
┌─ Picker ──────────────────────────────┐
│ Step 1 / 3: リスト行の指定             │
│                                         │
│ ✓ 12 件の繰り返し要素を検出           │
│                                         │
│ ハイライト表示中の要素で合っていますか？│
│                                         │
│ [ 合っている ]                          │
│ [ もっと外側 ] [ もっと内側 ]           │
│ [ やり直す ]                            │
└────────────────────────────────────────┘
```

---

## 5. Stage 3: FIELD（フィールド指定）

### 5.1 行内クリック制限
- フィールド指定中、クリック要素は **必ずいずれかの行内** である必要がある
- 行外をクリックしたら "リストの内側をクリックしてください" トースト

```typescript
function findOwningRow(clickedEl: Element, allRows: Element[]): Element | null {
  for (const row of allRows) {
    if (row.contains(clickedEl)) return row;
  }
  return null;
}
```

### 5.2 相対セレクタ生成
- 行ルートからの相対セレクタを生成
- フィールドセレクタが他の行でも正しく当たることを検証

```typescript
function generateRelativeSelector(row: Element, target: Element): string {
  // row 内での DOM path を計算
  // 優先: data-* → role → 安定 class → nth-of-type
  const path: string[] = [];
  let cur: Element | null = target;
  while (cur && cur !== row) {
    path.unshift(stableTokenFor(cur));
    cur = cur.parentElement;
  }
  return path.join(" > ");
}

function stableTokenFor(el: Element): string {
  // data-* (auto-generated を除外)
  const dataAttr = Array.from(el.attributes).find(
    (a) => a.name.startsWith("data-") &&
           !/^data-(react|v-|key|index|id|testid-)/.test(a.name),
  );
  if (dataAttr) return `[${dataAttr.name}="${CSS.escape(dataAttr.value)}"]`;

  // role
  const role = el.getAttribute("role");
  if (role) return `[role="${role}"]`;

  // 安定 class（auto-generated CSS class を除外）
  const tag = el.tagName.toLowerCase();
  const stableClasses = Array.from(el.classList).filter(
    (c) => !/-[a-z0-9]{5,}$/i.test(c) && !/^css-/.test(c),
  );
  if (stableClasses.length > 0) {
    return `${tag}.${stableClasses.map(CSS.escape).join(".")}`;
  }

  // fallback: tag + nth-of-type
  const nth = Array.from(el.parentElement?.children ?? [])
    .filter((c) => c.tagName === el.tagName)
    .indexOf(el) + 1;
  return `${tag}:nth-of-type(${nth})`;
}
```

### 5.3 フィールド型の自動推定
クリックされた要素から取得方法を推定する:

```typescript
function guessFieldType(el: Element): SelectorDef["type"] {
  if (el.tagName === "IMG") return "image-url";
  if (el.tagName === "A" && (el as HTMLAnchorElement).href) {
    // テキストか URL かをユーザーに確認
    return "text"; // デフォルトはテキスト・dialog で attr に切替可
  }
  if (el.tagName === "INPUT") return "attr"; // value 属性
  return "text";
}
```

### 5.4 フィールド入力ダイアログ

```
┌─ フィールド追加 ─────────────────────┐
│ サンプル値: "山田太郎"                │
│                                        │
│ ラベル: [ customer_name        ]       │
│                                        │
│ 取得方法:                              │
│  ● テキスト (推奨)                    │
│  ○ 属性: [ href ▼ ]                  │
│  ○ HTML 全体                         │
│                                        │
│ ☐ 必須フィールド（取得できない場合は警告）│
│                                        │
│ [ キャンセル ]  [ 追加 ]              │
└───────────────────────────────────────┘
```

---

## 6. リアルタイムプレビュー

フィールドが追加されるたびに、**全行から抽出して上位 5 件を表示**。

```typescript
function updatePreview(detection: RowDetection, fields: SelectorDef[]) {
  const preview = detection.allRows.slice(0, 5).map((row) => {
    const obj: Record<string, string> = {};
    for (const f of fields) {
      const el = row.querySelector(f.selector);
      if (!el) { obj[f.name] = "(取得不可)"; continue; }
      switch (f.type) {
        case "text": obj[f.name] = el.textContent?.trim() ?? ""; break;
        case "attr": obj[f.name] = el.getAttribute(f.attr!) ?? ""; break;
        case "html": obj[f.name] = el.innerHTML.slice(0, 100) + "..."; break;
        case "image-url":
          obj[f.name] = (el as HTMLImageElement).src ?? "";
          break;
      }
    }
    return obj;
  });
  overlay.renderPreview(preview);
}
```

プレビューが「取得不可」連発なら、セレクタが行ごとに不安定。ユーザーに「やり直し」を促す。

---

## 7. 保存

### 7.1 profile 構造

```typescript
interface DraftProfile {
  id: string;
  name: string;
  source: "user";
  matchPatterns: string[];
  pageType: "list" | "detail" | "table";
  selectors: SelectorDef[];        // [0] は __root__、以降が field
  pagination?: PaginationDef;
  delivery?: DeliveryConfig;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### 7.2 保存フロー
1. 「保存」ボタン押下
2. 配信先（Webhook / CSV / なし）を選択する dialog
3. 送信先のテスト送信オプション
4. IndexedDB に upsert
5. Side Panel に戻る
6. 即実行できる状態に

---

## 8. 編集モード

既存 profile を picker で開き直して編集できる。

- フィールド追加・削除・並び替え（ドラッグ&ドロップ）
- ラベルのリネーム
- セレクタの手動編集（高度な設定タブ内）
- profile name / URL pattern の変更

---

## 9. パワーユーザー向け機能（高度な設定タブ）

picker で生成されたセレクタを CSS / XPath で直接編集できる:

```
[ 高度な設定 ]
┌─────────────────────────────────────┐
│ Field: customer_name                 │
│ Selector type: ● CSS  ○ XPath        │
│ Selector: [ .order-row .name      ]  │
│ Test:    [ Run ]                     │
│ Match: 12 elements ✓                  │
│                                       │
│ Transform: ● none                    │
│            ○ regex extract: [ ___ ]  │
│            ○ trim                    │
│            ○ uppercase / lowercase   │
└─────────────────────────────────────┘
```

JSON エクスポート/インポートも提供。

---

## 10. 注意点と落とし穴

### 10.1 SPA / 遅延ロード
- ピック開始時に「ページの読み込み完了を待つ」ボタンを明示
- `MutationObserver` で DOM 変化を監視し、変化があれば「再検出する？」を提案

### 10.2 iframe 内コンテンツ
- 多くの管理画面（楽天 RMS など）は iframe 内に主要コンテンツ
- content script を `all_frames: true` で注入
- ピッカーは iframe 内でも動作するように同じ overlay コードを動かす
- 親フレームに postMessage で結果を集約

### 10.3 動的に生成されるクラス名
- Tailwind / CSS-in-JS 由来の `css-xyz123` のような hashed class は除外
- 安定 class 検出ロジックを継続的にチューニング

### 10.4 テーブル形式
- `<table>` 構造は特殊処理: `thead > th` をヘッダ、`tbody > tr` を行
- picker mode に「テーブル抽出モード」を別途用意し、行検出をスキップ

### 10.5 ページネーション
- 1 ページ抽出だけでなく次ページ遷移も picker で設定可能
- 「次へボタン」を picker でクリック指定 → `pagination.nextSelector` に保存
- 実行時に max ページ数まで自動巡回

```typescript
interface PaginationDef {
  type: "next-button" | "infinite-scroll" | "url-pattern";
  nextSelector?: string;        // next-button
  scrollDistance?: number;      // infinite-scroll
  urlTemplate?: string;         // url-pattern (e.g. "?page={n}")
  maxPages: number;
}
```

### 10.6 安定性テスト
- profile 作成完了時に、ページをスクロール・再描画して 2 回目の抽出を試す
- 2 回目の結果が 1 回目と一致しない場合は警告

### 10.7 セレクタの fallback
- 1 つの field に複数のセレクタを fallback として持てる構造を将来検討
- 主セレクタが当たらなければ次のセレクタを試す

---

## 11. 実装の優先順位

MVP 内での picker 実装は以下の順で進める:

| # | 内容 | 日数 |
|---|---|---|
| 1 | overlay UI (Shadow DOM) | 0.5 |
| 2 | hover / click 捕捉 | 0.5 |
| 3 | 繰り返し要素検出（基本）| 1.0 |
| 4 | 安定セレクタ生成 | 1.0 |
| 5 | フィールド指定 + ダイアログ | 0.5 |
| 6 | リアルタイムプレビュー | 0.5 |
| 7 | 保存・編集モード | 0.5 |

合計 **4 日**。ここを削るとプロダクト全体の価値が崩壊するので妥協しない。

---

## 12. 検証指標

picker の品質は以下で測る:

| 指標 | 目標値 |
|---|---|
| 主要 10 サイトでの行検出成功率 | > 90% |
| 安定セレクタ生成成功率（DOM 微変動に耐える） | > 80% |
| 平均 profile 作成時間（5 フィールド） | < 3 分 |
| 編集モードでの修正成功率 | > 95% |

初期は計測しづらいので、社内テスター + 初期ユーザー 10 名で観察評価。
