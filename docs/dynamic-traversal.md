<!-- file: docs/scraper-extension/dynamic-traversal.md -->

# ClipLayer 動的ページ巡回

リスト → 詳細ページを辿ってデータを網羅的に取得する設計。多くの業務 SaaS の主要ユースケースはリスト画面だけでは完結せず、各行の詳細ページに遷移してはじめて必要なデータが揃う。

本仕様は ClipLayer の最大の差別化要素のひとつ。UX・技術判断・課金との整合性を一体で設計する。

---

## 1. 想定ユースケース

| 業種 | リスト | 詳細 |
|---|---|---|
| EC | 注文一覧（注文 ID・金額） | 配送先・連絡先・商品明細 |
| 予約 SaaS | 当日予約一覧（時間・人数） | 顧客連絡先・メモ・履歴 |
| 不動産 | 物件一覧（タイトル・価格） | 写真・図面・問い合わせ履歴 |
| 求人 ATS | 応募者一覧（氏名・職種） | 履歴書・選考メモ |
| ナイト系 | キャスト一覧（名前・出勤） | プロフィール・実績・連絡先 |

共通構造: **N 件のリスト × 各件の詳細ページ遷移** が必要。

---

## 2. MV3 におけるバックグラウンド処理の現実

「タブを一切出さず・JS 実行あり・認証 Cookie あり」を**同時に満たす手段は MV3 に存在しない**。設計はこの制約を受け入れる。

| 手法 | タブ不可視 | JS 実行 | 認証 Cookie | SPA 動作 |
|---|:---:|:---:|:---:|:---:|
| `chrome.tabs.create({ active: false })` | × | ◯ | ◯ | ◯ |
| `chrome.windows.create({ state: "minimized" })` | △ | ◯ | ◯ | ◯ |
| `chrome.offscreen` API | ◯ | ◯ | △ | × 任意ナビ不可 |
| content script からの `fetch()` | ◯ | × | ◯ | × SSR のみ |
| background からの `fetch()` | ◯ | × | × | × |

採用方針: **SSR は fetch・SPA は非アクティブタブ** のハイブリッド。profile が renderMode を持って自動切替。

---

## 3. 採用戦略

### 3.1 navigation strategy 分岐

```
リスト抽出完了
   │
   │ 各 item の detailUrl
   ▼
strategy: auto
   │
   ├─ try fetch(url, { credentials: "include" })
   │    │
   │    ▼
   │  HTML パース → readinessProbe.selector ヒット?
   │    │
   │    ├─ YES → SSR 判定 → fetch HTML から抽出（タブ不要）
   │    │
   │    └─ NO  → SPA 判定 → 非アクティブタブで開く
   │
   └─ ProcessingView に「詳細 N/M 件目」表示
```

### 3.2 profile に持たせる宣言

```typescript
interface DetailNavigation {
  linkSelector: string;                  // リスト行内の詳細リンク要素
  strategy: "auto" | "fetch-html" | "background-tab" | "active-tab";
  renderMode?: "ssr" | "spa" | "unknown";
  readinessProbe?: {
    selector: string;                    // この要素が現れたら DOM 準備完了
    timeoutMs: number;
  };
  selectors: SelectorDef[];              // 詳細ページのフィールド
  profileRef?: string;                   // 詳細を別 profile に委譲する場合
  mergeStrategy: "flat" | "nested";
}
```

### 3.3 Element Picker での自動判定

picker で detail フィールド指定が完了した時点で:

1. 同じ URL を裏で `fetch()` する
2. HTML をパースして readinessProbe.selector を当てる
3. ヒットすれば `renderMode = "ssr"`・しなければ `"spa"`
4. 判定失敗時はデフォルトを `"spa"`（安全側）にする

ユーザーには「このサイトは取得時にタブが裏で開きます」と SPA 判定結果を明示する。

---

## 4. Profile 構造の拡張

`ProfileRow` に `detail` と `execution` を追加。

```typescript
interface ProfileRow {
  // 既存フィールド...
  detail?: DetailNavigation;
  execution?: {
    concurrency: number;
    rateLimit: { perSecond: number };
    maxItems?: number;
  };
}
```

### 4.1 detail profile の再利用

`profileRef` で別 profile を参照できる。同サイト内で「詳細ページ単体」と「リスト → 詳細」の両方で同じ抽出ロジックを使い回せる。

### 4.2 実行上の上限

対象サイト保護のため、プランに依存しない固定の上限を設ける。profile で個別に緩和可能な範囲は UI 上で明示する。

| 設定 | デフォルト | UI で変更可能な上限 |
|---|:---:|:---:|
| concurrency | 1 | 4 |
| rateLimit (req/sec) | 1 | 2 |
| maxItems / 実行 | 500 | 5000 |

これらは「対象サイトを壊さない」ためのガードであり、課金条件としては使わない。

---

## 5. 実行モデル

### 5.1 処理フロー

```
1. profile 検出 → 「取り込み実行」押下
2. 実行時間見積もり → ProcessingView or 軽量モード選択
3. リスト抽出: __root__ + フィールド + detail.linkSelector
4. detail がある場合:
   a. 各 item の detailUrl を queue 化
   b. concurrency 分の worker で並列処理
   c. rateLimit で全体スループット制御
   d. SSR/SPA を strategy に従って実行
   e. detail 抽出結果を item.fields にマージ
5. 全件完了 → 送信先に push
6. 完了画面に切替
```

### 5.2 失敗の扱い

| 失敗種別 | 動作 |
|---|---|
| リスト抽出失敗 | run = failed・detail には進まない |
| detail の navigation timeout | item は list 部分のみ保存・`flags.detailFailed = true` |
| detail の field 取得失敗 | 取得できた field のみ保存・残りは null |
| 半数以上 detail 失敗 | run = partial・ユーザー通知・送信前に確認 |
| キャンセル | 取得済み分のみ保存・部分送信は確認ダイアログ |

### 5.3 タブのライフサイクル（非アクティブタブ方式）

```typescript
async function extractDetail(url: string, probe: ReadinessProbe): Promise<Fields> {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForReadiness(tab.id, probe);
    return await sendToContent(tab.id, { type: "EXTRACT_DETAIL" });
  } finally {
    await chrome.tabs.remove(tab.id);
  }
}
```

`finally` での削除を確実にする。例外でタブが残ると UX が壊れる。

---

## 6. ProcessingView

実行中は Side Panel が ProcessingView モードに切り替わる。「働いている様子」自体が商品価値の一部なので妥協しない。GoFullPage 流の「専用画面で堂々と進める」フローを採用する。

### 6.1 構成

```
┌─ Side Panel: 実行中 ──────────────────────────┐
│ 楽天 RMS 注文一覧 を取り込み中                  │
│                                                 │
│ ████████████░░░░░░░░░░  8/24 (33%)            │
│ 残り推定 32 秒                                  │
│                                                 │
│ いま読んでいる: 注文 #1008 山田太郎 様          │
│   ↓ 詳細ページを開いています...                 │
│                                                 │
│ 取得済み（最新 3 件）:                          │
│ ┌────────────────────────────────────────────┐│
│ │ #1001 山田 ¥12,000 → 配送先・連絡先 取得済 ││
│ │ #1002 佐藤 ¥8,400  → 配送先・連絡先 取得済 ││
│ │ #1003 鈴木 ¥15,200 → 配送先・連絡先 取得済 ││
│ └────────────────────────────────────────────┘│
│                                                 │
│ [ ⏸ 一時停止 ]  [ ✕ 中止 ]                    │
└────────────────────────────────────────────────┘
```

### 6.2 必須要素

| 要素 | 役割 |
|---|---|
| 進捗バー + % | 完了度の即時把握 |
| 残り推定時間 | 待ち時間の見える化 |
| 「いま読んでいる: 〇〇」ライブ実況 | 具体物が動く感・最大の演出効果 |
| 取得済みプレビュー（最新数件） | 価値の蓄積が見える |
| 「詳細ページを開いています」ステータス | detail traversal の存在を可視化 |
| 一時停止・中止ボタン | コントロールできる安心感 |

ライブ実況は標準機能として全ユーザーに提供する。体感価値の中核であり、課金階層で出し分けるべき要素ではない。

### 6.3 完了画面

```
┌─ Side Panel: 完了 ────────────────────────────┐
│ ✓ 24 件取得しました（45 秒）                    │
│                                                 │
│ 送信先: Slack #orders → 送信済                  │
│ ローカル保存: 履歴 #2026-05-20-1234             │
│                                                 │
│ [ 履歴を見る ]  [ 閉じる ]                     │
└────────────────────────────────────────────────┘
```

部分成功時は失敗件数と理由を明示し、再実行ボタンを提供。

---

## 7. 軽量モードとの自動切替

すべての実行で ProcessingView を出すのは過剰。実行時間の見積もりで切り替える。

### 7.1 見積もり

```
estimatedSeconds = listItems × (
  hasDetail ? (detailFetchMs + 1 / rateLimit.perSecond) : 0.1
)
```

### 7.2 切替ルール

| 見積もり時間 | UI モード |
|---|---|
| 〜 5 秒 | バナー進捗のみ（Side Panel 上部に細い帯）・操作継続可 |
| 5 〜 60 秒 | ProcessingView 起動 |
| 60 秒 〜 | ProcessingView + 「完了したら通知」（chrome.notifications） |

設定で「常に ProcessingView」「常に軽量モード」のオーバーライドを高度な設定タブに用意。デフォルトは自動切替。

---

## 8. 「作業させない」レベル

L1 + L2 を採用。L3/L4 は採用しない。

| レベル | 内容 | 採用 |
|---|---|:---:|
| L1: Side Panel ロック | 実行中は他の profile 実行・picker 起動・設定変更を無効化 | ◯ |
| L2: 対象タブ離脱警告 | `beforeunload` で「実行中です。閉じますか？」 | ◯ |
| L3: 全画面モーダル | ブラウザ全体を覆う | × やり過ぎ |
| L4: 完了強制待機 | キャンセル不可 | × UX 殺し |

Chrome 拡張の制約上、ブラウザ全体の操作を物理的に止めることは不可。UI 上で「待つことを推奨する」明示で十分。

---

## 9. データのマージ方式

### 9.1 デフォルト: flat

```json
{
  "orderId": "1001",
  "customerName": "山田太郎",
  "amount": 12000,
  "shippingAddress": "東京都...",
  "phone": "090-...",
  "memo": "..."
}
```

list 由来と detail 由来を区別せず単一オブジェクトに統合。Webhook 受信側で何の追加対応も不要。**MVP は flat 一択**。

### 9.2 衝突時

list と detail で同名フィールドが衝突した場合、`detail.fieldName` で prefix。profile 設定で明示的にリネームも可。

### 9.3 nested オプション

```json
{
  "orderId": "1001",
  "customerName": "山田太郎",
  "detail": {
    "shippingAddress": "...",
    "phone": "..."
  }
}
```

複雑な構造を保ちたいユーザー向け。profile 設定で切替可能。

---

## 10. レート制限とマナー

対象サイト保護のため、ClipLayer 側で強制する制約:

| 項目 | 値 |
|---|---|
| デフォルト rate limit | 1 req/sec |
| concurrency 上限 | 4 |
| 最小 wait between requests | 200ms |
| timeout per detail | 30 秒 |
| max items per run | 5000 |

profile で個別に緩和は可能だが、最小値を下回る設定は UI から拒否。連続失敗時は自動でレートを下げる adaptive throttling を将来実装。

---

## 11. 段階導入計画

| Phase | 範囲 |
|---|---|
| MVP | list-only。`detail` は型として存在するが UI / 実装なし |
| Phase 8（新規） | 1 段の list → detail。非アクティブタブ・順次実行のみ。ProcessingView 実装 |
| Phase 9（新規） | SSR fetch 経路の追加・SPA/SSR 自動判定・picker での renderMode 確定 |
| Phase 10（新規） | 並列 worker・nested merge・adaptive throttling |
| 将来 | 多段巡回（list → detail → sub-detail）。明確な需要が出るまで YAGNI |

[roadmap.md](roadmap.md) に Phase 8-10 を追加する。

---

## 12. 既存ドキュメントへの影響

| ドキュメント | 変更 |
|---|---|
| [workflows.md](workflows.md) | Flow A/B の「実行」ステップを ProcessingView 起動 → 完了に書き換え。Flow E（list→detail）を新規追加 |
| [architecture.md](architecture.md) | コンポーネント図に Navigation Orchestrator + ProcessingView を追加 |
| [element-picker.md](element-picker.md) | Stage 4: DETAIL_LINK / Stage 5: DETAIL_FIELDS を追加 |
| [data-model.md](data-model.md) | `ProfileRow.detail` / `ProfileRow.execution` / `RunRow.progress` を追加 |
| [roadmap.md](roadmap.md) | Phase 8-10 を MVP 後フェーズに追加 |
| [subscription.md](subscription.md) | plan 別 concurrency / rateLimit / maxItems を §2 の表に追加 |

---

## 13. 検証指標

| 指標 | 目標 |
|---|---|
| SSR/SPA 判定の正答率 | > 95% |
| detail 巡回時の単件平均所要時間（SSR） | < 1 秒 |
| detail 巡回時の単件平均所要時間（SPA） | < 3 秒 |
| 24 件 detail 巡回時の体感価値（ユーザーテスト「ちゃんと働いている」評価）| ≥ 90% |
| 失敗時の部分結果保存成功率 | 100% |
| タブ残留事故率（finally で削除失敗）| 0% |
