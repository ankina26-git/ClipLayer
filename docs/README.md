<!-- file: docs/scraper-extension/README.md -->

# ClipLayer ドキュメント

ClipLayer は、Chrome 拡張機能として動作する **GUI 駆動の Web スクレイピングツール** です。テナント管理者・店舗運営者・データ収集担当など **非エンジニア** が、コードを書かずに DOM 抽出を設定・実行・継続運用できることを主目的とします。

> **ステータス**: 構想段階。本ディレクトリは初期設計ドキュメント群。Night Hub 本体とは独立した別プロジェクトとして開発する。

---

## サービス名

**ClipLayer** に決定。

> 由来: ページから情報を「Clip（切り取る）」+ ブラウザに「Layer（重ねる）」拡張機能というポジショニング。

---

## 一言で言うと

ログイン後の管理画面・EC・予約サイト・社内 SaaS などから、**ユーザーがクリック操作だけで** セレクタを設定し、データを取得して指定先（Webhook・API・CSV など）に送る Chrome 拡張機能。サブスクリプション課金。

---

## ドキュメント一覧

| ドキュメント | 用途 |
|---|---|
| [overview.md](overview.md) | サービス概要・想定ユーザー・提供価値・差別化 |
| [architecture.md](architecture.md) | システム構成・コンポーネント・Manifest V3 制約 |
| [workflows.md](workflows.md) | 主要 GUI ワークフロー（公式 profile 利用 / 自作 / 自動更新 / list→detail） |
| [element-picker.md](element-picker.md) | Element Picker（核心機能）の技術仕様 |
| [dynamic-traversal.md](dynamic-traversal.md) | 動的ページ巡回（list → detail）・SSR/SPA 自動切替・ProcessingView |
| [write-back.md](write-back.md) | 書き込み（別ページへの自動入力）・システム間転記・タスク化と一斉取り込み/一斉書き込み |
| [data-model.md](data-model.md) | データ保存設計（IndexedDB / chrome.storage / サーバ DB） |
| [subscription.md](subscription.md) | サブスクモデル（Free + ¥700 有料）・代行サービス・改ざん耐性 |
| [backend-api.md](backend-api.md) | サーバ API 仕様 |
| [security.md](security.md) | セキュリティ・プライバシー・利用規約方針 |
| [roadmap.md](roadmap.md) | MVP 開発順序・フェーズ別計画 |
| [issues.md](issues.md) | 未決事項・検討事項・リスク |

---

## 中心的な設計判断

1. **GUI 駆動が最優先**: コードを 1 行も書かずに profile 設定が完結することを必須要件とする
2. **サーバ依存で課金正当化**: 「対象サイトのアップデートに追従する保守料」がサブスクの根拠。改造で gate を外しても profile 更新は受け取れない構造
3. **送信先は汎用化**: Webhook / 任意 API / CSV。特定プロジェクト（Night Hub 等）に縛らない
4. **拡張は薄く保つ**: profile 配信・認証はサーバ側。拡張は「DOM 抽出 + ローカル保存 + 送信」に専念
5. **2 階層シンプル課金**: Free + 有料 ¥700/月の単一プラン。複数階層は採用しない
6. **1 拡張 = 1 アカウント = 1 サブスク**: 明示的なチームプランを作らずとも企業導入で自然に収益スケール
7. **AI / クラウド同期は MVP では持たない**: 継続コストを抑えて低価格を成立させる
8. **動的ページ巡回は MVP+1**: list → detail の網羅取得は最重要差別化だが MVP では型のみ・実装は Phase 8
9. **書き込みは抽出の対称機能**: 抽出データを別ページへ自動入力する転記を追加（[write-back.md](write-back.md)）。不可逆ゆえドライラン・1 件試行・冪等キーを必須化。一斉取り込み/一斉書き込みは Task/Job で束ねる。MVP では型のみ・実装は Phase 11 以降

---

## 次のステップ

1. `overview.md` / `subscription.md` で確定した方針を実装計画にトレース
2. `roadmap.md` の MVP Phase 0 を実装開始（プロジェクト骨格）
3. Stripe アカウント作成 + ¥700/月 サブスク商品設定
4. サーバ側リポジトリの切り出し（API + Profile Registry）

---

## Night Hub との関係

ClipLayer は **Night Hub から独立した汎用プロダクト** として開発するが、Night Hub は将来的に最初の B2B 顧客になり得る。Night Hub の ingestion ワーカーを ClipLayer に置き換えれば、SSRF 対策・worker scaling・Cloud Tasks 依存などの保守コストが消える。

このシナジーは設計の動機ではあるが、ClipLayer の機能は Night Hub に縛らず、Webhook で任意の送信先に対応できる汎用構造にする。
