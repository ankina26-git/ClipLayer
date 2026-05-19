<!-- file: docs/scraper-extension/subscription.md -->

# ClipLayer サブスクリプション設計

## 1. 根本思想

Chrome 拡張機能はソース改造で auth gate を外せる。完全防御は不可能。よって防御戦略を:

**「DRM をかける」ではなく「保守そのものをサーバ依存にする」**

に置く。

| 観点 | 従来の auth gate | profile 配信モデル |
|---|---|---|
| 改造で外せるか | コード書き換えで外せる | **外せない**（profile は別資産） |
| 時間経過 | 一度外されたら永久 | **対象サイトが変わると古い profile は使えない** |
| サブスク正当化 | 弱い | 強い（保守料は本物の価値） |
| 解約後の挙動 | 機能即死 → 反発 | 既存 profile は動く → 自然な解約 |

公式 profile を **継続的に保守し配信する** こと自体がサブスクの価値であり、これがコピー対策の本体になる。

---

## 2. プラン設計

シンプルな 2 階層モデル。複数 tier の出し分けは UX 複雑化を招くため採用しない。

| プラン | 価格 | 自作 profile | 公式 profile | 自動更新 | 動的巡回 | デバイス数 |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **Free** | ¥0 | 1 枠 | × | × | × | 1 |
| **有料** | ¥700/月（年額 ¥7,000）| 無制限 | ◯ 全サイト | ◯ + 破損検知 | ◯ | 3 |

### 2.1 各プランの位置付け

- **Free**: 自作 profile を書ける人向け・布教用。改造で gate を外しても得られる体験はここまで
- **有料**: 公式 profile の保守追従が中核価値。「コードを書かずに継続的に動くツール」を求める層

### 2.2 価格根拠

- ¥700/月 = 月 1,000 円以下の心理的ハードル下回り・「コーヒー 2 杯分」の納得感
- 月 1 サイト分の手動作業時間 1-2 時間と仮定 → 時給換算で十分元が取れる
- AI 解析・クラウド同期を MVP から外したことでサーバ運用コストが低く、低価格でも持続可能
- 年額 ¥7,000 は実質 2 ヶ月分割引

### 2.3 デバイス上限の役割

- 同一アカウントの過度なシェア防止
- 上限超で新規 login 拒否（既存デバイス revoke 必須）
- Web 側で「デバイス一覧」管理 UI を提供

### 2.4 損益分岐

| 項目 | 月額 |
|---|---|
| サーバホスティング（Render Standard）| 〜¥3,000 |
| ドメイン・SSL・メール | 〜¥500 |
| profile 保守の人件費（10 サイト想定）| 〜¥30,000 |
| 決済手数料 | 売上 × 4% |
| **固定費合計** | **約 ¥33,500/月** |

→ 黒字化に必要な有料ユーザー数: 約 **50 ユーザー**
→ 開発費 ¥1,800,000 を 1 年で回収するには: 約 **225 ユーザー**

### 2.5 「1 拡張 = 1 アカウント = 1 サブスク」の構造的意味

ClipLayer は **意図的に「1 拡張インストール = 1 アカウント = 1 サブスク」** という単純な紐付けにする。明示的なチームプランや組織管理機能は MVP では作らない。

| 状況 | 結果 |
|---|---|
| 個人ユーザー | 1 アカウント・¥700/月 |
| 50 人の中小企業の全社導入 | 50 アカウント・¥35,000/月 |
| 受託会社が顧客 10 社に納品 | 10 アカウント分の継続収益 |

これは制約ではなく **収益スケールの構造的レバー**:

- 明示的なチームプランを作らずとも、社内導入が広がれば自動的に収益が増える
- 同一企業 50 名導入 = 単一の中規模顧客と同等の MRR
- maxDevices = 3 で「1 アカウントで複数 PC を使う」は許容しつつ、人数分のシェアは技術的に困難（業務利用なら個別アカウントが自然）

明示的な「チーム機能」（profile 共有・統合請求・組織管理）は、企業からの需要が積み上がった段階で後付け検討。MVP で先回りしない。

---

## 3. 防御の階層

### A. サーバ側に価値を置く（★★★★★）
- 公式 profile 配信 → サーバ必須
- 改造でクライアント gate を外しても、サーバが応答しなければ無価値

### B. JWT + heartbeat（★★★★）
- Access Token 15 分・短命
- Refresh Token 30 日・rotation
- 60 分ごとの heartbeat で license 再検証
- 連続失敗 7 日（grace period）後にロック

### C. 一部を WASM 化（★★★・任意）
- ライセンス検証ロジックを Rust → WASM 化
- JS よりは静的解析が困難
- 過剰投資しない（B の補強として）

### D. コード難読化（★★）
- Terser で mangle + drop_console
- 時間稼ぎ目的
- 低コストなので採用

### E. 改ざん検知（★★）
- 起動時に bundle / manifest のハッシュ自己検証
- 検知してもブロックしない（誤検知リスク）
- サーバに報告のみ

---

## 4. 公式 profile 配信モデル（核心）

### 4.1 全体フロー

```
[Selector 監視チーム / canary scraper]
    │ profile 更新（yaml/json 編集）
    ▼
[CI / 署名スクリプト（Ed25519 秘密鍵）]
    │ profile@version + signature
    ▼
[Profile Registry on Server]
    │ GET /profiles : 有料ユーザーのみ配信
    ▲
    │ JWT 認証
    │
[Extension]
    ├─ 起動時 + 24h ごと sync
    ├─ 抽出失敗時に即時 sync
    └─ Ed25519 公開鍵で署名検証 → IndexedDB 反映
```

### 4.2 鍵管理

- 秘密鍵: サーバ側 HSM or Secret Manager 内・絶対に出さない
- 公開鍵: 拡張機能のビルド時に注入（公開しても問題ない）
- 攻撃者が偽 profile を作っても秘密鍵がないため署名できない
- ユーザーが公開鍵を書き換えても、API 認証なしでは正規 profile を取れない

### 4.3 署名アルゴリズム

```typescript
function canonicalize(profile: ServerProfile): string {
  const { signature, ...rest } = profile;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

async function verifyProfileSignature(p: ServerProfile): Promise<boolean> {
  const data = new TextEncoder().encode(canonicalize(p));
  const sig = base64ToBytes(p.signature);
  return crypto.subtle.verify(
    { name: "Ed25519" }, await getPublicKey(), sig, data,
  );
}
```

### 4.4 破損検知 → 自動修正

```
1. ユーザー実行時に「必須フィールド欠落」「item 数 0」検知
2. profile.brokenSince = now() 設定
3. サーバへ POST /profiles/:id/report-broken
4. 即 syncProfiles 起動（新版があれば適用）
5. 同サイトの破損報告が複数届く → サーバ運営アラート
6. 運営が selectors 修正 → version + 1 で publish
7. 全有料ユーザーが次の sync で受信
8. 「自動で直った」体験
```

これがサブスクの体感価値の最大化。

---

## 5. 認証フロー

### 5.1 トークン保管

| 種類 | 保管場所 | 寿命 | 理由 |
|---|---|---|---|
| Access Token | chrome.storage.session | 15 分 | ブラウザ閉じで消える |
| Refresh Token | chrome.storage.local（AES-GCM 暗号化）| 30 日 | 永続化必要・暗号化で抜き取り難易度を上げる |
| Device Key | chrome.storage.local（不可逆ハッシュ）| 恒久 | 暗号化キーの派生元 |

### 5.2 Refresh Token 暗号化

```typescript
async function deriveKey(deviceId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw", enc.encode(deviceId), "PBKDF2", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("cliplayer-v1"),
      iterations: 100_000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}
```

deviceId 自体は chrome.storage.local にあるため絶対防御ではない。**抜き取りコストを上げる目的**。

### 5.3 ログインフロー

```
1. ユーザーがメール + パスワード入力
2. extension → POST /auth/login { email, password, deviceId, deviceName }
3. サーバ: 認証 → device 登録 → JWT (15min) + Refresh Token (30d) + License Snapshot 返却
4. extension: Access Token → session storage / Refresh Token → 暗号化して local storage / License → IndexedDB
5. heartbeat スケジュール（60 分間隔）
```

### 5.4 Refresh フロー

```
1. Access Token 期限切れ or heartbeat タイマー
2. extension → POST /auth/refresh { refreshToken (復号), deviceId }
3. サーバ: 検証 → 旧 token revoke → 新 token + 新 Refresh + 最新 License 返却
4. extension: 保管 + License Snapshot 更新
```

### 5.5 デバイス上限

- login 時に「現在の device 数 >= maxDevices」なら 409 Conflict
- レスポンスに「既存デバイス一覧 + revoke 操作」の Web URL を返す
- ユーザーが Web 管理画面で revoke → 再 login

---

## 6. Feature Gate

### 6.1 license snapshot

```typescript
interface LicenseSnapshot {
  userId: string;
  plan: "free" | "paid";
  features: string[];               // ["official_profiles", "detail_traversal", ...]
  maxProfiles: number;
  maxDevices: number;
  expiresAt: number;
  snapshotAt: number;
  signature: string;
}
```

### 6.2 gate 関数

```typescript
const GRACE_DAYS = 7;

export async function requireFeature(feature: string): Promise<void> {
  const snap = await licenseStore.get();
  if (!snap) throw new LicenseError("not_logged_in");

  const now = Date.now();
  const expired = snap.expiresAt < now;
  const stale = now - snap.snapshotAt > GRACE_DAYS * 86_400_000;
  if (expired && stale) throw new LicenseError("expired");

  if (!snap.features.includes(feature)) {
    throw new LicenseError("feature_not_in_plan");
  }
}
```

### 6.3 サーバ側の二重検証

クライアント gate は UX 用。**本体はサーバの検証**。

```typescript
async function getProfiles(req: Request) {
  const user = await authenticate(req);
  const subscription = await getActiveSubscription(user.id);
  if (subscription.plan !== "paid") {
    return { profiles: [] };  // Free は空配列を返す
  }
  // 有料ユーザーには全 profile を返す
}
```

クライアント gate を改造で外しても、サーバは Free ユーザーに公式 profile を返さない。

---

## 7. 決済プロバイダ

**Stripe を採用**（確定）。

### 7.1 採用理由

- サブスク機能が成熟・実装容易
- ClipLayer は汎用業務支援ツール扱いで業種審査の懸念が小さい
- 国際展開を視野に入れる場合に有利
- webhook 統合が標準化されている

### 7.2 商品設計

| 項目 | 値 |
|---|---|
| Product | ClipLayer Paid Plan |
| 月額 Price | ¥700 JPY / month |
| 年額 Price | ¥7,000 JPY / year（実質 2 ヶ月分割引）|
| Trial | 14 日無料 |
| Tax behavior | 内税表示（日本向け） |

### 7.3 webhook 統合

```
Stripe → webhook → /webhooks/stripe
  ├─ checkout.session.completed     → subscription 作成
  ├─ invoice.paid                   → 期間延長・status='active'
  ├─ invoice.payment_failed         → status='past_due'
  └─ customer.subscription.deleted  → status='canceled'
```

サブスク状態変更時に license snapshot を再発行 → 拡張に反映。

### 7.4 Stripe Customer Portal

解約・支払い方法変更・請求書ダウンロード等は Stripe Customer Portal を利用。自前実装を避けて運用コストを下げる。

---

## 8. 解約 UX

### 8.1 解約フロー

```
1. Web 管理画面で「サブスクを解約」（Stripe Customer Portal にリダイレクト）
2. 確認ダイアログ（「現在の期間終了まで利用可能」表示）
3. Stripe で cancel_at_period_end = true
4. 期間終了時に status='canceled' → Free 降格
5. 拡張の次の heartbeat で license 更新
6. 公式 profile は受信停止・既存版は残る
7. Side Panel に「Free に降格しました」表示
```

### 8.2 即時死を避ける設計

- 解約直後にすべての機能停止すると反発が大きい
- 既存 profile は動かし続ける（profile データは IndexedDB に残る）
- 自動更新のみ停止 → 自然にサイト変更で動かなくなる
- 「ユーザーが必要を感じたら再契約」という流れを作る

### 8.3 grace period

- サブスク失効後 7 日は有料機能継続
- これでカード期限切れ等の偶発的失効をリカバリ

---

## 9. 改ざん検知

### 9.1 self-check

```typescript
const KNOWN_HASH = "__BUILD_TIME_BUNDLE_HASH__";

export async function selfCheck(): Promise<boolean> {
  const manifestText = await fetch(chrome.runtime.getURL("manifest.json"))
    .then((r) => r.text());
  const hash = await sha256(manifestText);
  if (hash !== KNOWN_HASH) {
    void reportTamper({ kind: "manifest_modified", actualHash: hash });
    return false;
  }
  return true;
}
```

- 検知しても **ブロックしない**（誤検知が UX を破壊するため）
- サーバに通知してログに残すのみ

### 9.2 サーバ側の異常検知

- 同一 deviceId からの異常 refresh 頻度
- license 期限切れなのに API 呼び出しが来る
- 短時間に多数の deviceId が同一 IP から登録（ライセンス共有疑い）

検知時の対応:
- refresh token revoke
- 異常 device に warn メール
- 累積で repeat offender はアカウント停止

---

## 10. レート制限

サーバ側の全エンドポイントに plan ベース rate limit:

| エンドポイント | Free | 有料 |
|---|---|---|
| /auth/refresh | 60/h | 60/h |
| /profiles GET | 24/d | 24/d |
| /profiles/report-broken | 10/d | 1000/d |
| /telemetry/tamper | 100/d | 100/d |

実装は Redis ベースの sliding window。

---

## 11. 想定攻撃シナリオと対策

| 攻撃 | 対策 |
|---|---|
| ソース改造で auth gate を外す | サーバ側で plan 再検証・profile 受信不可 |
| 公開鍵を書き換えて偽 profile を食わせる | API 認証なしでは取得不可・配布チャンネルが攻撃者にない |
| 1 アカウントを複数人で共有 | maxDevices で物理制限・異常検知 |
| API キー流出 | 短命 access token + rotation |
| Refresh Token 抜き取り | AES-GCM 暗号化 + device 紐付け（他端末で使えない） |
| extension ID 偽装で webhook 受け取り | サーバ側で `Origin: chrome-extension://<我々の ID>` のみ受け付け |

---

## 12. 改造耐性の現実評価

| ユーザー層 | 改造する可能性 | 影響 |
|---|---|---|
| 業務利用の中小企業 | ほぼゼロ | サブスク継続 |
| 個人事業主 | 低 | サブスク継続 |
| 技術好きの個人 | 中 | Free 層に流れる・大した売上影響なし |
| 競合の調査 | 高 | 仕方ない・profile 配信は遮断できる |
| 海賊版配布業者 | 中 | profile 取れないので価値が低い |

**割り切り**: 完全防御は無理。コア機能の改造は受け入れ、価値の本体を保守追従に置く。

---

## 13. 補助収益: プロファイル作成代行サービス

サブスクとは別に、**¥2,000/件** の単発サービスを提供する。Element Picker を使えない / 使いたくないユーザーの受け皿。

### 13.1 サービス内容

ユーザーから依頼を受けて、ClipLayer 運営が対象ページの profile（selector 設定）を代行作成する。

```
1. ユーザーが Web フォームから依頼
   - 対象 URL
   - 取得したいフィールド一覧
   - スクリーンショット or サンプル画像
   - 配信先（Webhook / CSV / なし）
2. 運営が 1-3 営業日で profile 作成
3. 完成 profile をユーザーアカウントに「自作 profile」として配布
4. 動作確認 OK で決済（Stripe Checkout 単発）
5. 不備があれば 1 回まで無料修正
```

### 13.2 公式 profile への昇格パス

同一サイト・類似ニーズの依頼が **3 件以上** 集まったら公式 profile 化候補にする:

- 公式化された場合、過去の依頼者には「以後は自動更新対象になります」と通知（追加課金なし）
- 個別依頼で集めた知見が公式 profile の質を底上げする
- 代行サービスは **公式 profile 候補のリードソース** としても機能する

### 13.3 ビジネスとして成立する条件

| 項目 | 値 |
|---|---|
| 想定工数 / 件 | 30-60 分 |
| 単価 | ¥2,000 |
| 時給換算 | ¥2,000-4,000 |
| 月間処理可能件数（1 人）| 30-40 件 |
| 月間想定収益（フル稼働）| ¥60,000-80,000 |

大量受注は受けない（人力工数の問題）。月 20 件で十分な副収益。

### 13.4 やらない事

- 認証突破が必要な依頼（ログイン代行・CAPTCHA 解除）
- 利用規約違反が明白な対象サイト
- 第三者の個人情報を一括取得する目的の依頼
- 月額の保守契約（公式化されるか・自分で picker を使うかに誘導）

### 13.5 Enterprise 受託との関係

- 単発代行: ¥2,000/件・1-3 営業日・公式化候補
- Enterprise（将来）: 月額保守契約・SLA・専任サポート（需要が出てから設計）

MVP では Enterprise tier を作らず、代行サービスだけで対応。

---

## 14. KPI

| KPI | 目標 |
|---|---|
| 有料転換率（Free → 有料）| 25% |
| 月次解約率 | < 5% |
| ARPU | ¥700 |
| profile 自動修正成功率 | > 90% |
| 改ざん検知レポート数 / アクティブユーザー | < 1% |
| 黒字化までの月数 | 6 ヶ月以内（有料 50 ユーザー獲得）|
| 開発費回収までの月数 | 12 ヶ月以内（有料 225 ユーザー獲得）|
| プロファイル作成代行 受注件数 | 月 20 件 |
| 代行 → 公式化 転換率 | 30%（3 件依頼で 1 件公式化）|
