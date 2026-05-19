<!-- file: docs/scraper-extension/security.md -->

# ClipLayer セキュリティ・プライバシー方針

## 1. 基本方針

1. **データはユーザーのもの**: デフォルトでローカル保存・外部送信は明示設定時のみ
2. **拡張機能の本質的限界を受け入れる**: 改造を完全防御せず、改造の意味を消す設計
3. **プライバシー by default**: テレメトリ・AI 解析・クラウド同期は明示 opt-in
4. **対象サイトと第三者への配慮**: 利用規約で正当アクセスのみを許可

---

## 2. 拡張機能の本質的限界

| 項目 | 状況 |
|---|---|
| ソースコード | DevTools で全閲覧可 |
| IndexedDB | DevTools で全閲覧可 |
| chrome.storage.local | DevTools で全閲覧可 |
| Service Worker | 解析可・改造可 |
| Manifest | 改変可（local install で） |

これらは Chrome 拡張機能の仕様であり、変えられない。よって設計は:

- 機密データを拡張機能内に置かない（API キー等は サーバ proxy 経由）
- 価値の本体をサーバに置く（profile 配信・AI 解析）
- 改造可能性を前提に、改造で得られる物を減らす

---

## 3. データ取り扱い方針

### 3.1 保存
- ローカル: IndexedDB（Dexie）+ chrome.storage
- サーバ: PostgreSQL（ユーザー / サブスク / 公式 profile / 監査のみ）
- 抽出データ（items / images）は **デフォルトでサーバに保存しない**

### 3.2 送信
- Webhook / CSV / クラウド同期は明示設定
- 設定済み送信先以外には絶対送らない
- サーバ経由の中継はしない（webhook は拡張から直接送信）

### 3.3 PII 検出と扱い
- メール・電話番号・クレカ番号らしき文字列を正規表現で検出
- 該当アイテムに `flags.pii = true` を付与
- AI 解析時にデフォルトで PII フィールドを除外
- ユーザーがクラウド同期を有効にする際、PII を含む可能性を明示警告

```typescript
// src/scraping/pii-detector.ts
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  phoneJp: /(0\d{1,4}-\d{1,4}-\d{4}|0\d{9,10})/,
  creditCard: /\b(?:\d[ -]*?){13,19}\b/,
};

export function detectPII(fields: Record<string, string | number | null>): boolean {
  return Object.values(fields).some((v) => {
    if (typeof v !== "string") return false;
    return Object.values(PII_PATTERNS).some((p) => p.test(v));
  });
}
```

### 3.4 ローカルデータの暗号化
- 機密性が高いユーザー向けに、IndexedDB の Blob・特定フィールドを Web Crypto で暗号化保存するオプションを将来検討
- MVP では設定で「機密モード」を提供せず・拡張のセキュリティ警告で「DevTools から見える」ことを明示

---

## 4. 通信のセキュリティ

### 4.1 サーバ通信
- 全エンドポイント HTTPS 必須
- Access Token は短命（15 分）
- Refresh Token は rotation + device 紐付け
- CORS は許可された拡張 ID のみ
- TLS 1.2 以上

### 4.2 webhook 送信
- HTTPS 必須・http:// は警告して deny
- 任意ヘッダ設定可（ユーザーの Webhook 認証用）
- 送信元 IP の固定は不可（拡張からの直接送信のため）
- 受信側で署名検証が必要なら、profile に shared secret を持たせて HMAC ヘッダ付与

```typescript
function signPayload(secret: string, payload: string): string {
  // HMAC-SHA256
  return computeHmacSha256(secret, payload);
}
// Header: X-ClipLayer-Signature: sha256=<hex>
```

### 4.3 対象サイトへの fetch
- content script で `credentials: "include"`
- 対象サイトのセッション Cookie が自動付与
- 拡張側に Cookie を保存しない・読まない

---

## 5. 認証情報の保護

### 5.1 ClipLayer 認証
- Access Token: chrome.storage.session（ブラウザ閉じで消える）
- Refresh Token: chrome.storage.local + AES-GCM 暗号化（device key 派生）
- ユーザーパスワード: bcrypt（cost 12+）でハッシュ・サーバ DB のみ

### 5.2 対象サイト認証
- ClipLayer は対象サイトの認証情報（ID / パスワード / Cookie）を **一切扱わない**
- ユーザーが対象サイトに自分でログインしているセッションを利用するのみ
- これにより認証情報漏洩リスクをゼロに保つ

### 5.3 API キー（Webhook 用等）
- ユーザー設定の API キー（任意の Webhook 認証）は IndexedDB に保存
- 暗号化オプションを将来追加検討
- AI 解析用 API キーは **ClipLayer 側で保有**・ユーザーには提供しない（コスト管理）

---

## 6. 利用規約と法的配慮

### 6.1 ToS 必須記載
- 対象サイトの利用規約・robots.txt を遵守する責任はユーザー
- 公開データのみを対象とする（認証突破は ClipLayer の機能外）
- 第三者の個人情報を取得する場合は法令遵守をユーザー責任とする
- スクレイピング起因の対象サイト・第三者への損害は ClipLayer 不問

### 6.2 公式 profile の前提
- 公式 profile は **「ログイン後のユーザー自身のデータ」を対象** とする
- 例: 楽天 RMS 注文一覧（=自店舗の注文）・Amazon Seller 在庫（=自分の出品）
- 第三者の個人情報を一括取得する profile は配信しない
- 競合分析 / 価格情報取得など第三者データの profile はユーザー自作扱い

### 6.3 オンボーディング同意
- 初回起動時に利用規約・プライバシーポリシーを表示
- 同意必須・`acknowledgedTermsAt` を保存
- profile 作成時にも「このサイトの規約を確認しましたか？」確認

### 6.4 GDPR / 個人情報保護法
- ユーザーデータの開示・訂正・削除請求に対応
- アカウント削除 → 関連データ物理削除（90 日内）
- 利用ログの保持期間明示
- データ処理者契約（DPA）を法人顧客に提供

---

## 7. 改ざん検知

### 7.1 self-check の限界
- 改ざん検知ロジック自身も改造可
- 検知できるのは「素朴な改変」のみ
- 過剰投資しない・サーバ報告のみで block しない

### 7.2 サーバ側異常検知

| 検知ルール | アクション |
|---|---|
| 同一 deviceId で 1 時間 100 回以上 refresh | refresh token revoke + 通知 |
| license 期限切れなのに API 呼び出し | warn ログ・累積で device suspend |
| 同一 IP から 1 日 10 個以上の deviceId 登録 | IP block + アカウント調査 |
| 不正な署名でリクエスト送信 | INVALID_REQUEST 連発で rate limit 強化 |

### 7.3 ライセンス共有検知
- 同一 deviceId が複数 IP で短時間に観測
- VPN 等の正当なケースもあるため、即停止せず累積評価
- 月 N 回以上の異常パターンで warn メール送信

---

## 8. Chrome Web Store 配布

### 8.1 審査対策
- `<all_urls>` は使わず `optional_host_permissions` で個別許諾
- プライバシーポリシーを公開 URL で提供
- 機能説明の動画・スクリーンショット完備
- 単一目的の説明: 「Web ページからユーザーがデータを取得するための支援ツール」

### 8.2 機密度の高い permission
- `host_permissions` / `tabs` / `activeTab` の用途を明示
- データ収集の宣言: ユーザーが指定したサイトからの DOM 抽出のみ
- リモートコード実行なし（CSP で禁止）

### 8.3 アップデート時の注意
- バージョン更新で permission を増やす場合、ユーザー再同意が必要
- 重大な機能変更時は changelog で明示

---

## 9. インシデント対応

### 9.1 想定インシデント

| シナリオ | 初動 | 後続 |
|---|---|---|
| 公式 profile に誤った selector が含まれる（誤データ抽出）| 該当 profile を deprecate・全ユーザーに通知 | 修正版 publish |
| 拡張機能の脆弱性（XSS 等）| 該当バージョンを撤回・修正版緊急 publish | ユーザー通知・root cause 分析 |
| サーバ DB 漏洩 | 該当ユーザーへ通知（72 時間内）・パスワード強制リセット | 個人情報保護委員会への報告 |
| profile 配信用秘密鍵漏洩 | 鍵を rotate・拡張に新公開鍵を含む緊急アップデート配布 | 旧鍵で署名された全 profile を deprecate |
| 大量改ざん検知 | 該当 device 全 revoke・運営側調査 | 防御層の追加検討 |

### 9.2 Runbook
- 上記シナリオごとに対応手順書を整備（MVP 後）
- 連絡経路: support@cliplayer.app・運営 Slack
- ユーザー通知: in-app banner + メール（重大時）

---

## 10. プライバシーポリシー雛形（要約）

### 10.1 取得する情報
- アカウント情報: メール・パスワードハッシュ
- 利用情報: ログイン履歴・device 情報・サブスク状態
- テレメトリ（opt-in 時）: 操作イベント・拡張バージョン
- 改ざん検知レポート: 自動送信される（PII を含まない）

### 10.2 取得しない情報
- 対象サイトの認証情報
- 対象サイトから取得したデータ（クラウド同期 opt-in 時を除く）
- ブラウジング履歴
- IP アドレス（ログ目的でのみ・短期保持）

### 10.3 第三者提供
- 決済プロバイダ（Stripe 等）: 決済情報
- AI 解析プロバイダ（Anthropic 等）: 解析対象データ（Pro + 明示利用時）
- サーバホスティング（Render 等）: 一般運用上のデータ預託

### 10.4 保存期間
- アカウント: 削除請求から 90 日後物理削除
- 監査ログ: 1 年
- テレメトリ: 6 ヶ月

---

## 11. 開発時のセキュリティ

### 11.1 シークレット管理
- 環境変数経由（`.env` は git ignore）
- 本番は Render / Railway の secret 管理機能使用
- profile 署名秘密鍵は HSM or Secret Manager（GCP Secret Manager / AWS Secrets Manager）

### 11.2 依存性監査
- `npm audit` を CI で実行
- Dependabot を有効化
- `gitleaks` を pre-commit に追加

### 11.3 CSP（拡張側）
- `script-src 'self'`（バンドル済 JS のみ）
- `eval` 禁止
- 外部 inject 禁止

### 11.4 CSP（サーバ Web）
- 標準的なヘッダセット（Helmet 相当）
- 管理画面に X-Frame-Options: DENY

---

## 12. セキュリティレビュー（MVP 前必須項目）

- [ ] 全 API エンドポイントの認証チェック
- [ ] CORS の拡張 ID 制限
- [ ] Refresh Token rotation 動作確認
- [ ] device 上限の enforcement
- [ ] レート制限の動作
- [ ] PII 検出ロジックのテスト
- [ ] 利用規約 / プライバシーポリシー公開
- [ ] webhook 送信のシークレット署名
- [ ] AI Proxy の plan/quota 検証
- [ ] 改ざん検知の self-check
- [ ] 依存性監査（npm audit clean）
- [ ] secret leak 検査（gitleaks clean）
