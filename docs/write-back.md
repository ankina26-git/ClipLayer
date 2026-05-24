<!-- file: docs/scraper-extension/write-back.md -->

# ClipLayer 書き込み（Write-Back）とシステム間転記

ClipLayer の既存機能は「読む（抽出）→ 保存 → 外部送信」の一方向だった。本仕様は逆方向、すなわち **保存済みデータをユーザーが指定した別ページのフォームへ入力（書き込み）する** 機能を定義する。

中心ユースケースは **システム間の転記**: サイト A の一覧から抽出したデータを、サイト B（別の管理画面・登録フォーム）へ自動入力すること。さらに、取り込み・書き込みの双方を **タスク化** し、複数ソースの **一斉取り込み** と複数レコードの **一斉書き込み** をまとめて実行できるようにする。

> **重要原則**: 書き込みは抽出と異なり **不可逆** である。誤入力・二重登録は対象サイト側の実データを壊す。本仕様の設計判断は「速さ」より「事故を起こさないこと」を常に優先する。

---

## 1. 解決するユースケース

| 元（Source / 抽出） | 先（Target / 書き込み） | 転記内容 |
|---|---|---|
| EC モール A の注文一覧 | 自社の受注管理画面 | 注文番号・宛先・商品を登録 |
| 予約 SaaS の当日予約 | 別の顧客管理 CRM | 顧客名・連絡先・来店日時を新規登録 |
| 旧システムの台帳 | 新システムの入力フォーム | 移行レコードを一括投入 |
| スプレッドシート / CSV | 各種 SaaS の登録フォーム | 行ごとにフォーム送信 |
| 仕入先サイトの商品情報 | 自社 EC の商品登録画面 | 商品名・価格・説明を流し込み |

共通構造: **N 件のデータ × 各件を Target フォームへ入力して送信**。リスト → 詳細の「読み」を拡張した [dynamic-traversal.md](dynamic-traversal.md) と対をなす「書き」の設計である。

---

## 2. 用語と全体モデル

```
[Source]            [Mapping]              [Target]
抽出 Profile     →   フィールド対応付け  →   Write Profile
(既存)               source → target          (新規)
   │                      │                      │
   ▼                      ▼                      ▼
 Items(fields[])    {customer_name →        対象フォームの
                      #name 欄, ...}          入力欄に setValue
                                                 + submit

        すべて「Task」として queue 化し、
        Job がそれらを束ねて一斉実行する
```

| 用語 | 意味 |
|---|---|
| **Source** | データの供給元。抽出 Profile の実行結果（Items）、または取り込み済み履歴・CSV |
| **Target** | 書き込み先のページ。Write Profile で定義 |
| **Write Profile** | 「どのページの・どの入力欄に・どの値を入れ・どう送信するか」の宣言（[§4](#4-write-profile-データ構造)） |
| **Mapping** | Source の field 名 → Write Profile の入力欄への対応付け（[§5](#5-フィールドマッピング)） |
| **Task** | 実行の最小単位。種別は `import`（取り込み）または `write`（書き込み） |
| **Job** | 複数 Task を束ねた実行単位。転記パイプライン（import → write）や一斉実行を表す（[§9](#9-タスク化とジョブモデル一斉取り込み一斉書き込み)） |
| **一斉取り込み** | 複数の抽出 Profile / 複数ページを 1 Job でまとめて実行 |
| **一斉書き込み** | 1 つの Write Profile に対し N レコードを順次入力・送信 |

---

## 3. 書き込みの本質的リスクと安全設計

書き込み機能を持つ以上、ここが仕様の中核。全フローはこの原則に従う。

### 3.1 不可逆性への対処（必須ガード）

| ガード | 内容 | 既定 |
|---|---|---|
| **ドライラン** | 入力欄に値を埋めるが **submit しない**。プレビューだけ | 初回は強制 |
| **1 件だけ試行** | 一斉書き込み前に最初の 1 レコードのみ実行し結果を確認 | 推奨・既定 ON |
| **送信前確認** | 入力済みフォームのスクリーンショット風プレビュー + 値一覧を見せて承認 | 単発は必須 |
| **冪等キー** | レコードごとに `idempotencyKey` を持ち、成功済みは再送しない（[§11](#11-失敗冪等性再実行)） | 常時 |
| **件数上限** | 1 Job あたりの書き込み件数に上限（[§13](#13-レート制限とマナー)） | あり |
| **キルスイッチ** | 実行中いつでも中止。中止後は「ここまで N 件送信済み」を明示 | 常時 |

### 3.2 「送ってしまった」を防ぐ UX

- 抽出（読み）は失敗してもデータが増えるだけだが、書き込みは **対象サイトの状態を変える**。よって「とりあえず実行」を絶対に作らない。
- 一斉書き込みは **必ず 2 段階**: ①ドライラン/1 件試行 → ②残り全件。①を飛ばす導線は作らない。
- 送信ボタンの自動クリックは Write Profile に明示設定があるときのみ。既定は「値を埋めて止める（人が最終 submit）」も選べる（§4.4 `submitMode`）。

### 3.3 権限と同意

- 書き込みは **ユーザー自身がアクセス権を持つフォームへの、ユーザー自身による入力の自動化** に限定する。
- 対象ドメインごとに `optional_host_permissions` を取得し、初回書き込み時に「このサイトへ自動入力します」と明示同意を取る（[§17](#17-法務規約chrome-web-store)）。

---

## 4. Write Profile データ構造

抽出の `ProfileRow` と対になる、書き込み専用の Profile を新設する。

```typescript
export type WriteInputType =
  | "text"          // input[type=text/email/number/tel...] / 一般入力
  | "textarea"
  | "select"        // <select>
  | "checkbox"
  | "radio"
  | "contenteditable"
  | "date"          // input[type=date] 等・正規化して投入
  | "file";         // 取り込み済み画像 Blob を File 化して投入

export type SubmitMode =
  | "auto"          // 値投入後に submit セレクタを自動クリック
  | "stop-before-submit"  // 値だけ埋めて人が最終 submit（安全側の既定）
  | "manual-each";  // 1 件ごとに「送信する/スキップ」を人が押す

export interface WriteFieldDef {
  name: string;                 // Source の field 名と対応（Mapping の左辺）
  selector: string;             // 入力欄のセレクタ（form ルートからの相対）
  selectorType: "css" | "xpath";
  inputType: WriteInputType;
  required: boolean;            // 値が無い/欄が無い場合の扱い（§11.2）
  // select / radio / checkbox 用の値マッチ方法
  optionMatch?: "by-value" | "by-label" | "by-index";
  transform?: TransformDef;     // 既存の trim / regex / case を流用
  constant?: string;            // Source に依らず固定値を入れる（例: 区分=「新規」）
  fileFromImageField?: string;  // inputType=file のとき、Source の画像 field 名
}

export interface SubmitDef {
  mode: SubmitMode;
  submitSelector?: string;      // auto / manual-each のとき押すボタン
  // 送信後に「成功したか」を判定するプローブ
  successProbe?: {
    selector: string;           // 例: ".toast-success" / "#complete-message"
    timeoutMs: number;
  };
  errorProbe?: {
    selector: string;           // 例: ".field-error" → 失敗とみなす
  };
}

export interface RecordAdvanceDef {
  // 1 レコード書き終えて次の空フォームへ戻る方法（一斉書き込み用・§9.3）
  type: "reload-url" | "click-new" | "stay";
  urlTemplate?: string;         // reload-url: 新規入力ページ URL
  newButtonSelector?: string;   // click-new: 「新規作成」ボタン
  readinessProbe?: { selector: string; timeoutMs: number };
}

export interface WriteProfileRow {
  id: string;
  name: string;
  description?: string;
  source: "user" | "official";
  serverId?: string;
  version: number;
  signature?: string;           // 公式のみ・Ed25519
  matchPatterns: string[];      // 書き込み先 URL パターン
  formScopeSelector?: string;   // 対象 <form> / コンテナ（省略時は document）
  fields: WriteFieldDef[];
  submit: SubmitDef;
  recordAdvance: RecordAdvanceDef;
  tabStrategy: "active-tab" | "background-tab";  // §8
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### 4.1 抽出 Profile との違い

| 観点 | 抽出 `SelectorDef` | 書き込み `WriteFieldDef` |
|---|---|---|
| 方向 | DOM → 値 を読む | 値 → DOM へ書く |
| 取得/投入方法 | `text / attr / html / image-url` | `text / select / checkbox / radio / file` ほか |
| 副作用 | なし | フォーム状態・送信で対象サイトが変わる |
| 検証 | 取れたか | 入ったか + 送信が成功したか（success/errorProbe） |

---

## 5. フィールドマッピング

Source（抽出結果）の field 名を、Write Profile の `WriteFieldDef.name` に対応付ける。

```typescript
export interface FieldMapping {
  writeField: string;           // WriteFieldDef.name
  sourceField?: string;         // Source の field 名（例: "customer_name"）
  constant?: string;            // sourceField の代わりに固定値
  transform?: TransformDef;     // マッピング段でも変換可
  onMissing: "skip-record" | "empty" | "fail";  // Source 値が無いとき
}

export interface TransferMappingSet {
  id: string;
  sourceProfileId?: string;     // 抽出 Profile（履歴から流す場合）
  sourceKind: "run" | "csv" | "manual";
  writeProfileId: string;
  mappings: FieldMapping[];
  keyField: string;             // 冪等キー生成に使う Source field（§11.1）
}
```

### 5.1 マッピング UI（GUI 完結）

```
┌─ 転記マッピング ───────────────────────────────┐
│ 元データ: 楽天 RMS 注文一覧（24 件）            │
│ 書き込み先: 自社 受注登録フォーム               │
│                                                  │
│   元の項目            →   入力先の欄             │
│   ─────────────         ──────────────          │
│   order_id          →   [ 注文番号 ▼ ]          │
│   customer_name     →   [ お客様名 ▼ ]          │
│   amount            →   [ 金額 ▼ ]              │
│   (固定値)「Web」    →   [ 受注区分 ▼ ]          │
│   (対応なし)         →   [ 備考 ▼ ]              │
│                                                  │
│ 値が空のとき: ● この行をスキップ ○ 空欄で送信  │
│ 重複キー: order_id（同じ注文は二重登録しない）  │
│                                                  │
│ [ ドライラン ]  [ 最初の 1 件で試す ]            │
└─────────────────────────────────────────────────┘
```

- ドロップダウンは Write Profile の `fields[].name` から自動生成。技術語（セレクタ）は高度な設定タブに隠す（既存方針踏襲）。

---

## 6. Write Picker（書き込み用 Element Picker）

抽出の Element Picker（[element-picker.md](element-picker.md)）と対称の picker を追加する。「読む要素」ではなく「書き込む入力欄」をクリックして指定する。

### 6.1 ステージ

```
Stage W1: FORM_SCOPE   対象フォーム/コンテナを 1 クリックで指定（任意）
Stage W2: WRITE_FIELD  入力欄をクリック → inputType 自動判定 → ラベル付け
Stage W3: SUBMIT       送信ボタンを指定 + 成功/失敗プローブを指定
Stage W4: ADVANCE      （一斉用）次の空フォームへ戻る方法を指定
```

### 6.2 入力欄クリック時の自動判定

```typescript
function guessInputType(el: Element): WriteInputType {
  const tag = el.tagName;
  if (tag === "SELECT") return "select";
  if (tag === "TEXTAREA") return "textarea";
  if (tag === "INPUT") {
    const t = (el as HTMLInputElement).type;
    if (t === "checkbox") return "checkbox";
    if (t === "radio") return "radio";
    if (t === "date" || t === "datetime-local") return "date";
    if (t === "file") return "file";
    return "text";
  }
  if ((el as HTMLElement).isContentEditable) return "contenteditable";
  return "text";
}
```

### 6.3 安全確認の上乗せ

- Write Picker 中は対象ページのフォームに**実際の値を入れない**（サンプル値を Shadow DOM のプレビュー側にだけ表示）。誤送信を picker 段で起こさないため。
- セレクタ生成ロジックは抽出側の `stableTokenFor`（element-picker.md §5.2）を再利用。`name` 属性は入力欄で安定しやすいため優先度を上げる（`[name="..."]`）。

---

## 7. content script 書き込みエンジン

値をセットするだけでは React / Vue 等の制御コンポーネントは状態を更新しない。**ネイティブ setter + イベント発火** が必須。

```typescript
// src/extension/content/writer.ts
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);                       // React の value tracker を回避
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function writeField(root: ParentNode, def: WriteFieldDef, value: string) {
  const el = root.querySelector(def.selector);
  if (!el) {
    if (def.required) throw new WriteError("FIELD_NOT_FOUND", def.name);
    return;
  }
  switch (def.inputType) {
    case "text":
    case "textarea":
    case "date":
      setNativeValue(el as HTMLInputElement, value);
      break;
    case "select": {
      const sel = el as HTMLSelectElement;
      const opt = matchOption(sel, value, def.optionMatch ?? "by-label");
      if (!opt && def.required) throw new WriteError("OPTION_NOT_FOUND", def.name);
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
      break;
    }
    case "checkbox": {
      const cb = el as HTMLInputElement;
      const want = /^(1|true|on|yes|はい)$/i.test(value);
      if (cb.checked !== want) cb.click();          // click でフレームワークの onChange を発火
      break;
    }
    case "radio":
      (el as HTMLInputElement).click();
      break;
    case "contenteditable":
      (el as HTMLElement).textContent = value;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      break;
    case "file":
      await setFileInput(el as HTMLInputElement, def.fileFromImageField!, value);
      break;
  }
}
```

### 7.1 file 入力（取り込み済み画像の投入）

```typescript
async function setFileInput(el: HTMLInputElement, imageField: string, imageId: string) {
  const blob = await getImageBlob(imageId);         // IndexedDB から
  const file = new File([blob], filenameFor(imageId), { type: blob.type });
  const dt = new DataTransfer();
  dt.items.add(file);
  el.files = dt.files;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
```

### 7.2 注意点

- **遅延描画**: 入力欄が後から現れる SPA は `readinessProbe` で待つ。
- **依存フィールド**: 「都道府県を選ぶと市区町村の選択肢が変わる」型は、`fields` の順序を保証し、`select` 後に次フィールドの出現を待つ。
- **マスク/フォーマット入力**: 電話番号の自動ハイフン等は `input` イベント後の正規化を確認。失敗時は transform で整形してから投入。
- **iframe**: 抽出と同様 `all_frames: true`。書き込み先が iframe 内のときは所有フレームで実行。

---

## 8. MV3 実行モデル（タブ戦略）

[dynamic-traversal.md §2](dynamic-traversal.md) と同じ MV3 制約に従う。ただし書き込みは要件が厳しい。

| 要件 | 理由 |
|---|---|
| JS 実行が必須 | 制御コンポーネント・バリデーション・CSRF トークン生成 |
| 認証 Cookie が必須 | ログイン後フォーム |
| 実 DOM が必須 | `fetch` での擬似 POST はサイトの JS 検証・hidden token を再現できず破綻しやすい |

→ **書き込みは実タブで行う。`fetch` による直接 POST は採用しない**（事故と検知回避の懸念の両面で不採用）。

| 戦略 | 用途 |
|---|---|
| `active-tab` | 単発・ユーザーが目で見ながら（既定で安全） |
| `background-tab`（非アクティブタブ）| 一斉書き込みで N 件を順次処理（[dynamic-traversal.md §5.3](dynamic-traversal.md) のタブライフサイクルを流用・`finally` で必ず close）|

`offscreen` / background `fetch` は任意ナビ・Cookie の制約で書き込みには使えない。

---

## 9. タスク化とジョブモデル（一斉取り込み・一斉書き込み）

取り込みも書き込みも、すべて **Task** として queue に積み、**Job** が束ねる。これにより「一斉」と「転記パイプライン」を同一機構で表現する。

### 9.1 データ構造

```typescript
export type TaskKind = "import" | "write";
export type TaskStatus =
  | "queued" | "running" | "success" | "partial" | "failed" | "skipped" | "canceled";

export interface JobRow {
  id: string;
  name: string;
  kind: "batch-import" | "batch-write" | "transfer";  // transfer = import→write 連結
  status: TaskStatus;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  taskIds: string[];            // 実行順
  // transfer のときの橋渡し
  mappingId?: string;           // TransferMappingSet
  // 集計
  totalTasks: number;
  doneTasks: number;
  totalRecords: number;         // 書き込み Job の総レコード数
  writtenRecords: number;       // 送信成功した件数
  triggeredBy: "manual" | "schedule";
}

export interface TaskRow {
  id: string;
  jobId: string;
  kind: TaskKind;
  status: TaskStatus;
  // import: 対象 profile / write: 対象 write profile
  profileId?: string;
  writeProfileId?: string;
  targetUrl?: string;
  // 書き込みの 1 レコード（一斉書き込みは N task ではなく 1 task 内で N レコードを回す）
  recordCount: number;
  recordCursor: number;         // 何件目まで完了したか（再開用）
  attempt: number;
  errorSummary?: string;
  startedAt: number | null;
  finishedAt: number | null;
}
```

> 設計判断: 一斉書き込みの N レコードを N 個の Task にすると queue が膨れる。**1 write Task の内部で N レコードをループ**し、`recordCursor` で進捗・再開を管理する。Task は「ソース単位 / フォーム単位」の粒度に保つ。

### 9.2 一斉取り込み（batch-import）

```
Job(batch-import)
  ├─ Task(import, profile=楽天RMS注文)
  ├─ Task(import, profile=Amazon在庫)
  └─ Task(import, profile=自社予約一覧)
```

- 各 import Task は既存の抽出パイプラインをそのまま起動（[dynamic-traversal.md](dynamic-traversal.md) の list→detail もここで動く）。
- 既定 `concurrency = 1`（対象サイト保護）。読み取りのみなので将来並列化の余地あり。
- 結果はそれぞれ Run/Items として保存。後続の転記 Job の Source になり得る。

### 9.3 一斉書き込み（batch-write）

```
Task(write, writeProfile=自社受注登録, recordCount=24)
  for each record (cursor 0..23):
    1. recordAdvance で空フォームを用意（reload-url / click-new）
    2. readinessProbe 待ち
    3. fields をマッピングに従って投入（§7）
    4. submitMode に従う:
         stop-before-submit → プレビュー記録のみ（ドライラン相当）
         manual-each        → ユーザーが「送信/スキップ」を押す
         auto               → submitSelector クリック
    5. successProbe / errorProbe で判定
    6. 成功 → idempotencyKey を記録（§11.1）/ 失敗 → リトライ方針へ
    7. recordCursor++（中断しても次回ここから再開）
```

- **concurrency は常に 1**。書き込みの並列は二重登録・競合の温床なので許可しない。
- レコード間に `minIntervalMs`（既定 1 件/秒以上の間隔）。

### 9.4 転記パイプライン（transfer = import → write）

中心ユースケース。1 Job 内で「読み」と「書き」を連結する。

```
Job(transfer)
  ├─ Task(import, profile=A)            → Items 生成
  │        │  mappingId で対応付け
  │        ▼
  └─ Task(write, writeProfile=B, source=直前importのItems)
```

- import 完了 → mapping 適用 → write Task に Source を引き渡す。
- 安全のため transfer でも write Task 開始前に「1 件試行 → 残り」の 2 段は維持。

---

## 10. 実行フロー（システム間転記の通し）

```
1. ユーザーが Job を構成
   - Source: 抽出 Profile A（または取り込み履歴 / CSV）
   - Target: Write Profile B
   - Mapping: A の項目 → B の入力欄
2. 「ドライラン」: B のフォームに最初の数件を埋めて見せる（submit しない）
3. ユーザーが内容を確認 → 「最初の 1 件だけ送信」
4. 1 件成功（successProbe 確認）→ 結果を提示
5. 「残り N-1 件を実行」承認
6. background が write Task を起動（background-tab・順次・rate limited）
7. ProcessingView で「いま N 件目を登録中」を実況（§12）
8. 完了 → 成功 M 件 / 失敗 K 件 / スキップ（重複）J 件 を提示
9. 失敗分は理由付きで再実行キューに（冪等キーで二重送信を防止）
```

---

## 11. 失敗・冪等性・再実行

### 11.1 冪等キー（二重登録の防止）

```typescript
function idempotencyKey(writeProfileId: string, record: Record<string, unknown>, keyField: string): string {
  return sha256(`${writeProfileId}::${String(record[keyField])}`);
}
```

- 成功した write は `writeReceipts`（§15）に冪等キーを記録。
- 再実行・Job 再開時、既に成功済みキーは **skipped** として送信しない。
- `keyField` が無いデータは「重複検知不可」を UI で警告し、ユーザーが続行するか判断。

### 11.2 失敗の扱い

| 失敗種別 | 動作 |
|---|---|
| 入力欄が見つからない（required） | そのレコードを failed・errorSummary に欄名 |
| select の選択肢が無い（required） | failed・候補値を errorProbe ログに残す |
| successProbe タイムアウト | 「送信できたか不明」→ **unverified** として保留（自動再送しない・人が確認） |
| errorProbe ヒット（バリデーションエラー）| failed・対象サイトのエラーメッセージを取得して提示 |
| ナビゲーション失敗（次フォームに戻れない）| Task を一時停止し復旧を促す |
| 半数以上失敗 | Job を自動停止・ユーザー確認まで残りを実行しない |

> `unverified` は書き込み特有の状態。送信したか判別できないものを安易に再送すると二重登録になるため、自動リトライ対象から除外する。

### 11.3 再開

- `TaskRow.recordCursor` と冪等キーにより、中断（タブ閉じ・SW 停止・キャンセル）後も「未送信分だけ」を再開できる。

---

## 12. ProcessingView（書き込み版）

[dynamic-traversal.md §6](dynamic-traversal.md) の ProcessingView を書き込み用に拡張。実況は「読んでいる」ではなく「登録している」。

```
┌─ Side Panel: 書き込み中 ───────────────────────┐
│ 自社 受注登録フォーム へ転記中                  │
│                                                 │
│ ████████░░░░░░░░░░░░  9/24 登録                 │
│ 成功 8 / 失敗 1 / 重複スキップ 0                │
│                                                 │
│ いま登録中: 注文 #1009 鈴木一郎 様              │
│   ↓ フォームに入力 → 送信を確認しています        │
│                                                 │
│ 直近の結果:                                     │
│ ┌────────────────────────────────────────────┐│
│ │ #1006 ✓ 登録成功                            ││
│ │ #1007 ✓ 登録成功                            ││
│ │ #1008 ✗ 必須項目「電話」が空 → スキップ     ││
│ └────────────────────────────────────────────┘│
│                                                 │
│ [ ⏸ 一時停止 ]  [ ✕ 中止（ここまで保存） ]    │
└─────────────────────────────────────────────────┘
```

- 中止時は「ここまで M 件送信済み（取り消し不可）」を必ず明示。
- L1（Side Panel ロック）+ L2（タブ離脱警告）を書き込み中は特に厳格に適用。

---

## 13. レート制限とマナー

書き込みは対象サイトへの負荷・誤操作リスクが読み取りより高い。固定ガードを設ける。

| 項目 | 既定 | UI で変更可能な上限 |
|---|---|---|
| concurrency | 1 | 1（緩和不可） |
| レコード間隔 | 1 件/秒 | 2 件/秒 |
| timeout / レコード | 30 秒 | 60 秒 |
| max records / Job | 200 | 1000（有料・要追加確認） |
| 連続失敗での自動停止 | 5 件連続 or 50% | — |

これらは対象サイト保護と事故防止のためであり、課金条件には使わない（[dynamic-traversal.md §10](dynamic-traversal.md) と同方針）。

---

## 14. 課金との対応

| 機能 | Free | 有料 ¥700/月 |
|---|:---:|:---:|
| Write Profile 自作 | 1 枠 | 無制限 |
| 公式 Write Profile 利用 | × | ◯ |
| 単発書き込み（1 フォーム手動） | ◯ | ◯ |
| 一斉書き込み（batch-write） | × | ◯ |
| 一斉取り込み（batch-import） | × | ◯ |
| 転記パイプライン（transfer） | × | ◯ |
| スケジュール実行 | × | ◯（Phase E と統合）|

書き込みの公式 Profile も抽出と同じく「対象サイトの DOM 変化に追従する保守」をサブスク価値とする（[overview.md §7.2](overview.md)）。

---

## 15. データモデル追加

[data-model.md](data-model.md) の Dexie スキーマに以下を追加（`version(2)` でマイグレーション）。

```typescript
this.version(2).stores({
  // 既存に追加
  writeProfiles: "id, source, serverId, enabled, updatedAt",
  jobs:          "id, kind, status, createdAt",
  tasks:         "id, jobId, kind, status, [jobId+status]",
  mappings:      "id, writeProfileId, sourceProfileId",
  writeReceipts: "id, writeProfileId, idempotencyKey, jobId, [writeProfileId+idempotencyKey]",
});
```

```typescript
export interface WriteReceiptRow {
  id: string;
  jobId: string;
  taskId: string;
  writeProfileId: string;
  idempotencyKey: string;       // 二重登録防止キー（§11.1）
  recordIndex: number;
  status: "success" | "failed" | "unverified" | "skipped";
  targetUrl: string;
  submittedValues: Record<string, string>;  // 送信した値（監査・再現用）
  errorMessage?: string;
  attemptedAt: number;
  finishedAt: number | null;
}
```

- `WriteProfileRow` / `JobRow` / `TaskRow` / `TransferMappingSet` は本ドキュメント §4・§5・§9 の定義を `src/shared/types.ts` に追加。
- サーバ DB（PostgreSQL）には公式 Write Profile 配信用に `official_write_profiles` / `official_write_profile_versions` を追加（既存の official_profiles 系をミラー）。**抽出データ同様、書き込んだ値はサーバに保存しない**（[security.md §3.1](security.md)）。

---

## 16. RuntimeMessage 追加

既存の `RuntimeMessage`（`src/shared/types.ts`）に書き込み系を追加。

```typescript
export type RuntimeMessage =
  | /* 既存: GET_CURRENT_TAB_STATE / RUN_PROFILE / START_PICKER / EXTRACT ... */
  | { type: "START_WRITE_PICKER"; writeProfileName: string }
  | { type: "WRITE_PICKER_SAVED"; writeProfile: WriteProfileRow }
  | { type: "WRITE_RECORD"; writeProfile: WriteProfileRow; values: Record<string, string>; dryRun: boolean }
  | { type: "WRITE_RESULT"; status: "success" | "failed" | "unverified"; errorMessage?: string }
  | { type: "RUN_JOB"; jobId: string }
  | { type: "JOB_PROGRESS"; jobId: string; done: number; total: number; lastResult?: string };
```

---

## 17. 法務・規約・Chrome Web Store

書き込みは読み取りより審査・法務リスクが高い。先回りで設計する。

### 17.1 利用規約への追記（[security.md §6](security.md) を拡張）

- 書き込みは **ユーザーが正当なアクセス権を持つフォームへの、ユーザー自身の入力作業の自動化** に限定する旨を明記。
- 他者になりすました投稿・スパム投稿・対象サイト規約に反する自動投稿の禁止。
- 自動入力起因の対象サイト/第三者への損害はユーザー責任（ClipLayer 不問）。

### 17.2 公式 Write Profile の前提

- 公式配信するのは「ユーザー自身のデータを、ユーザー自身の別システムへ移す」類型のみ（例: 自社受注登録・自社 CRM 投入）。
- 第三者サイトへの一括投稿・口コミ自動化等は配信しない（ユーザー自作扱い・規約で制限）。

### 17.3 Chrome Web Store 審査

| 懸念 | 対策 |
|---|---|
| フォーム自動操作は自動化スパムと誤認されやすい | 単一目的を「ユーザー自身のデータ移行・転記支援」と明示・デモ動画で正当用途を提示 |
| 広い host_permissions | `optional_host_permissions` で対象ドメインだけ都度許諾（[architecture.md §3.2](architecture.md)）|
| ユーザー操作なしの自動送信 | 既定 `submitMode = stop-before-submit`。`auto` は明示設定 + 同意時のみ |
| データの取り扱い宣言 | 書き込んだ値はサーバに送らない旨を Data Use Disclosure に追記（[STORE_LISTING.md](../STORE_LISTING.md)）|

---

## 18. 段階導入計画

抽出側の動的巡回が Phase 8-10（[dynamic-traversal.md §11](dynamic-traversal.md)）なので、書き込みは Phase 11 以降に置く。

| Phase | 範囲 |
|---|---|
| MVP | 型のみ。`WriteProfileRow` 等は定義するが UI / 実装なし |
| Phase 11 | 単発書き込み: Write Picker + content script writer + active-tab + `stop-before-submit`。手動 1 フォーム |
| Phase 12 | マッピング UI + ドライラン + 1 件試行 + successProbe。転記の「1 件」が通る |
| Phase 13 | 一斉書き込み（batch-write・冪等キー・recordCursor 再開）+ ProcessingView 書き込み版 |
| Phase 14 | 一斉取り込み（batch-import）+ 転記パイプライン（transfer）の Job 連結 |
| Phase 15 | 公式 Write Profile 配信 + 署名検証 + background-tab 並列化なし最適化 |
| 将来 | スケジュール実行（Phase E と統合）・adaptive throttling |

[roadmap.md](roadmap.md) の「MVP 後のフェーズ」に Phase 11-15 を追加する。

---

## 19. 既存ドキュメントへの影響

| ドキュメント | 変更 |
|---|---|
| [README.md](README.md) | ドキュメント一覧に write-back.md を追加・「一言で言うと」に転記機能を追記 |
| [overview.md](overview.md) | §3 提供価値に「システム間転記（書き込み）」を追加・§5 MVP 範囲の「やらないこと」から将来移管 |
| [workflows.md](workflows.md) | Flow D（単発書き込み）・Flow E'（一斉転記）を追加 |
| [architecture.md](architecture.md) | コンポーネント図に Write Engine / Job Queue を追加・データフローに transfer を追記 |
| [element-picker.md](element-picker.md) | Write Picker（Stage W1-W4）を別節 or 本ドキュメント参照で追加 |
| [data-model.md](data-model.md) | §2 に writeProfiles / jobs / tasks / mappings / writeReceipts を追加・サーバに official_write_profiles |
| [subscription.md](subscription.md) | plan 表に一斉書き込み / 一斉取り込み / 転記を追加 |
| [security.md](security.md) | §6 に書き込み時の規約・同意・submit ガードを追加 |
| [STORE_LISTING.md](../STORE_LISTING.md) | Single Purpose / Permission / Data Use に書き込み用途を追記 |
| [roadmap.md](roadmap.md) | Phase 11-15 を追加 |

---

## 20. 未決事項

- 公式 Write Profile を初期に何サイト用意するか（保守コストは抽出より高い見込み）。
- `manual-each`（1 件ごと人が承認）を一斉でも既定にするか、ドライラン+1件試行で十分とするか。
- 多段転記（A → B → C）を許すか。当面 YAGNI で 1 段（Source → Target）に限定。
- CSV を Source にする際の文字コード・カラム対応 UI の仕様（取り込み済み Run との共通化）。
- `unverified`（送信成否不明）の再確認フロー: 対象サイトの一覧を再抽出して照合する半自動チェックを将来検討。

---

## 21. 検証指標

| 指標 | 目標 |
|---|---|
| inputType 自動判定の正答率 | > 95% |
| 制御コンポーネント（React/Vue）への値反映成功率 | > 98% |
| 二重登録の発生率（冪等キー有効時） | 0% |
| 一斉書き込み 100 件の完走率（途中再開込み） | > 99% |
| ドライラン → 本実行で結果が一致する率 | > 99% |
| `unverified` を誤って自動再送した件数 | 0 件 |
| 平均 Write Profile 作成時間（5 欄） | < 4 分 |
