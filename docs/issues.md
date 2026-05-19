<!-- file: docs/scraper-extension/issues.md -->

# ClipLayer 課題一覧

## ルール

- 課題のみ記載する。概要・更新履歴・セッションログは書かない
- 1 課題 1 行。補足が必要なら直下に 1 行のみ
- ステータス: `[ ]` 未着手 / `[x]` 完了 / `[-]` 後回し
- 優先度: **高**（MVP 前）/ **中**（MVP 中）/ **低**（後続）

---

## 高優先度 — MVP 実装前に決める

### サービス基盤

- [x] サービス名の決定（ClipLayer に確定）
- [ ] ドメイン取得（cliplayer.app / cliplayer.io / cliplayer.com を候補）
- [ ] ロゴ・ブランドカラー
- [ ] 法人名・運営者表記（特商法・利用規約用）
- [ ] プライバシーポリシー・利用規約の本文確定
- [ ] サポート連絡先（メール / フォーム）

### 決済・サブスク

- [ ] 決済プロバイダ確定（Stripe を本命・PAY.JP / SBPS をバックアップ）
- [ ] プラン価格の最終確定（Basic ¥1,980 / Pro ¥4,980 が案）
- [ ] 年額プランの有無と割引率
- [ ] トライアル期間の有無（14 日無料案）
- [ ] 業種審査リスクの確認（Stripe support に事前照会）
- [ ] エージェント手数料モデルの有無（受託会社向け再販）

### 拡張機能技術

- [ ] Chrome Web Store 開発者アカウント取得（$5）
- [ ] Element Picker 検出アルゴリズムの精度検証（社内テスター 5 名）
- [ ] iframe 内コンテンツ対応の優先度（楽天 RMS が iframe 多用）
- [ ] SPA 遅延ロードへの対応方針（MutationObserver の活用範囲）
- [ ] WASM 採用の判断（ライセンス検証の難読化用）

### サーバ・インフラ

- [ ] ホスティング先確定（Render / Railway / Fly.io）
- [ ] DB プラン（初期は最小構成）
- [ ] profile 署名鍵の管理場所（GCP Secret Manager / AWS Secrets Manager / Vault）
- [ ] CI/CD パイプライン（GitHub Actions）
- [ ] エラー追跡（Sentry の採用判断）

### Profile 配信

- [ ] 公式 profile カバーする初期 10 サイトの選定
  人気 EC（楽天 / Shopify / Amazon Seller）+ 予約系 SaaS 中心の想定
- [ ] profile 監視（canary scraper）の運用フロー
- [ ] profile 修正担当の体制（運営側で誰がやるか）
- [ ] profile の changelog 記載ルール

### 法的・コンプライアンス

- [ ] 利用規約に「対象サイト規約の遵守はユーザー責任」明記
- [ ] 第三者個人情報を含む可能性のある profile の扱い方針
- [ ] GDPR 対応（EU からのアクセスがある場合）
- [ ] 個人情報保護法 33 条（開示請求）への対応窓口
- [ ] 特定商取引法表記
- [ ] 反社会的勢力排除条項

---

## 中優先度 — MVP 開発中に決める

### UX 詳細

- [ ] オンボーディングフロー（初回 30 秒ツアー）
- [ ] エラーメッセージの日本語コピー一覧
- [ ] サイドパネル UI のデザインシステム（shadcn/ui ベース？）
- [ ] アイコン・拡張バッジのデザイン
- [ ] 「公式 Profile が壊れています」通知の見せ方

### Element Picker 詳細

- [ ] パワーユーザー向けの XPath / 正規表現サポート範囲
- [ ] テーブル抽出モードの起動方法（自動判定 or 手動切替）
- [ ] ページネーション設定の picker 化（次へボタンの指定 UX）
- [ ] selector fallback（複数候補保持）の対応

### 配信先

- [ ] Google Sheets 連携の実装方式（OAuth 経由）
- [ ] Slack 連携（Webhook 経由でカバーするか専用 connector を作るか）
- [ ] Notion / Airtable 連携の優先度
- [ ] Email 送信（取り込み結果をメール）の有無

### サーバ機能

- [ ] AI 解析の対応タスク（要約 / 分類 / エンティティ抽出のどれを優先）
- [ ] AI プロバイダ確定（Anthropic vs OpenAI・コスト比較）
- [ ] クラウド同期の merge ロジック（複数 PC からの同時書き込み）
- [ ] テレメトリ収集項目の確定（プライバシー配慮）
- [ ] 監査ログの保持期間

### 課金詳細

- [ ] 同一プラン内のアップグレード / ダウングレード扱い（即時 / 期末）
- [ ] 返金ポリシー（請求エラー時など）
- [ ] 法人向け請求書発行（適格請求書対応）
- [ ] 解約後の grace period 期間（7 日案）

### 改ざん対策

- [ ] WASM 化する範囲の確定
- [ ] obfuscation レベル（terser 設定）
- [ ] 改ざん検知 + サーバ報告の負荷想定

---

## 低優先度 — 後続フェーズ

### 機能拡張

- [-] Firefox 対応（MV3 互換性次第）
- [-] Edge 対応（Chromium ベースなので大きな追加実装は不要見込み）
- [-] スケジュール実行（毎日 N 時に取り込み）
- [-] 多言語化（英語 UI）
- [-] チーム機能（複数ユーザーで profile / data 共有）
- [-] 通知系の高度化（条件付き通知・閾値超え警告）
- [-] OpenAPI 仕様の OAS 化（外部 SDK 配布）

### Profile 関連

- [-] profile のコミュニティ投稿機能（ユーザー作成 profile を公開）
- [-] profile マーケットプレイス（収益分配）
- [-] AI による profile 自動作成（DOM → selector 提案）

### エンタープライズ

- [-] SSO（SAML / OIDC）
- [-] 監査ログ高度検索
- [-] テナント分離（複数組織管理）
- [-] On-premises 配布

### 開発体制

- [-] OSS 部分の切り出し（Element Picker のみ公開等の検討）
- [-] 公開バージョンの API ドキュメント自動生成
- [-] パートナープログラム（受託開発会社向け）

---

## 検討事項（決まり次第ステータス付与）

### 戦略

- ClipLayer は Night Hub と完全独立で運営するか、関連会社として位置付けるか
- ClipLayer の対象市場は最初から国内 + 海外を視野に入れるか、国内特化か
- Free プランの提供を継続するか、有料のみに絞るか（後者は流入が落ちるリスク）

### 技術

- Service Worker と Offscreen Document の使い分け
- Dexie ではなく素の IndexedDB を使う選択肢
- React vs Solid.js / Svelte（Side Panel UI）
- Hono vs Elysia vs Next.js Route Handlers（サーバ）

### 運用

- 公式 profile の作成を外注するか内製するか
- 公式 profile の保守 SLA を契約として明記するか努力目標とするか
- ユーザーサポート（メール / Slack コミュニティ / Discord）

---

## リスク一覧

| リスク | 影響度 | 発生確率 | 対応状況 |
|---|---|---|---|
| 対象サイト運営者からの法的クレーム | 高 | 中 | 利用規約で明示・ToS 違反する profile は配信しない |
| Chrome Web Store 審査落ち | 高 | 中 | optional permissions・デモ動画準備 |
| 改造版の蔓延 | 中 | 中 | profile 配信モデルで実害を最小化 |
| 公式 profile 保守破綻 | 高 | 中 | 初期 10 サイトに絞る・canary 監視 |
| 決済プロバイダの業種審査 | 高 | 低 | 汎用ツールとして申請 |
| AI コストの暴騰 | 中 | 中 | 月次クォータ厳守・rate limit |
| 大手競合の参入（Microsoft / Google）| 中 | 低 | profile 配信の運用ノウハウで差別化 |
| 公式 profile 配信秘密鍵漏洩 | 高 | 低 | HSM 管理・rotation 手順整備 |
