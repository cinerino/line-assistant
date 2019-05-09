# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Unreleased

### Added

### Changed

- update @cinerino/api-nodejs-client

### Deprecated

### Removed

### Fixed

### Security

## v3.0.0 - 2019-03-10

### Changed

- @cinerino/api-nodejs-clientで再構築

## v2.5.2 - 2019-01-30

### Changed

- install @motionpicture/sskts-api-nodejs-client@5.0.0
- install @motionpicture/sskts-domain@27.0.0

## v2.5.1 - 2018-12-10

### Changed

- update sskts-domain

## v2.5.0 - 2018-06-10

### Changed

- 取引照会結果を複数注文アイテムタイプに対応。
- 取引レポートの内容を拡張。
- install sskts-domain@25.x.x

## v2.4.1 - 2018-04-19

### Fixed

- 期限切れ取引の承認アクション履歴の取得方法を修正。

## v2.4.0 - 2018-03-28

### Added

- Face Loginを追加。

## v2.3.2 - 2018-03-27

### Fixed

- 取引照会結果の文字数が多い場合の対応。

## v2.3.1 - 2018-02-26
- update sskts-domain.

## v2.3.0 - 2018-02-20
### Added
- 注文返品機能を追加。
- 注文照会にアクション履歴情報を追加。
- 取引IDによる照会機能を追加。期限入れの取引詳細も確認できるように調整。
- 注文照会に注文アイテム状態情報を追加。

## v2.2.0 - 2018-02-05
### Changed
- Cognito管理者ユーザーとの連携を調整。
- ログアウト機能を追加。

## v2.1.2 - 2017-12-07
### Added
- ユーザーセッション保持期間設定を追加。

### Changed
- ユーザーの状態にウェブフックイベント自体を引き継ぐように変更。

## v2.1.1 - 2017-12-07
### Changed
- サインイン後のページに戻るリンクを追加。

## v2.1.0 - 2017-12-06
### Added
- Cognitoユーザー認証追加。

### Changed
- install [@motionpicture/sskts-domain@23.4.0](https://www.npmjs.com/package/@motionpicture/sskts-domain)
- 取引csv検索条件を調整。

## v2.0.0 - 2017-10-31
### Changed
- sskts-domain@v23(スキーマ一新)に対応。

## v1.3.0 - 2017-07-04
### Added
- 予約番号検索を、成立以外の取引にも対応。
- 処理中のステータスをメッセージとして送信するように対応。

### Changed
- タスク仕様に合わせて調整。

## v1.2.0 - 2017-06-26
### Changed
- 予約照会条件に劇場コード追加

### Security
- [typescript@^2.4.0](https://github.com/Microsoft/TypeScript)

## v1.1.5 - 2017-06-12
### Added
- 取引詳細にGMOショップ情報を追加。

### Changed
- 取引詳細テンプレート調整。

## v1.1.4 - 2017-06-01
### Added
- csvの項目に劇場コードと予約番号を追加。

### Fixed
- csvの検索日時toが結果に含まれないバグを修正。

## v1.1.3 - 2017-05-31
### Fixed
- 多言語スキーマを追加したことに対する互換性対応。

## v1.1.2 - 2017-05-17
### Fixed
- csvダウンロードにて、ムビチケ購入管理番号表示が崩れるバグを修正。

## v1.1.1 - 2017-05-17
### Fixed
- 座席予約資産の券種名取得方法を修正。

## v1.1.0 - 2017-05-16
### Added
- 取引csvダウンロード機能を追加。

## v1.0.12 - 2017-04-19
### Changed
- QRコード表示をリンクに変更。

## v1.0.11 - 2017-04-19
### Added
- 電話番号検索を実験的に追加。

## v1.0.5 - 2017-04-18
### Added
- ムビチケ座席予約の場合に対応。

## v1.0.4 - 2017-04-18
### Changed
- 予約番号照会の取引内容を調整。

## v1.0.2 - 2017-04-14
### Changed
- パッケージ依存関係を整理。

## v1.0.1 - 2017-04-14
### Added
- 取引検索結果の情報を強化。

## v1.0.0 - 2017-04-01
### Added
- initialize
