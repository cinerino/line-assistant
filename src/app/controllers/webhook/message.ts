/**
 * LINE webhook messageコントローラー
 */
import * as createDebug from 'debug';
import * as request from 'request-promise-native';

import * as LINE from '../../../line';
import User from '../../user';

const debug = createDebug('cinerino-line-assistant:controller');

/**
 * 使い方を送信する
 */
export async function pushHowToUse(userId: string) {
    // tslint:disable-next-line:no-multiline-string
    const text = `Information
----------------
メニューから操作もできるようになりました。
期限切れステータスの取引詳細を照会することができるようになりました。`;

    await LINE.pushMessage(userId, text);

    await request.post({
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
}

export async function askTransactionInquiryKey(user: User) {
    // tslint:disable-next-line:no-multiline-string
    await LINE.pushMessage(user.userId, `次のいずれかを入力してください。
1. [劇場コード]-[予約番号]
例:118-2425

2. 取引ID
例:5a7b2ed6c993250364388acd`);
}

/**
 * 予約番号or電話番号のボタンを送信する
 */
export async function pushButtonsReserveNumOrTel(userId: string, message: string) {
    debug(userId, message);
    const datas = message.split('-');

    let theater: string = '';
    let reserveNumOrTel: string = '';
    if (datas.length > 1) {
        theater = datas[0];
        reserveNumOrTel = datas[1];
    } else {
        reserveNumOrTel = datas[0];
    }

    // キュー実行のボタン表示
    await request.post({
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
                                data: `action=searchTransactionById&transaction=${message}`
                            },
                            {
                                type: 'postback',
                                label: '確認番号',
                                data: `action=searchTransactionByReserveNum&theater=${theater}&reserveNum=${reserveNumOrTel}`
                            },
                            {
                                type: 'postback',
                                label: '電話番号',
                                data: `action=searchTransactionByTel&theater=${theater}&tel=${reserveNumOrTel}`
                            }
                        ]
                    }
                }
            ]
        }
    }).promise();
}

/**
 * 日付選択を求める
 */
export async function askFromWhenAndToWhen(userId: string) {
    await LINE.pushMessage(userId, `Cinerino Consoleをご利用ください。 ${process.env.CINERINO_CONSOLE_ENDPOINT}`);
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
}

export async function logout(user: User) {
    await request.post({
        simple: false,
        url: LINE.URL_PUSH_MESSAGE,
        auth: { bearer: <string>process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
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
}
