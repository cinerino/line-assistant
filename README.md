# Cinerino LINE Assistant

[![CircleCI](https://circleci.com/gh/cinerino/line-assistant.svg?style=svg)](https://circleci.com/gh/cinerino/line-assistant)

## Table of contents

- [Cinerino LINE Assistant](#cinerino-line-assistant)
  - [Table of contents](#table-of-contents)
  - [Usage](#usage)
    - [Environment variables](#environment-variables)
  - [Code Samples](#code-samples)
  - [Jsdoc](#jsdoc)
  - [License](#license)
  - [Reference](#reference)
    - [LINE Reference](#line-reference)

## Usage

### Environment variables

| Name                               | Required | Purpose                   | Value                                                                 |
| ---------------------------------- | -------- | ------------------------- | --------------------------------------------------------------------- |
| `DEBUG`                            | false    | cinerino-line-assistant:* | Debug                                                                 |
| `NODE_ENV`                         | true     |                           | environment name                                                      |
| `SENDGRID_API_KEY`                 | true     |                           | SendGrid API Key                                                      |
| `GMO_ENDPOINT`                     | true     |                           | GMO API endpoint                                                      |
| `GMO_SITE_ID`                      | true     |                           | GMO SiteID                                                            |
| `GMO_SITE_PASS`                    | true     |                           | GMO SitePass                                                          |
| `COA_ENDPOINT`                     | true     |                           | COA API endpoint                                                      |
| `COA_REFRESH_TOKEN`                | true     |                           | COA API refresh token                                                 |
| `AZURE_STORAGE_CONNECTION_STRING`  | true     |                           | Save CSV files on azure storage                                       |
| `LINE_BOT_CHANNEL_SECRET`          | true     |                           | LINE Messaging API 署名検証                                           |
| `LINE_BOT_CHANNEL_ACCESS_TOKEN`    | true     |                           | LINE Messaging API 認証                                               |
| `API_AUTHORIZE_SERVER_DOMAIN`      | true     |                           | API 認可サーバードメイン                                              |
| `API_CLIENT_ID`                    | true     |                           | APIクライアントID                                                     |
| `API_CLIENT_SECRET`                | true     |                           | APIクライアントシークレット                                           |
| `API_TOKEN_ISSUER`                 | true     |                           | APIトークン発行者                                                     |
| `API_CODE_VERIFIER`                | true     |                           | API認可コード検証鍵                                                   |
| `USER_REFRESH_TOKEN`               | false    |                           | APIのリフレッシュトークン(セットすると認証をスキップできる、開発用途) |
| `REDIS_HOST`                       | true     |                           | ログイン状態保持ストレージ                                            |
| `REDIS_PORT`                       | true     |                           | ログイン状態保持ストレージ                                            |
| `REDIS_KEY`                        | true     |                           | ログイン状態保持ストレージ                                            |
| `USER_EXPIRES_IN_SECONDS`          | true     |                           | ユーザーセッション保持期間                                            |
| `REFRESH_TOKEN_EXPIRES_IN_SECONDS` | true     |                           | リフレッシュトークン保管期間                                          |
| `AWS_ACCESS_KEY_ID`                | true     |                           |                                                                       |
| `AWS_SECRET_ACCESS_KEY`            | true     |                           |                                                                       |
| `FACE_MATCH_THRESHOLD`             | true     |                           | 顔認証閾値                                                            |
| `CINERINO_CONSOLE_ENDPOINT`        | true     |                           |                                                                       |
| `PROJECT_ID`                       | true     |                           |                                                                       |

## Code Samples

Code sample are [here](https://github.com/cinerino/line-assistant/tree/master/example).

## Jsdoc

`npm run doc` emits jsdoc to ./doc.

## License

ISC

## Reference

### LINE Reference

* [LINE BUSSINESS CENTER](https://business.line.me/ja/)
* [LINE@MANAGER](https://admin-official.line.me/)
* [API Reference](https://devdocs.line.me/ja/)
* [LINE Pay技術サポート](https://pay.line.me/jp/developers/documentation/download/tech?locale=ja_JP)
* [LINE Pay Home](https://pay.line.me/jp/)
