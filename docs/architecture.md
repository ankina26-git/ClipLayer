<!-- file: docs/scraper-extension/architecture.md -->

# ClipLayer アーキテクチャ

## 1. 全体構成

```
                ┌──────────────────────────────────┐
                │     ClipLayer Auth/License API    │
                │  - login / refresh / logout      │
                │  - subscription / device manage  │
                │  - Stripe / 国内決済 webhook       │
                └──────────────┬───────────────────┘
                               │
                ┌──────────────┴───────────────────┐
                │   ClipLayer Profile Registry      │
                │  - 公式 profile CRUD + 署名       │
                │  - plan ベース配信                 │
                │  - 破損レポート受信                │
                └──────────────┬───────────────────┘
                               │ HTTPS + JWT
                               │
┌──────────────────────────────┴─────────────────────────────┐
│                  Chrome Extension (MV3)                     │
│                                                              │
│  [Side Panel UI (React)]                                    │
│         ▲                                                    │
│         │ messages                                          │
│  [Background Service Worker]                                │
│         │  - 認証 / heartbeat / profile sync                │
│         │  - run orchestration / push 送信                  │
│         ▼                                                    │
│  [Content Scripts (per tab)]                                │
│         │  - DOM 抽出 / Element Picker / 画像 fetch          │
│         ▼                                                    │
│  [Target Web Page (logged-in session)]                      │
│                                                              │
│  [Storage]                                                   │
│    ├─ chrome.storage.local  : 設定 / 暗号化 refresh token    │
│    ├─ chrome.storage.session: access token                  │
│    └─ IndexedDB (Dexie)     : profile / run / item / image  │
└──────────────────────────────┬─────────────────────────────┘
                               │ Webhook / API push
                               ▼
                ┌──────────────────────────────────┐
                │   ユーザーの送信先（任意）         │
                │  - Webhook (Slack / Discord 等)   │
                │  - 自社 API                       │
                │  - CSV ローカル保存               │
                └──────────────────────────────────┘
```

---

## 2. コンポーネント分解

### 2.1 拡張機能側

| コンポーネント | 役割 | 技術 |
|---|---|---|
| Side Panel UI | プロファイル管理・実行・履歴閲覧の主 UI | React + TypeScript + Vite |
| Popup | クイック起動（バッジクリック時） | React |
| Options Page | 認証・設定・利用規約 | React |
| Background Service Worker | ジョブ orchestration・heartbeat・sync・push | TypeScript |
| Content Script | DOM 抽出・Element Picker・画像 fetch | TypeScript |
| Storage Layer | Dexie ラッパ・Repository | TypeScript + Dexie |

### 2.2 サーバ側

| コンポーネント | 役割 | 技術候補 |
|---|---|---|
| Auth API | login / refresh / device 管理 | Hono |
| Profile Registry | 公式 profile CRUD・署名・配信 | Hono |
| Subscription Service | Stripe webhook 受信・plan 状態同期 | Hono |
| Profile Request Service | 代行依頼受付・運営者管理画面（[subscription.md](subscription.md) §13）| Hono |
| DB | ユーザー・サブスク・profile・device・依頼 | PostgreSQL |
| Object Storage | profile 署名済 JSON・代行依頼スクリーンショット | S3 互換 |
| 監視 / canary | 対象サイトの DOM 変化検知 | Playwright + cron |

AI Proxy / Cloud Sync コンポーネントは MVP では持たない（仕様撤回）。

---

## 3. Manifest V3 制約と対処

### 3.1 Service Worker の短命化
- アイドル ~30 秒で suspend → 状態は IndexedDB に永続化
- 長時間処理は `chrome.alarms` で分割
- 認証情報は再起動時に IndexedDB / storage.local から復元

### 3.2 host_permissions
- 配布初期は `optional_host_permissions` で個別許諾を取る
- Chrome Web Store 審査で `<all_urls>` は厳しいため避ける
- profile 追加時にドメイン許諾を求める UX

### 3.3 CSP
- `eval` 禁止・外部スクリプト inject 禁止
- すべてバンドル
- WASM 利用時は `wasm-unsafe-eval` を必要に応じて宣言

### 3.4 fetch の Cookie 伝搬
- background から fetch すると extension origin になり対象サイト Cookie が剥がれる
- **画像取得は必ず content script 経由で fetch する**（credentials: "include"）

### 3.5 Side Panel API
- Chrome 114+ の sidePanel API を採用
- Firefox 対応は当面しない

---

## 4. 設計原則

### 4.1 責務の三層分離
- **scraping engine**: DOM → 構造化データ
- **storage layer**: 永続化（Dexie）
- **delivery layer**: Webhook / API / CSV / クラウド同期

UI からは Repository 経由でしかストレージに触らない。

### 4.2 profile 駆動
- サイトごとの仕様（URL パターン・セレクタ・ページ種別）は宣言的な profile（JSON）で表現
- コードでハードコードしない
- 公式 profile はサーバ配信・ユーザー作成は自端末保管

### 4.3 ローカルファースト
- データはデフォルト IndexedDB に保存
- 外部送信はユーザーが明示設定した送信先のみ
- AI 解析・クラウド同期は明示 opt-in

### 4.4 MV3 制約に逆らわない
- SW の寿命を前提に状態を都度永続化
- alarms / offscreen document を素直に使う

### 4.5 サーバ依存で課金正当化
- 公式 profile 配信・AI 解析・クラウド同期はサーバ必須
- 拡張だけでは動かない設計が改造耐性になる

---

## 5. データフロー（典型シーケンス）

### 5.1 公式 profile による取り込み

```
1. ユーザーがログイン済の対象サイトを開く
2. background が URL を watch → matching profile を検出
3. Side Panel に「取り込み可能」バッジ表示
4. ユーザーが「実行」押下
5. background → content script に EXTRACT 指示
6. content script: profile に従い DOM 抽出 + 画像 URL 列挙
7. content script: 画像を fetch (credentials:"include") → Blob 化
8. background: pipeline で IndexedDB に書き込み
9. background: 設定された送信先（Webhook 等）に push
10. Side Panel に結果サマリ表示
```

### 5.2 Element Picker による profile 作成

```
1. ユーザーが対象ページで「Profile 新規作成」
2. content script が picker mode を起動
3. ユーザーがリスト行を 1 クリック
4. content script が繰り返し要素を自動検出
5. ハイライト表示で確認 → 「合っている」
6. ユーザーが行内の各フィールドをクリック → ラベル入力
7. リアルタイムプレビューで全行抽出結果を表示
8. 「保存」→ IndexedDB に profile 保存
9. URL パターンと共に matchPatterns に登録
```

### 5.3 公式 profile の自動更新

```
1. 起動時 + alarms（24h）で sync 起動
2. background → /profiles GET（plan に応じた利用可能 profile 取得）
3. 各 profile の署名検証（Ed25519）
4. 検証 OK + バージョン上がっているもののみ upsert
5. ユーザーに通知（バッジ + Side Panel の「更新あり」表示）
```

### 5.4 破損検知 → 即時再同期

```
1. 実行時に「必須フィールド欠落」 or 「item 数 0」検知
2. profile.brokenSince = now() で marking
3. サーバに POST /profiles/:id/report-broken
4. 即時 syncProfiles 起動（新版があれば適用）
5. UI に「自動修正中」表示
```

---

## 6. 認証アーキテクチャ

### 6.1 トークン構成
- Access Token: 15 分・JWT・chrome.storage.session
- Refresh Token: 30 日・rotation・chrome.storage.local (AES-GCM 暗号化)
- Device ID: 初回起動時に生成・サーバに登録

### 6.2 ログインフロー
- ClipLayer 専用アカウント（メール + パスワード or OAuth）
- login 成功 → JWT + refresh token + license snapshot を返す
- license snapshot に plan / features / expiresAt / maxProfiles / maxDevices を含む

### 6.3 heartbeat
- 60 分ごとに refresh
- 連続失敗 7 日（grace period）後に有料機能ロック

詳細は [subscription.md](subscription.md) を参照。

---

## 7. ストレージ全体像

| 種類 | 用途 | 保存場所 |
|---|---|---|
| 設定 | UI 設定・device id・retention policy | chrome.storage.local |
| Access Token | API 認証 | chrome.storage.session |
| Refresh Token | トークン更新（暗号化済） | chrome.storage.local |
| License Snapshot | plan / features キャッシュ | chrome.storage.local |
| Profiles | 公式 + 自作の profile 定義 | IndexedDB |
| Runs | 実行履歴 | IndexedDB |
| Pages | 抽出ページのメタ | IndexedDB |
| Items | 抽出結果 | IndexedDB |
| Images | 画像 Blob | IndexedDB |
| Logs | 実行ログ・エラー | IndexedDB |

詳細スキーマは [data-model.md](data-model.md) を参照。

---

## 8. パフォーマンス方針

### 8.1 拡張側
- content script は対象ページに常駐するため軽量を維持（初期 < 50KB gzip）
- Element Picker / 抽出処理は dynamic import で初回利用時にロード
- Dexie の transaction は短く区切る（書き込みは bulk add 優先）

### 8.2 サーバ側
- profile 配信は CDN キャッシュ可能な構造（署名済 JSON）
- AI 解析はリクエスト単位でレート制限（plan 別）
- DB は PostgreSQL 単一・初期は数 GB で十分

### 8.3 画像処理
- 1 画像最大 5MB（超過は URL のみ保存）
- 並列 fetch は 4 並列まで（対象サイトへの負荷配慮）
- 同一 URL は sourceUrlHash で dedup

---

## 9. 拡張性

| 拡張機能 | 既存設計との接点 |
|---|---|
| 動的ページ巡回（list → detail）| Navigation Orchestrator + ProcessingView を追加（[dynamic-traversal.md](dynamic-traversal.md)）|
| 複数送信先 | profile.deliveries[] を配列化・順次 deliver |
| スケジュール実行 | chrome.alarms + run engine に schedule 引数 |
| Firefox 対応 | Manifest V3 互換性が成熟したら検討 |
| BYO API key 方式の AI 解析（将来）| ユーザー自身の Anthropic/OpenAI キーを設定・サーバ proxy 経由でなく拡張から直接呼ぶ |

---

## 10. 採用しない選択肢

| 選択肢 | 理由 |
|---|---|
| Electron 化 / デスクトップアプリ | ブラウザ拡張 = 既存ログインセッション利用が中核価値・ネイティブ化すると失う |
| Playwright on backend | ログインセッションを安全に受け取れない・SSRF / アカウント保護リスク |
| 全 OSS 化 | 公式 profile 配信モデルが成立しない・サブスクが空文に |
| GraphQL | 単純な REST で足りる・初期は YAGNI |
| Monorepo | 拡張とサーバはコードベース分離・必要になったら統合 |
