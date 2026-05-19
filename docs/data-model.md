<!-- file: docs/scraper-extension/data-model.md -->

# ClipLayer データモデル

データは 3 箇所に分散して保存される。

| 保存先 | 用途 | サイズ目安 |
|---|---|---|
| chrome.storage.local | 設定値・暗号化済トークン・device id | ~1MB |
| chrome.storage.session | Access Token（ブラウザ閉じで消える）| ~1KB |
| IndexedDB (Dexie) | profile / run / item / image Blob / log | 数百MB〜数GB |
| サーバ DB (PostgreSQL) | アカウント / サブスク / 公式 profile / 監査 | 数 GB |

---

## 1. chrome.storage.local

設定値専用。Blob・大量配列は絶対に置かない。

```typescript
export interface AppSettings {
  theme: "light" | "dark" | "system";
  language: "ja" | "en";

  retention: {
    maxRuns: number;          // 既定 100
    maxAgeDays: number;       // 既定 90
    maxImageBytes: number;    // 既定 500 * 1024 * 1024
  };

  defaultDelivery: {
    type: "none" | "webhook" | "csv" | "cloud-sync";
    webhookUrl?: string;
    webhookHeaders?: Record<string, string>;
  };

  auth: {
    email: string | null;
    deviceId: string;             // 初回起動時に生成・サーバに登録
    lastLoginAt: number | null;
  };

  acknowledgedTermsAt: number | null;
  aiOptIn: boolean;
  telemetryOptIn: boolean;
}

// 別キーで保存
interface SecureBucket {
  refreshTokenEncrypted: string;  // AES-GCM 暗号化
  licenseSnapshot: LicenseSnapshot;
}
```

---

## 2. IndexedDB (Dexie)

### 2.1 ストア定義

```typescript
// src/storage/db.ts
import Dexie, { Table } from "dexie";

class AppDB extends Dexie {
  profiles!: Table<ProfileRow, string>;
  runs!: Table<RunRow, string>;
  pages!: Table<PageRow, string>;
  items!: Table<ItemRow, string>;
  images!: Table<ImageRow, string>;
  logs!: Table<LogRow, string>;
  deliveries!: Table<DeliveryAttemptRow, string>;

  constructor() {
    super("cliplayer-app");
    this.version(1).stores({
      profiles:   "id, source, serverId, enabled, updatedAt",
      runs:       "id, profileId, startedAt, status, [profileId+startedAt]",
      pages:      "id, runId, profileId, capturedAt, htmlHash",
      items:      "id, pageId, runId, profileId, [profileId+capturedAt]",
      images:     "id, itemId, sourceUrlHash, capturedAt",
      logs:       "id, runId, level, loggedAt",
      deliveries: "id, runId, type, attemptedAt, status",
    });
  }
}

export const db = new AppDB();
```

### 2.2 ProfileRow

```typescript
export interface ProfileRow {
  id: string;                       // ulid
  name: string;
  description?: string;
  source: "user" | "official";
  serverId?: string;                // 公式: "rakuten-rms-orders" 等
  version: number;
  signature?: string;               // 公式のみ・Ed25519 署名
  matchPatterns: string[];
  pageType: "list" | "detail" | "table" | "custom";
  selectors: SelectorDef[];
  pagination?: PaginationDef;
  delivery?: DeliveryConfig;
  enabled: boolean;
  acknowledgedAt: number;
  lastSyncedAt: number;
  lastSuccessAt: number | null;
  brokenSince: number | null;
  changelog?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SelectorDef {
  name: string;                     // "__root__" がリストルート・他は field
  selector: string;
  selectorType: "css" | "xpath";
  type: "text" | "attr" | "html" | "image-url";
  attr?: string;
  required: boolean;
  transform?: TransformDef;
}

export interface TransformDef {
  trim?: boolean;
  regex?: { pattern: string; group: number };
  case?: "upper" | "lower";
}

export interface PaginationDef {
  type: "next-button" | "infinite-scroll" | "url-pattern";
  nextSelector?: string;
  scrollDistance?: number;
  urlTemplate?: string;
  maxPages: number;
  waitMs: number;                   // 次ページ遷移後の待機
}

export interface DeliveryConfig {
  type: "webhook" | "csv" | "cloud-sync" | "google-sheets";
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  csvFilenameTemplate?: string;
  googleSheetsId?: string;
}
```

### 2.3 RunRow

```typescript
export interface RunRow {
  id: string;
  profileId: string;
  startedAt: number;
  finishedAt: number | null;
  status: "running" | "success" | "partial" | "failed";
  triggeredBy: "manual" | "schedule" | "auto-on-page";
  pageCount: number;
  itemCount: number;
  imageBytes: number;
  errorSummary?: string;
  sourceUrl: string;
  deliveryStatus?: "pending" | "delivered" | "failed" | "skipped";
}
```

### 2.4 PageRow

```typescript
export interface PageRow {
  id: string;
  runId: string;
  profileId: string;
  url: string;
  title: string;
  capturedAt: number;
  htmlHash: string;                 // sha256(document.documentElement.outerHTML)
  metaJson: Record<string, unknown>;  // og:* / canonical / meta description
}
```

### 2.5 ItemRow

```typescript
export interface ItemRow {
  id: string;
  pageId: string;
  runId: string;
  profileId: string;
  index: number;                    // ページ内順序
  fields: Record<string, string | number | null>;
  imageIds: string[];               // 紐付く image id
  capturedAt: number;
  flags: { pii: boolean };          // PII らしき値を含む
}
```

### 2.6 ImageRow

```typescript
export interface ImageRow {
  id: string;
  itemId: string;
  sourceUrl: string;
  sourceUrlHash: string;            // dedup 用 sha256(sourceUrl)
  mimeType: string;
  byteSize: number;
  blob: Blob | null;                // 取得失敗 / サイズ超過 → null
  capturedAt: number;
}
```

### 2.7 LogRow

```typescript
export interface LogRow {
  id: string;
  runId: string | null;
  level: "info" | "warn" | "error";
  category: "auth" | "sync" | "extract" | "delivery" | "system";
  message: string;
  contextJson?: Record<string, unknown>;
  loggedAt: number;
}
```

### 2.8 DeliveryAttemptRow

送信先への配信履歴を別管理。

```typescript
export interface DeliveryAttemptRow {
  id: string;
  runId: string;
  type: "webhook" | "csv" | "cloud-sync" | "google-sheets";
  endpoint?: string;
  attemptedAt: number;
  finishedAt: number | null;
  status: "success" | "failed" | "pending";
  httpStatus?: number;
  errorMessage?: string;
  retryCount: number;
}
```

---

## 3. 画像 Blob 保存方針

### 3.1 取得
- content script で `fetch(url, { credentials: "include" })`
- Blob 化して background へ postMessage（構造化クローン）
- 1 画像最大 5MB（超過は URL のみ保存）

### 3.2 dedup
- 同一 run 内: `sourceUrlHash` で重複チェック
- 異なる run 間: 重複保存を許容（履歴の独立性優先）

### 3.3 削除
- run 削除時に cascade（imageIds の全 image を bulkDelete）
- retention policy で Blob 容量超 → 古い image から削除

### 3.4 表示
- UI から `URL.createObjectURL(blob)` で表示
- メモリリーク防止に `revokeObjectURL` を必ず呼ぶ

---

## 4. retention（容量管理）

```typescript
// src/storage/retention.ts
export async function runRetention(policy: RetentionPolicy) {
  const cutoff = Date.now() - policy.maxAgeDays * 86_400_000;

  // (1) maxAgeDays 超 → run ごと cascade 削除
  const oldRuns = await db.runs.where("startedAt").below(cutoff).toArray();
  for (const r of oldRuns) await deleteRunCascade(r.id);

  // (2) maxRuns 超過（古い順）
  const all = await db.runs.orderBy("startedAt").reverse().toArray();
  for (const r of all.slice(policy.maxRuns)) await deleteRunCascade(r.id);

  // (3) maxImageBytes 超 → 古い image から削除
  const totalBytes = await db.images.toArray()
    .then((rs) => rs.reduce((a, r) => a + r.byteSize, 0));
  if (totalBytes > policy.maxImageBytes) {
    const imgs = await db.images.orderBy("capturedAt").toArray();
    let cur = totalBytes;
    for (const img of imgs) {
      if (cur <= policy.maxImageBytes) break;
      await db.images.delete(img.id);
      cur -= img.byteSize;
    }
  }
}

async function deleteRunCascade(runId: string) {
  await db.transaction("rw",
    [db.runs, db.pages, db.items, db.images, db.logs, db.deliveries], async () => {
    const items = await db.items.where("runId").equals(runId).toArray();
    const imageIds = items.flatMap((i) => i.imageIds);
    await db.images.bulkDelete(imageIds);
    await db.items.where("runId").equals(runId).delete();
    await db.pages.where("runId").equals(runId).delete();
    await db.logs.where("runId").equals(runId).delete();
    await db.deliveries.where("runId").equals(runId).delete();
    await db.runs.delete(runId);
  });
}
```

`chrome.alarms` で 1 日 1 回実行。

---

## 5. サーバ DB（PostgreSQL）

### 5.1 主要テーブル

```sql
-- ユーザー
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- デバイス（拡張インストール単位）
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,             -- 拡張側で生成した識別子
  device_name TEXT,                    -- User-Agent から導出
  last_seen_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);

-- リフレッシュトークン
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  rotated_to UUID REFERENCES refresh_tokens(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- サブスクリプション
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,                  -- 'free' / 'basic' / 'pro' / 'enterprise'
  status TEXT NOT NULL,                -- 'active' / 'past_due' / 'canceled'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  provider TEXT,                       -- 'stripe' / 'sbps' etc.
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 公式 profile
CREATE TABLE official_profiles (
  id TEXT PRIMARY KEY,                 -- 'rakuten-rms-orders'
  name TEXT NOT NULL,
  category TEXT NOT NULL,              -- 'ec' / 'reservation' / 'admin'
  minimum_plan TEXT NOT NULL,
  current_version INT NOT NULL,
  status TEXT NOT NULL,                -- 'active' / 'deprecated'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- profile バージョン履歴
CREATE TABLE official_profile_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id TEXT NOT NULL REFERENCES official_profiles(id),
  version INT NOT NULL,
  payload JSONB NOT NULL,              -- 完全な profile 定義
  signature TEXT NOT NULL,             -- Ed25519
  signed_at TIMESTAMPTZ NOT NULL,
  changelog TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  published_by UUID,
  UNIQUE (profile_id, version)
);

-- 破損レポート
CREATE TABLE profile_broken_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id TEXT NOT NULL REFERENCES official_profiles(id),
  reported_by_user_id UUID REFERENCES users(id),
  source_url TEXT,
  errors JSONB,
  item_count INT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 監査ログ
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 改ざん検知レポート
CREATE TABLE tamper_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  device_id UUID REFERENCES devices(id),
  kind TEXT NOT NULL,                  -- 'manifest_modified' 等
  details JSONB,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI 使用記録（Pro plan の月次クォータ）
CREATE TABLE ai_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_type TEXT NOT NULL,
  tokens_consumed INT
);

CREATE INDEX ON ai_usage_records (user_id, used_at);
```

### 5.2 インデックス方針
- `users(email)` UNIQUE
- `devices(user_id, device_id)` UNIQUE
- `refresh_tokens(token_hash)` UNIQUE
- `subscriptions(user_id, status)` 複合
- `official_profile_versions(profile_id, version)` UNIQUE
- `audit_logs(user_id, created_at)` 複合
- `ai_usage_records(user_id, used_at)` 月次集計用

### 5.3 マイグレーション方針
- 番号付き SQL ファイル（`000001_initial.up.sql` 等）
- up/down ペア
- CI で番号衝突チェック

---

## 6. JSON で持つもの / 正規化するもの

### 6.1 JSON で持って良い
- profile.selectors（配列・スキーマ変化に強い）
- profile.pagination
- items.fields（動的）
- audit_logs.metadata
- official_profile_versions.payload

### 6.2 通常カラムにする
- user_id / device_id / profile_id 等の参照キー
- 状態（status）・日時
- 検索・集計に使う数値（itemCount / pageCount）

---

## 7. 履歴と現在値の分離

| 概念 | 履歴 | 現在値 |
|---|---|---|
| run | runs | — |
| profile version | official_profile_versions | official_profiles.current_version |
| subscription | （後続）subscription_events | subscriptions |
| AI usage | ai_usage_records | （月次集計を view で） |
| device | devices.revoked_at | devices.last_seen_at |

---

## 8. 削除と soft delete

| 対象 | 方針 |
|---|---|
| users | soft delete（status='deleted'）・90 日後物理削除 |
| devices | revoke（revoked_at セット）・物理削除しない |
| official_profiles | deprecate のみ（バージョン履歴は保持） |
| user profile（IndexedDB）| trash 30 日 → 物理削除 |
| run（IndexedDB）| retention policy で削除 |
