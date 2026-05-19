<!-- file: docs/scraper-extension/backend-api.md -->

# ClipLayer Backend API 仕様

## 1. ベース情報

- ベース URL: `https://api.cliplayer.app/v1`（仮）
- プロトコル: HTTPS 必須
- 認証: Bearer JWT（`Authorization: Bearer <access_token>`）
- 形式: JSON
- エラーフォーマット統一

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "メールアドレスまたはパスワードが正しくありません",
    "trace_id": "abc123"
  }
}
```

---

## 2. 認証 API

### 2.1 POST /auth/signup

新規ユーザー登録。

```json
// Request
{
  "email": "user@example.com",
  "password": "...",
  "acknowledgedTerms": true
}

// Response 201
{
  "userId": "uuid",
  "verificationEmailSent": true
}
```

エラー: `EMAIL_TAKEN`, `WEAK_PASSWORD`, `TERMS_NOT_ACKNOWLEDGED`

### 2.2 POST /auth/login

```json
// Request
{
  "email": "user@example.com",
  "password": "...",
  "deviceId": "abc123...",
  "deviceName": "Chrome on Mac"
}

// Response 200
{
  "accessToken": "<jwt>",
  "refreshToken": "<opaque>",
  "license": { /* LicenseSnapshot */ }
}
```

エラー: `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `DEVICE_LIMIT_REACHED`, `ACCOUNT_SUSPENDED`

### 2.3 POST /auth/refresh

```json
// Request
{
  "refreshToken": "<opaque>",
  "deviceId": "abc123..."
}

// Response 200
{
  "accessToken": "<jwt>",
  "refreshToken": "<new opaque>",
  "license": { /* LicenseSnapshot */ }
}
```

エラー: `REFRESH_TOKEN_INVALID`, `REFRESH_TOKEN_REVOKED`, `DEVICE_MISMATCH`

### 2.4 POST /auth/logout

```json
// Request
{
  "refreshToken": "<opaque>"
}

// Response 204
```

---

## 3. デバイス管理

### 3.1 GET /devices

```json
// Response 200
{
  "devices": [
    {
      "id": "uuid",
      "deviceId": "abc...",
      "deviceName": "Chrome on Mac",
      "lastSeenAt": "2026-05-19T12:00:00Z",
      "current": true
    }
  ],
  "maxDevices": 5
}
```

### 3.2 POST /devices/:id/revoke

```json
// Response 204
```

---

## 4. License

### 4.1 GET /license/status

```json
// Response 200
{
  "plan": "pro",
  "status": "active",
  "features": ["ai_analyze", "cloud_sync", "official_profiles"],
  "maxProfiles": 9999,
  "maxDevices": 5,
  "aiUsageThisMonth": 1234,
  "aiUsageLimit": 5000,
  "currentPeriodEnd": "2026-06-19T00:00:00Z",
  "expiresAt": "2026-06-19T00:00:00Z",
  "snapshotAt": "2026-05-19T12:00:00Z",
  "signature": "..."
}
```

JWT 内の features は短命キャッシュなので、UI 側で表示する正本としてこの API を使う。

---

## 5. Profile Registry

### 5.1 GET /profiles

利用可能な公式 profile 一覧（plan に応じた絞り込み）。

```json
// Query
?since=1716000000  (optional - 差分取得)

// Response 200
{
  "profiles": [
    {
      "id": "rakuten-rms-orders",
      "name": "楽天 RMS 注文一覧",
      "category": "ec",
      "version": 8,
      "minimumPlan": "basic",
      "matchPatterns": ["https://rms.rakuten.co.jp/orders*"],
      "selectors": [...],
      "pagination": {...},
      "changelog": "2026-05-19: 注文ID列のセレクタ変更に追従",
      "publishedAt": "2026-05-19T10:00:00Z",
      "signature": "<ed25519 base64>",
      "signedAt": "2026-05-19T10:00:00Z"
    }
  ],
  "totalCount": 42
}
```

### 5.2 GET /profiles/:id/latest

単一 profile の最新版を取得（破損検知時の即時 sync 用）。

```json
// Response 200
{ /* ServerProfile（同上） */ }
```

### 5.3 POST /profiles/:id/report-broken

破損レポート。Free でも受け付ける（運営側のシグナルとして重要）。

```json
// Request
{
  "sourceUrl": "https://rms.rakuten.co.jp/orders/today",
  "extractErrors": ["missing required field: order_id"],
  "itemCount": 0,
  "currentVersion": 7
}

// Response 202
{
  "received": true,
  "currentLatestVersion": 8,
  "shouldSync": true
}
```

`shouldSync: true` の場合、拡張側は即 sync する。

### 5.4 GET /profiles/catalog（パブリック）

未ログインでも見られる公式 profile カタログ。LP / SEO 用。認証不要。

```json
// Response 200
{
  "profiles": [
    { "id": "rakuten-rms-orders", "name": "...", "category": "ec",
      "minimumPlan": "basic" }
  ]
}
```

---

## 6. データ送信（任意）

### 6.1 POST /sync/items（Pro 機能・クラウド同期）

```json
// Request
{
  "runId": "ulid",
  "profileId": "rakuten-rms-orders",
  "items": [
    { "fields": { "orderId": "1001", "customerName": "..." } }
  ],
  "capturedAt": "2026-05-19T12:34:56Z",
  "sourceUrl": "..."
}

// Response 200
{
  "syncId": "uuid",
  "accepted": 24
}
```

サーバ側で feature 検証必須。

### 6.2 webhook 配信は拡張側でユーザー設定の URL に直接送る

サーバを経由しない（ClipLayer 側に送信内容を保管させない選択肢）。設定は profile.delivery.webhookUrl。

---

## 7. AI 解析（Pro 機能）

### 7.1 POST /ai/analyze

```json
// Request
{
  "items": [ /* ItemRow[] */ ],
  "task": "summarize" | "classify" | "extract-entities",
  "options": { /* task ごと */ }
}

// Response 200
{
  "results": [...],
  "tokensUsed": 1234,
  "remainingThisMonth": 3766
}
```

実装は Anthropic / OpenAI API への proxy。ユーザー個別の API キーは使わない（ClipLayer 側の契約キー）。

### 7.2 POST /ai/repair-selector（Pro 機能）

DOM 変化で壊れた selector を AI で修復。

```json
// Request
{
  "profileId": "rakuten-rms-orders",
  "fieldName": "order_id",
  "currentSelector": ".order-row .id",
  "currentHtml": "<truncated HTML>",
  "expectedSampleValue": "1001"
}

// Response 200
{
  "suggestedSelector": ".order-row [data-testid='order-id']",
  "confidence": 0.87
}
```

---

## 8. 監査・テレメトリ

### 8.1 POST /telemetry/tamper

```json
// Request
{
  "kind": "manifest_modified" | "bundle_hash_mismatch" | "license_check_bypassed",
  "details": { /* 任意 */ }
}

// Response 204
```

ブロックはしない・ログ取得のみ。

### 8.2 POST /telemetry/usage（オプトイン時のみ）

```json
// Request
{
  "events": [
    { "name": "profile.created", "at": "...", "props": { "source": "user" } },
    { "name": "run.completed", "at": "...", "props": { "itemCount": 24 } }
  ]
}
```

プライバシー設定で opt-in/out。PII を含まない。

---

## 9. 決済 webhook

### 9.1 POST /webhooks/stripe

Stripe からの webhook 受信。

主要イベント:
- `checkout.session.completed` → subscription 作成
- `invoice.paid` → status='active', current_period_end 更新
- `invoice.payment_failed` → status='past_due'
- `customer.subscription.deleted` → status='canceled'

各イベント処理後に該当ユーザーの license snapshot を更新 → 拡張は次の refresh で受信。

---

## 10. CORS / Origin

### 10.1 CORS

拡張機能からの fetch は Origin が `chrome-extension://<ID>` になる。サーバ側は **許可された拡張 ID のみ** を受け付ける:

```typescript
const allowedExtensionIds = process.env.ALLOWED_EXTENSION_IDS!.split(",");
app.use((req, res, next) => {
  const origin = req.headers.origin ?? "";
  const ok = allowedExtensionIds.some(
    (id) => origin === `chrome-extension://${id}`,
  );
  if (!ok && req.path.startsWith("/v1/")) return res.status(403).end();
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  next();
});
```

### 10.2 Web 管理画面

別途 `https://app.cliplayer.app` で動かす場合は CORS に追加。

---

## 11. レート制限

plan ベースで sliding window 制限（Redis 推奨）:

| エンドポイント | Free | Basic | Pro |
|---|---|---|---|
| /auth/* | 60/h | 60/h | 60/h |
| /profiles GET | 24/d | 24/d | 24/d |
| /profiles/report-broken | 10/d | 100/d | 1000/d |
| /sync/items | 0 | 0 | 1000/d |
| /ai/analyze | 0 | 0 | 5000/月 |
| /telemetry/tamper | 100/d | 100/d | 100/d |

超過時は `429 Too Many Requests` + `Retry-After` ヘッダ。

---

## 12. エラーコード一覧

| code | HTTP | 意味 |
|---|---|---|
| INVALID_CREDENTIALS | 401 | login 失敗 |
| EMAIL_NOT_VERIFIED | 403 | メール未認証 |
| ACCOUNT_SUSPENDED | 403 | アカウント停止中 |
| DEVICE_LIMIT_REACHED | 409 | デバイス上限 |
| REFRESH_TOKEN_INVALID | 401 | 無効な refresh token |
| FEATURE_NOT_IN_PLAN | 403 | plan に含まれない機能 |
| AI_QUOTA_EXCEEDED | 429 | AI 月次クォータ超 |
| RATE_LIMITED | 429 | レート制限 |
| PROFILE_NOT_FOUND | 404 | 公式 profile 不在 |
| INVALID_SIGNATURE | 400 | 署名検証失敗（クライアントが偽 profile を送った場合等） |
| INVALID_REQUEST | 400 | 一般的なバリデーション |

---

## 13. 認証ミドルウェア

```typescript
// 擬似コード
async function authenticate(req: Request): Promise<AuthContext> {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) throw new HttpError(401, "MISSING_TOKEN");

  const payload = verifyJWT(token, JWT_SECRET);  // exp / sig 検証
  const user = await db.users.findById(payload.sub);
  if (!user || user.status !== "active") throw new HttpError(403);

  const device = await db.devices.findByUserAndDeviceId(user.id, payload.deviceId);
  if (!device || device.revokedAt) throw new HttpError(401, "DEVICE_REVOKED");

  return { user, device, claims: payload };
}
```

JWT payload:
```json
{
  "sub": "user-uuid",
  "plan": "pro",
  "features": ["ai_analyze", "cloud_sync"],
  "deviceId": "uuid",
  "iat": 1716100000,
  "exp": 1716100900
}
```

short-lived（15 分）なので features キャッシュとして使ってよい。

---

## 14. 想定実装スタック

| 層 | 候補 | 採用 |
|---|---|---|
| 言語 | TypeScript（Node.js）/ Go | TypeScript（拡張と合わせる） |
| フレームワーク | Hono / Next.js Route Handlers / Express | **Hono**（軽量・型強い） |
| DB | PostgreSQL | 確定 |
| ORM | Drizzle / Prisma | **Drizzle**（軽量・migration が明示的） |
| キャッシュ | Redis | rate limit 用に採用 |
| 決済 | Stripe | MVP は確定 |
| ホスティング | Cloud Run / Fly.io / Railway / Render | **Render** or **Railway**（業種ニュートラル・低コスト） |
| メール | Resend / Postmark | **Resend**（DX 良好） |

業種が ClipLayer は中立なので、Stripe・Cloudflare・Render 等の米系を採用可（Night Hub の制約は適用しない）。
