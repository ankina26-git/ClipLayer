# Chrome Web Store Listing Text

## Detailed Description

ClipLayer は、ユーザーがアクセス権を持つ Web ページ上の一覧データを、クリック操作で指定した項目に従って抽出し、ローカルに保存・確認できる Chrome 拡張機能です。

業務用の管理画面、予約一覧、注文一覧、社内ツールなど、ログイン後に表示されるページから必要な情報を取り出す作業を支援します。Element Picker を使うと、ページ上の行や項目をクリックして抽出 Profile を作成できます。作成した Profile はブラウザ内に保存され、同じ形式のページで再利用できます。

抽出結果、Profile、設定、実行履歴は既定ではブラウザ内に保存されます。ユーザーの明示的な操作や設定なしに、取得したページ内容を外部サーバーへ送信することはありません。

## Single Purpose

ユーザーがアクセス権を持つ Web ページ上の一覧データを、クリック操作で指定した項目に従って抽出し、ローカルに保存・確認できるようにすることです。

## Permission Justifications

### sidePanel

抽出 Profile の選択、現在ページで利用可能な Profile の確認、抽出実行、履歴確認、Element Picker の開始操作を、ユーザーが閲覧中のページを離れずに行うために使用します。

### storage

ユーザーが作成した Profile、抽出履歴、設定、実行結果をブラウザ内に保存するために使用します。保存されたデータは既定ではローカルに保持され、ユーザーの明示操作なしに外部へ送信されません。

### tabs

現在アクティブなタブの URL とタイトルを確認し、そのページに一致する Profile を表示するために使用します。タブ内容を常時監視する目的では使用しません。

### Host Permissions

ユーザーが選択した Web ページ上で、Element Picker による項目指定と、Profile に基づくデータ抽出を実行するために必要です。対象はユーザーが自分で開き、アクセス権を持つページに限定されます。

### Remote Code

リモートコードは使用しません。拡張機能で実行される JavaScript と CSS はすべてパッケージ内に同梱されています。外部サーバーから取得したスクリプトを実行することはありません。

## Data Use Disclosure

ClipLayer は、ユーザーが明示的に操作したページから、ユーザーが指定した項目のみを抽出します。抽出結果、Profile、設定、履歴は既定ではブラウザ内に保存されます。ユーザーの明示的な設定や操作なしに、個人情報や閲覧データを第三者へ販売、共有、送信することはありません。

## Privacy Policy URL

Use this URL after pushing to GitHub:

```text
https://github.com/ankina26-git/ClipLayer/blob/main/docs/privacy-policy.md
```
