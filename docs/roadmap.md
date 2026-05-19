<!-- file: docs/scraper-extension/roadmap.md -->

# ClipLayer 開発ロードマップ

MVP から正式リリースまでの段階的開発計画。総開発期間 **約 24 営業日（約 5 週間）** を目安とする。

---

## Phase 0: プロジェクト骨格（2 日）

| # | 項目 | 日数 | 完了条件 |
|---|---|---|---|
| 0.1 | リポジトリ作成・初期コミット | 0.2 | GitHub に push 済 |
| 0.2 | vite + TypeScript + Manifest V3 設定 | 0.3 | popup が「Hello」表示 |
| 0.3 | Side Panel / Options Page のスケルトン | 0.5 | 4 タブ表示・React + ルーティング |
| 0.4 | サーバプロジェクト（Hono + Drizzle + PostgreSQL）骨格 | 0.5 | /health 200 OK |
| 0.5 | docker-compose（拡張開発 + サーバ + DB）| 0.5 | `docker compose up` で開発開始 |

---

## Phase 1: ローカルスクレイピング基盤（5 日）

| # | 項目 | 日数 | 完了条件 |
|---|---|---|---|
| 1.1 | Dexie schema + Repository 層 | 1.0 | profile / run / item の CRUD |
| 1.2 | URL watcher + バッジ + 「このページ」タブ | 0.5 | 該当 profile を検知して表示 |
| 1.3 | content script の基本抽出（ハードコード profile）| 1.0 | 任意サイトで item 取得 |
| 1.4 | 画像 fetch + Blob 保存 + dedup | 1.0 | 画像が IndexedDB に保存・表示 |
| 1.5 | テーブル抽出 | 0.5 | thead/tbody → Record[] |
| 1.6 | run / log の可視化 | 0.5 | 履歴タブで成功/失敗閲覧 |
| 1.7 | retention（alarms 1 日 1 回）| 0.5 | maxAgeDays/maxRuns/maxBytes 動作 |

---

## Phase 2: Element Picker（4 日）★最重要

| # | 項目 | 日数 | 完了条件 |
|---|---|---|---|
| 2.1 | overlay UI（Shadow DOM）| 0.5 | 注入される overlay が hover ハイライト |
| 2.2 | リスト行検出アルゴリズム | 1.0 | 繰り返し要素の自動検出が 90% 成功 |
| 2.3 | 安定セレクタ生成（data-* / role / 安定 class）| 1.0 | DOM 微変動への耐性 |
| 2.4 | フィールド指定 + ダイアログ | 0.5 | label + type 入力可 |
| 2.5 | リアルタイムプレビュー | 0.5 | 5 件の抽出結果を即表示 |
| 2.6 | profile 保存 + 編集モード | 0.5 | 保存後すぐ実行できる |

詳細は [element-picker.md](element-picker.md) §11 を参照。

**ここを削ると製品全体の価値が崩壊** するので妥協しない。

---

## Phase 3: サーバ側基盤（3 日）

| # | 項目 | 日数 | 完了条件 |
|---|---|---|---|
| 3.1 | users / devices / refresh_tokens migration | 0.5 | DB schema 完成 |
| 3.2 | /auth/signup, /auth/login, /auth/refresh | 1.0 | curl で動作確認 |
| 3.3 | devices 管理 + 上限 enforcement | 0.5 | 上限超で 409 |
| 3.4 | rate limit（Redis sliding window）| 0.5 | plan ベース制限が効く |
| 3.5 | Stripe webhook 受信 + subscription 更新 | 0.5 | プラン変更が DB に反映 |

---

## Phase 4: Profile Registry（3 日）

| # | 項目 | 日数 | 完了条件 |
|---|---|---|---|
| 4.1 | official_profiles + versions テーブル | 0.5 | DB schema 完成 |
| 4.2 | Ed25519 鍵生成 + 署名スクリプト | 0.5 | yaml → signed JSON 化 |
| 4.3 | GET /profiles（plan フィルタ）| 0.5 | curl で plan 別配信確認 |
| 4.4 | POST /profiles/:id/report-broken | 0.5 | 破損レポート受信 |
| 4.5 | 公式 profile を 3 サイト分作成（楽天 RMS / Shopify / 食べログ）| 1.0 | 実際に動作 |

---

## Phase 5: 拡張のサブスク統合（3 日）

| # | 項目 | 日数 | 完了条件 |
|---|---|---|---|
| 5.1 | login UI + token store（暗号化）| 1.0 | login → license snapshot 保存 |
| 5.2 | heartbeat + refresh フロー | 0.5 | 60 分ごとの自動 refresh |
| 5.3 | feature gate + Free/Basic/Pro 分岐 | 0.5 | Pro 機能が Free で弾かれる |
| 5.4 | profile 自動 sync + 署名検証 | 0.5 | サーバから profile 更新が降ってくる |
| 5.5 | 破損検知 → 即時 sync | 0.5 | 抽出失敗で sync 起動 |

---

## Phase 6: 配信 + UX 仕上げ（3 日）

| # | 項目 | 日数 | 完了条件 |
|---|---|---|---|
| 6.1 | Webhook 送信（HMAC 署名対応）| 0.5 | 任意 URL に POST 成功 |
| 6.2 | CSV エクスポート（zip 暗号化）| 0.5 | items を password 付き zip で出力 |
| 6.3 | エラー UI + 再実行ボタン | 0.5 | partial / failed 詳細表示 |
| 6.4 | オンボーディング + 利用規約同意 | 0.5 | 初回起動で同意フロー |
| 6.5 | 改ざん検知 + obfuscation 設定 | 0.5 | manifest 改変が tamper API に届く |
| 6.6 | プランページ・解約導線（Web）| 0.5 | 解約 → grace → Free 降格 |

---

## Phase 7: 公開準備（1 日）

| # | 項目 | 日数 | 完了条件 |
|---|---|---|---|
| 7.1 | プライバシーポリシー・利用規約公開 | 0.3 | Web で参照可能 |
| 7.2 | Chrome Web Store 申請（dev account）| 0.3 | 審査提出 |
| 7.3 | LP（公式 profile カタログ）公開 | 0.4 | SEO 流入経路確保 |

---

## マイルストーン

| Milestone | 日 | 内容 |
|---|---|---|
| M1 | Day 7 | ローカル完結スクレイピング動作（Phase 1 完）|
| M2 | Day 11 | Element Picker で profile 作成可能（Phase 2 完）|
| M3 | Day 17 | サブスク + profile 配信が機能（Phase 3-5 完）|
| M4 | Day 23 | 配信先 + UX 完成・社内 β 開始（Phase 6 完）|
| M5 | Day 24 | Chrome Web Store 申請（Phase 7 完）|

合計 **約 24 営業日**。

---

## Phase 別の主要 KPI

| Phase | KPI |
|---|---|
| 1 | 主要 3 サイトで profile 実行成功 |
| 2 | 非エンジニア（社内テスター）が 5 分以内に profile 作成 |
| 3 | login → subscription 反映までの所要時間 < 5 秒 |
| 4 | 公式 profile 配信レイテンシ < 200ms |
| 5 | 破損検知から自動修正までの体感時間 < 24h |
| 6 | webhook 送信成功率 > 99% |

---

## MVP 後のフェーズ

### Phase A: AI 解析（5 日）
- /ai/analyze エンドポイント
- 解析テンプレ（要約 / 分類 / エンティティ抽出）
- UI 統合

### Phase B: クラウド同期（5 日）
- /sync/items エンドポイント
- 拡張側 sync queue
- 複数 PC 間の merge ロジック

### Phase C: 公式 profile 拡充（継続）
- カバーサイトを 10 → 30 → 50 へ
- canary 監視自動化
- AI セレクタ修復（Pro 機能）

### Phase D: Enterprise 受託フロー（3 日）
- カスタム profile 作成依頼 UI
- 内部の作成 → 配信フロー
- SLA 管理

### Phase E: スケジュール実行（3 日）
- 「毎日 9:00 に取り込み」
- chrome.alarms 統合
- 通知の Webhook 送信

---

## 採用順序の根拠

1. **Phase 1-2 を優先**: 拡張だけで動く完結体験（Free 機能）を最初に固める。投資が無駄にならない
2. **Phase 3-4 を並列**: サーバ側は別開発者が並行可能
3. **Phase 5 で接続**: 拡張 ⇄ サーバを統合
4. **Phase 6 で仕上げ**: 配信・UX は最後に磨く（途中で変更が入りやすい）
5. **Phase 7 は最小**: 公開準備は実装が固まってから

---

## リソース見積もり

- 開発者: 1-2 名（フロント + サーバの両方ができる人）
- デザイナー: 0.5 名（Side Panel UI のデザイン）
- 公式 profile 担当: 0.5 名（リリース後継続）

総工数: 開発 24 日 × 1.5 名 ≈ **36 人日**。

---

## リスク要素と対応

| リスク | Phase | 対応 |
|---|---|---|
| Element Picker の精度不足 | 2 | テスター 5 名で実サイトテスト・必要なら +2 日 |
| Chrome Web Store 審査落ち | 7 | 早期に dev account で予備審査・<all_urls> 回避 |
| Stripe 業種審査 | 3 | 汎用業務支援ツールとして申請・問題なら PAY.JP に切替 |
| Profile 配信の運用負荷 | 4 後 | canary 自動化を MVP 後に・初期は 10 サイトに絞る |
| サーバ側のスケール問題 | 全般 | 初期は Render Standard で十分・成長後に DB プラン Up |
