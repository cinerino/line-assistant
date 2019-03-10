"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * LINE webhook messageコントローラー
 */
const createDebug = require("debug");
const querystring = require("querystring");
const request = require("request-promise-native");
const LINE = require("../../../line");
const debug = createDebug('cinerino-line-assistant:controller');
/**
 * 使い方を送信する
 */
function pushHowToUse(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        // tslint:disable-next-line:no-multiline-string
        const text = `Information
----------------
メニューから操作もできるようになりました。
期限切れステータスの取引詳細を照会することができるようになりました。`;
        yield LINE.pushMessage(userId, text);
        yield request.post({
            simple: false,
            url: 'https://api.line.me/v2/bot/message/push',
            auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
            json: true,
            body: {
                to: userId,
                messages: [
                    {
                        type: 'template',
                        altText: 'How to use',
                        template: {
                            type: 'buttons',
                            text: '何をしましょうか？',
                            actions: [
                                {
                                    type: 'message',
                                    label: '取引照会',
                                    text: '取引照会'
                                },
                                {
                                    type: 'message',
                                    label: '取引CSVダウンロード',
                                    text: 'csv'
                                },
                                {
                                    type: 'uri',
                                    label: '顔を登録する',
                                    uri: 'line://nv/camera/'
                                },
                                {
                                    type: 'message',
                                    label: 'ログアウト',
                                    text: 'logout'
                                }
                            ]
                        }
                    }
                ]
            }
        }).promise();
    });
}
exports.pushHowToUse = pushHowToUse;
function askTransactionInquiryKey(user) {
    return __awaiter(this, void 0, void 0, function* () {
        // tslint:disable-next-line:no-multiline-string
        yield LINE.pushMessage(user.userId, `次のいずれかを入力してください。
1. 確認番号
例:2425

2. 電話番号

3. 取引ID
例:5a7b2ed6c993250364388acd`);
    });
}
exports.askTransactionInquiryKey = askTransactionInquiryKey;
/**
 * 注文取引検索のキーを選択する
 */
function selectSearchTransactionsKey(userId, message) {
    return __awaiter(this, void 0, void 0, function* () {
        debug(userId, message);
        const datas = message.split('-');
        let searchingText = '';
        if (datas.length > 1) {
            searchingText = datas[1];
        }
        else {
            searchingText = datas[0];
        }
        // キュー実行のボタン表示
        yield request.post({
            simple: false,
            url: 'https://api.line.me/v2/bot/message/push',
            auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
            json: true,
            body: {
                to: userId,
                messages: [
                    {
                        type: 'template',
                        altText: 'aaa',
                        template: {
                            type: 'buttons',
                            text: 'どちらで検索しますか？',
                            actions: [
                                {
                                    type: 'postback',
                                    label: '取引ID',
                                    data: querystring.stringify({
                                        action: 'searchTransactionById',
                                        transaction: message
                                    })
                                },
                                {
                                    type: 'postback',
                                    label: '確認番号',
                                    data: querystring.stringify({
                                        action: 'searchTransactionByConditions',
                                        confirmationNumber: searchingText
                                    })
                                },
                                {
                                    type: 'postback',
                                    label: '電話番号',
                                    data: querystring.stringify({
                                        action: 'searchTransactionByConditions',
                                        telephone: searchingText
                                    })
                                }
                            ]
                        }
                    }
                ]
            }
        }).promise();
    });
}
exports.selectSearchTransactionsKey = selectSearchTransactionsKey;
/**
 * 日付選択を求める
 */
function askFromWhenAndToWhen(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(userId, `Cinerino Consoleをご利用ください。注文取引検索にてcsvダウンロードを実行できます。 ${process.env.CINERINO_CONSOLE_ENDPOINT}`);
        // await request.post(
        //     'https://api.line.me/v2/bot/message/push',
        //     {
        //         auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
        //         json: true,
        //         body: {
        //             to: userId, // 送信相手のuserId
        //             messages: [
        //                 {
        //                     type: 'template',
        //                     altText: '日付選択',
        //                     template: {
        //                         type: 'buttons',
        //                         text: '日付を選択するか、期間をYYYYMMDD-YYYYMMDD形式で教えてください。',
        //                         actions: [
        //                             {
        //                                 type: 'datetimepicker',
        //                                 label: '日付選択',
        //                                 mode: 'date',
        //                                 data: 'action=searchTransactionsByDate',
        //                                 initial: moment().format('YYYY-MM-DD')
        //                             }
        //                         ]
        //                     }
        //                 }
        //             ]
        //         }
        //     }
        // ).promise();
    });
}
exports.askFromWhenAndToWhen = askFromWhenAndToWhen;
function logout(user) {
    return __awaiter(this, void 0, void 0, function* () {
        yield request.post({
            simple: false,
            url: LINE.URL_PUSH_MESSAGE,
            auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
            json: true,
            body: {
                to: user.userId,
                messages: [
                    {
                        type: 'template',
                        altText: 'Log out',
                        template: {
                            type: 'buttons',
                            text: '本当にログアウトしますか？',
                            actions: [
                                {
                                    type: 'uri',
                                    label: 'Log out',
                                    uri: `https://${user.host}/logout?userId=${user.userId}`
                                }
                            ]
                        }
                    }
                ]
            }
        }).promise();
    });
}
exports.logout = logout;
