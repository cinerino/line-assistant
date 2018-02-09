/**
 * LINE webhook postbackコントローラー
 * @namespace app.controllers.webhook.postback
 */

import * as sskts from '@motionpicture/sskts-domain';
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as otplib from 'otplib';
import * as request from 'request-promise-native';
import * as util from 'util';

import * as LINE from '../../../line';
import User from '../../user';

const debug = createDebug('sskts-line-assistant:controller:webhook:postback');
const MESSAGE_TRANSACTION_NOT_FOUND = '該当取引はありません';

/**
 * 予約番号で取引を検索する
 * @export
 * @param userId LINEユーザーID
 * @param reserveNum 予約番号
 * @param theaterCode 劇場コード
 */
export async function searchTransactionByReserveNum(userId: string, reserveNum: string, theaterCode: string) {
    debug(userId, reserveNum);
    await LINE.pushMessage(userId, '予約番号で検索しています...');

    // 取引検索
    const transactionAdapter = new sskts.repository.Transaction(sskts.mongoose.connection);
    await transactionAdapter.transactionModel.findOne(
        {
            // tslint:disable-next-line:no-magic-numbers
            'result.order.orderInquiryKey.confirmationNumber': parseInt(reserveNum, 10),
            'result.order.orderInquiryKey.theaterCode': theaterCode
        },
        'result'
    ).exec().then(async (doc) => {
        if (doc === null) {
            await LINE.pushMessage(userId, MESSAGE_TRANSACTION_NOT_FOUND);
        } else {
            const transaction = <sskts.factory.transaction.placeOrder.ITransaction>doc.toObject();
            await pushTransactionDetails(userId, (<sskts.factory.transaction.placeOrder.IResult>transaction.result).order.orderNumber);
        }
    });
}

/**
 * 電話番号で取引を検索する
 * @export
 * @param userId LINEユーザーID
 * @param tel 電話番号
 * @param theaterCode 劇場コード
 */
export async function searchTransactionByTel(userId: string, tel: string, __: string) {
    debug('tel:', tel);
    await LINE.pushMessage(userId, 'implementing...');
}

/**
 * 取引IDから取引情報詳細を送信する
 * @export
 * @param userId LINEユーザーID
 * @param transactionId 取引ID
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
async function pushTransactionDetails(userId: string, orderNumber: string) {
    await LINE.pushMessage(userId, `${orderNumber}の取引詳細をまとめています...`);

    const actionRepo = new sskts.repository.Action(sskts.mongoose.connection);
    const orderRepo = new sskts.repository.Order(sskts.mongoose.connection);
    const taskAdapter = new sskts.repository.Task(sskts.mongoose.connection);
    const transactionAdapter = new sskts.repository.Transaction(sskts.mongoose.connection);

    // 取引検索
    const transaction = <sskts.factory.transaction.placeOrder.ITransaction>await transactionAdapter.transactionModel.findOne({
        'result.order.orderNumber': orderNumber,
        typeOf: sskts.factory.transactionType.PlaceOrder
    }).then((doc: sskts.mongoose.Document) => doc.toObject());

    // 確定取引なので、結果はundefinedではない
    const transactionResult = <sskts.factory.transaction.placeOrder.IResult>transaction.result;

    // 注文検索
    let order = await orderRepo.orderModel.findOne({
        orderNumber: orderNumber
    }).exec().then((doc) => {
        return (doc === null) ? null : <sskts.factory.order.IOrder>doc.toObject();
    });
    debug('order:', order);
    if (order === null) {
        order = transactionResult.order;
        // await LINE.pushMessage(userId, 'Order not found.');

        // return;
    }

    const report = sskts.service.transaction.placeOrder.transaction2report(transaction);
    debug('report:', report);

    // 非同期タスク検索
    const tasks = <sskts.factory.task.ITask[]>await taskAdapter.taskModel.find({
        'data.transactionId': transaction.id
    }).exec().then((docs) => docs.map((doc) => doc.toObject()));

    // タスクの実行日時を調べる
    const taskStrs = tasks.map((task) => {
        let taskNameStr = '???';
        switch (task.name) {
            case sskts.factory.taskName.SettleSeatReservation:
                taskNameStr = '本予約';
                break;
            case sskts.factory.taskName.SettleCreditCard:
                taskNameStr = 'クレカ支払';
                break;
            case sskts.factory.taskName.SettleMvtk:
                taskNameStr = 'ムビ使用';
                break;
            case sskts.factory.taskName.CreateOrder:
                taskNameStr = '注文作成';
                break;
            case sskts.factory.taskName.CreateOwnershipInfos:
                taskNameStr = '所有権作成';
                break;
            case sskts.factory.taskName.SendEmailNotification:
                taskNameStr = 'メール送信';
                break;
            case sskts.factory.taskName.SendOrder:
                taskNameStr = '注文配送';
                break;
            default:
        }

        return util.format(
            '%s %s',
            (task.status === sskts.factory.taskStatus.Executed && task.lastTriedAt !== null)
                ? moment(task.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')
                : '---------- --:--:--',
            taskNameStr
        );
    }).join('\n');

    // 注文に対するアクション検索
    const actions = await actionRepo.actionModel.find({
        'object.orderNumber': orderNumber
        // actionStatus: sskts.factory.actionStatusType.CompletedActionStatus
    }).exec().then((docs) => docs.map((doc) => doc.toObject()));
    debug('actions on order found.', actions);

    // アクション履歴
    const actionStrs = actions
        // .filter((a) => a.actionStatus === sskts.factory.actionStatusType.CompletedActionStatus)
        .sort((a, b) => moment(a.endDate).unix() - moment(b.endDate).unix())
        .map((action) => {
            let actionName = '???';
            switch (action.typeOf) {
                case sskts.factory.actionType.ReturnAction:
                    if (action.object.order !== undefined) {
                        actionName = '返品';
                    } else {
                        actionName = '返金';
                    }
                    break;
                case sskts.factory.actionType.OrderAction:
                    actionName = '注文受付';
                    break;
                case sskts.factory.actionType.SendAction:
                    if (action.object.typeOf === 'Order') {
                        actionName = '配送';
                    } else {
                        actionName = `${action.typeOf} ${action.object.typeOf}`;
                    }
                    break;
                case sskts.factory.actionType.PayAction:
                    actionName = `支払(${action.object.paymentMethod.paymentMethod})`;
                    break;
                case sskts.factory.actionType.UseAction:
                    actionName = `${action.object.typeOf}使用`;
                    break;
                default:
            }

            let statusStr = '→';
            switch (action.actionStatus) {
                case sskts.factory.actionStatusType.CanceledActionStatus:
                    statusStr = '←';
                    break;
                case sskts.factory.actionStatusType.CompletedActionStatus:
                    statusStr = '↓';
                    break;
                case sskts.factory.actionStatusType.FailedActionStatus:
                    statusStr = '×';
                    break;

                default:
            }

            return util.format(
                '%s\n%s %s',
                moment(action.endDate).format('YYYY-MM-DD HH:mm:ss'),
                statusStr,
                actionName
            );
        }).join('\n');

    // tslint:disable:max-line-length
    const transactionDetails = `--------------------
注文取引概要
--------------------
取引ステータス: ${report.status}
注文ステータス: ${(order !== null) ? order.orderStatus : ''}
予約番号: ${report.confirmationNumber}
劇場: ${report.superEventLocation}
--------------------
取引状況
--------------------
${moment(report.startDate).format('YYYY-MM-DD HH:mm:ss')} 開始
${moment(report.endDate).format('YYYY-MM-DD HH:mm:ss')} 成立
--------------------
取引タスク
--------------------
${taskStrs}
--------------------
注文状況
--------------------
${actionStrs}
--------------------
購入者情報
--------------------
${report.customer.name}
${report.customer.telephone}
${report.customer.email}
${(report.customer.memberOf !== undefined) ? `${report.customer.memberOf.membershipNumber}` : ''}
--------------------
座席予約
--------------------
${report.eventName}
${moment(report.eventStartDate).format('YYYY-MM-DD HH:mm')}-${moment(report.eventEndDate).format('HH:mm')}
@${report.superEventLocation} ${report.eventLocation}
${report.reservedTickets}
--------------------
決済方法
--------------------
${report.paymentMethod}
${report.paymentMethodId}
${report.price}
--------------------
割引
--------------------
${report.discounts}
${report.discountCodes}
￥${report.discountPrices}
--------------------
QR
--------------------
${transactionResult.order.acceptedOffers.map((offer) => `●${offer.itemOffered.reservedTicket.ticketedSeat.seatNumber} ${offer.itemOffered.reservedTicket.ticketToken}`).join('\n')}
`
        ;

    await LINE.pushMessage(userId, transactionDetails);

    // キュー実行のボタン表示
    const postActions = [
        {
            type: 'postback',
            label: 'メール送信',
            data: `action=pushNotification&transaction=${transaction.id}`
        },
        {
            type: 'postback',
            label: '本予約',
            data: `action=settleSeatReservation&transaction=${transaction.id}`
        },
        {
            type: 'postback',
            label: '所有権作成',
            data: `action=createOwnershipInfos&transaction=${transaction.id}`
        }
    ];
    if (order.orderStatus === sskts.factory.orderStatus.OrderDelivered) {
        postActions.push({
            type: 'postback',
            label: '返品する',
            data: `action=startReturnOrder&transaction=${transaction.id}`
        });
    }
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
                        text: 'タスク実行',
                        actions: postActions
                    }
                }
            ]
        }
    }).promise();
}

/**
 * 返品取引開始
 */
export async function startReturnOrder(user: User, transactionId: string) {
    await LINE.pushMessage(user.userId, '返品取引を開始します...');

    const authClient = user.authClient;
    const returnOrderTransaction = await authClient.fetch(
        `${<string>process.env.API_ENDPOINT}/transactions/returnOrder/start`,
        {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${user.accessToken}`
            },
            method: 'POST',
            body: JSON.stringify({
                // tslint:disable-next-line:no-magic-numbers
                expires: moment().add(15, 'minutes').toDate(),
                transactionId: transactionId
            })
        },
        // tslint:disable-next-line:no-magic-numbers
        [200]
    );
    debug('return order transaction started.', returnOrderTransaction.id);

    // 二段階認証のためのワンタイムトークンを保管
    const secret = otplib.authenticator.generateSecret();
    const pass = otplib.authenticator.generate(secret);
    const postEvent = {
        postback: {
            data: `action=confirmReturnOrder&transaction=${returnOrderTransaction.id}&pass=${pass}`
        },
        // replyToken: '26d0dd0923a94583871ecd7e6efec8e2',
        source: {
            type: <any>'user',
            userId: user.userId
        },
        timestamp: 1487085535998,
        type: <LINE.IEventType>'postback'
    };
    await user.saveMFAPass(pass, postEvent);

    await LINE.pushMessage(user.userId, '返品取引を開始しました。');
    await LINE.pushMessage(user.userId, '二段階認証を行います。送信されてくる文字列を入力してください。');
    await LINE.pushMessage(user.userId, pass);
}

/**
 * 返品取引確定
 */
export async function confirmReturnOrder(user: User, transactionId: string, pass: string) {
    await LINE.pushMessage(user.userId, '返品取引を受け付けようとしています...');

    const postEvent = await user.verifyMFAPass(pass);
    if (postEvent === null) {
        await LINE.pushMessage(user.userId, 'パスの有効期限が切れました。');

        return;
    }

    // パス削除
    await user.deleteMFAPass(pass);

    const authClient = user.authClient;
    const result = await authClient.fetch(
        `${<string>process.env.API_ENDPOINT}/transactions/returnOrder/${transactionId}/confirm`,
        {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${user.accessToken}`
            },
            method: 'POST'
        },
        // tslint:disable-next-line:no-magic-numbers
        [201]
    );
    debug('return order transaction confirmed.', result);

    await LINE.pushMessage(user.userId, '返品取引を受け付けました。');
}

/**
 * 取引を通知する
 * @export
 * @param userId LINEユーザーID
 * @param transactionId 取引ID
 */
export async function pushNotification(userId: string, transactionId: string) {
    await LINE.pushMessage(userId, '送信中...');

    const taskAdapter = new sskts.repository.Task(sskts.mongoose.connection);

    // タスク検索
    const tasks = await taskAdapter.taskModel.find({
        name: sskts.factory.taskName.SendEmailNotification,
        'data.transactionId': transactionId
    }).exec();

    if (tasks.length === 0) {
        await LINE.pushMessage(userId, 'Task not found.');

        return;
    }

    let promises: Promise<void>[] = [];
    promises = promises.concat(tasks.map(async (task) => {
        await sskts.service.task.execute(<sskts.factory.task.ITask>task.toObject())(taskAdapter, sskts.mongoose.connection);
    }));

    try {
        await Promise.all(promises);
    } catch (error) {
        await LINE.pushMessage(userId, `送信失敗:${error.message}`);

        return;
    }

    await LINE.pushMessage(userId, '送信完了');
}

/**
 * 座席の本予約を実行する
 * @export
 * @param userId LINEユーザーID
 * @param transactionId 取引ID
 */
export async function settleSeatReservation(userId: string, transactionId: string) {
    await LINE.pushMessage(userId, '本予約中...');

    const taskAdapter = new sskts.repository.Task(sskts.mongoose.connection);

    // タスク検索
    const tasks = await taskAdapter.taskModel.find({
        name: sskts.factory.taskName.SettleSeatReservation,
        'data.transactionId': transactionId
    }).exec();

    if (tasks.length === 0) {
        await LINE.pushMessage(userId, 'Task not found.');

        return;
    }

    try {
        await Promise.all(tasks.map(async (task) => {
            await sskts.service.task.execute(<sskts.factory.task.ITask>task.toObject())(taskAdapter, sskts.mongoose.connection);
        }));
    } catch (error) {
        await LINE.pushMessage(userId, `本予約失敗:${error.message}`);

        return;
    }

    await LINE.pushMessage(userId, '本予約完了');
}

/**
 * 所有権作成を実行する
 * @export
 * @param userId LINEユーザーID
 * @param transactionId 取引ID
 */
export async function createOwnershipInfos(userId: string, transactionId: string) {
    await LINE.pushMessage(userId, '所有権作成中...');

    const taskAdapter = new sskts.repository.Task(sskts.mongoose.connection);

    // タスク検索
    const tasks = await taskAdapter.taskModel.find({
        name: sskts.factory.taskName.CreateOwnershipInfos,
        'data.transactionId': transactionId
    }).exec();

    if (tasks.length === 0) {
        await LINE.pushMessage(userId, 'Task not found.');

        return;
    }

    try {
        await Promise.all(tasks.map(async (task) => {
            await sskts.service.task.execute(<sskts.factory.task.ITask>task.toObject())(taskAdapter, sskts.mongoose.connection);
        }));
    } catch (error) {
        await LINE.pushMessage(userId, `所有権作成失敗:${error.message}`);

        return;
    }

    await LINE.pushMessage(userId, '所有権作成完了');
}

/**
 * 取引検索(csvダウンロード)
 * @export
 * @param userId ユーザーID
 * @param date YYYY-MM-DD形式
 */
export async function searchTransactionsByDate(userId: string, date: string) {
    await LINE.pushMessage(userId, `${date}の取引を検索しています...`);

    const startFrom = moment(`${date}T00:00:00+09:00`);
    const startThrough = moment(`${date}T00:00:00+09:00`).add(1, 'day');

    const csv = await sskts.service.transaction.placeOrder.download(
        {
            startFrom: startFrom.toDate(),
            startThrough: startThrough.toDate()
        },
        'csv'
    )(new sskts.repository.Transaction(sskts.mongoose.connection));

    await LINE.pushMessage(userId, 'csvを作成しています...');

    const sasUrl = await sskts.service.util.uploadFile({
        fileName: `sskts-line-assistant-transactions-${moment().format('YYYYMMDDHHmmss')}.csv`,
        text: csv
    })();

    await LINE.pushMessage(userId, `download -> ${sasUrl} `);
}
