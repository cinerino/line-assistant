/**
 * LINE webhook postbackコントローラー
 */

import * as COA from '@motionpicture/coa-service';
import * as sskts from '@motionpicture/sskts-domain';
import * as createDebug from 'debug';
import * as moment from 'moment';
import * as mongoose from 'mongoose';
import * as request from 'request-promise-native';

const debug = createDebug('sskts-linereport:controller:webhook:postback');

/**
 * 予約番号で取引を検索する
 *
 * @param {string} userId LINEユーザーID
 * @param {string} reserveNum 予約番号
 */
export async function searchTransactionByReserveNum(userId: string, reserveNum: string) {
    debug(userId, reserveNum);
    // 取引検索
    const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
    const transactionDoc = await transactionAdapter.transactionModel.findOne(
        {
            'inquiry_key.reserve_num': parseInt(reserveNum, 10)
        },
        '_id'
    ).exec();

    if (transactionDoc === null) {
        await pushMessage(userId, 'no transaction');
        return;
    }

    await pushTransactionDetails(userId, transactionDoc.get('_id').toString());
}

/**
 * 電話番号で取引を検索する
 *
 * @param {string} userId LINEユーザーID
 * @param {string} tel 電話番号
 */
export async function searchTransactionByTel(userId: string, tel: string) {
    debug('tel:', tel);
    await pushMessage(userId, '実験実装中です...');

    // 取引検索
    const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
    const transactionDoc = await transactionAdapter.transactionModel.findOne(
        {
            status: sskts.factory.transactionStatus.CLOSED,
            'inquiry_key.tel': tel
        }
        ,
        '_id'
    ).exec();

    if (transactionDoc === null) {
        await pushMessage(userId, 'no transaction');
        return;
    }

    await pushTransactionDetails(userId, transactionDoc.get('_id').toString());
}

/**
 * 取引IDから取引情報詳細を送信する
 *
 * @param {string} userId LINEユーザーID
 * @param {string} transactionId 取引ID
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
async function pushTransactionDetails(userId: string, transactionId: string) {
    // 取引検索
    const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
    const performanceAdapter = sskts.adapter.performance(mongoose.connection);
    const queueAdapter = sskts.adapter.queue(mongoose.connection);

    const transactionDoc = await transactionAdapter.transactionModel.findById(transactionId).populate('owners').exec();

    if (transactionDoc === null) {
        await pushMessage(userId, 'no transaction');
        return;
    }

    const transaction = sskts.factory.transaction.create(<any>transactionDoc.toObject());
    debug(transaction);
    const anonymousOwnerObject = transaction.owners.find((owner) => owner.group === sskts.factory.ownerGroup.ANONYMOUS);
    if (anonymousOwnerObject === undefined) {
        throw new Error('owner not found');
    }
    const anonymousOwner = sskts.factory.owner.anonymous.create(anonymousOwnerObject);

    const authorizations = await transactionAdapter.findAuthorizationsById(transaction.id);
    const notifications = await transactionAdapter.findNotificationsById(transaction.id);
    debug('authorizations:', authorizations);

    // GMOオーソリを取り出す
    const gmoAuthorizationObject = authorizations.find((authorization) => {
        return (authorization.owner_from === anonymousOwner.id && authorization.group === sskts.factory.authorizationGroup.GMO);
    });
    const gmoAuthorization =
        // tslint:disable-next-line:max-line-length
        (gmoAuthorizationObject !== undefined) ? sskts.factory.authorization.gmo.create(<any>gmoAuthorizationObject) : undefined;

    // ムビチケオーソリを取り出す
    const mvtkAuthorizationObject = authorizations.find((authorization) => {
        // tslint:disable-next-line:max-line-length
        return (authorization.owner_from === anonymousOwner.id && authorization.group === sskts.factory.authorizationGroup.MVTK);
    });
    const mvtkAuthorization =
        // tslint:disable-next-line:max-line-length
        (mvtkAuthorizationObject !== undefined) ? sskts.factory.authorization.mvtk.create(<any>mvtkAuthorizationObject) : undefined;

    // 座席予約オーソリを取り出す
    const coaSeatReservationAuthorizationObject = authorizations.find((authorization) => {
        return (
            authorization.owner_to === anonymousOwner.id &&
            authorization.group === sskts.factory.authorizationGroup.COA_SEAT_RESERVATION
        );
    });
    const coaSeatReservationAuthorization =
        // tslint:disable-next-line:max-line-length
        (coaSeatReservationAuthorizationObject !== undefined) ? sskts.factory.authorization.coaSeatReservation.create(<any>coaSeatReservationAuthorizationObject) : undefined;

    if (coaSeatReservationAuthorization === undefined) {
        throw new Error('seat reservation not found');
    }

    // パフォーマンス情報取得
    const performanceOption =
        await sskts.service.master.findPerformance(coaSeatReservationAuthorization.assets[0].performance)(performanceAdapter);
    if (performanceOption.isEmpty) {
        throw new Error('performance not found');
    }
    const performance = performanceOption.get();
    debug(performance);

    // キューの実行日時を調べる
    let coaAuthorizationSettledAt: Date | null = null;
    let gmoAuthorizationSettledAt: Date | null = null;
    let emailNotificationPushedAt: Date | null = null;

    if (transaction.status === sskts.factory.transactionStatus.CLOSED) {
        let promises: Promise<void>[] = [];
        promises = promises.concat(authorizations.map(async (authorization) => {
            const queueDoc = await queueAdapter.model.findOne({
                group: sskts.factory.queueGroup.SETTLE_AUTHORIZATION,
                'authorization.id': authorization.id
            }).exec();

            switch (authorization.group) {
                case sskts.factory.authorizationGroup.COA_SEAT_RESERVATION:
                    if (queueDoc.get('status') === sskts.factory.queueStatus.EXECUTED) {
                        coaAuthorizationSettledAt = <Date>queueDoc.get('last_tried_at');
                    }
                    break;
                case sskts.factory.authorizationGroup.GMO:
                    if (queueDoc.get('status') === sskts.factory.queueStatus.EXECUTED) {
                        gmoAuthorizationSettledAt = <Date>queueDoc.get('last_tried_at');
                    }
                    break;
                default:
                    break;
            }
        }));

        promises = promises.concat(notifications.map(async (notification) => {
            const queueDoc = await queueAdapter.model.findOne({
                group: sskts.factory.queueGroup.PUSH_NOTIFICATION,
                'notification.id': notification.id
            }).exec();

            switch (notification.group) {
                case sskts.factory.notificationGroup.EMAIL:
                    if (queueDoc.get('status') === sskts.factory.queueStatus.EXECUTED) {
                        emailNotificationPushedAt = <Date>queueDoc.get('last_tried_at');
                    }
                    break;
                default:
                    break;
            }
        }));

        await Promise.all(promises);
    }

    const transactionDetails = `--------------------
取引状況
--------------------
${(transaction.started_at instanceof Date) ? moment(transaction.started_at).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} 開始
${(transaction.closed_at instanceof Date) ? moment(transaction.closed_at).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} 成立
${(transaction.expired_at instanceof Date) ? moment(transaction.expired_at).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} 期限切れ
${(transaction.queues_exported_at instanceof Date) ? moment(transaction.queues_exported_at).format('YYYY-MM-DD HH:mm:ss') + '' : ''} キュー
${(emailNotificationPushedAt !== null) ? moment(emailNotificationPushedAt).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} メール送信
${(coaAuthorizationSettledAt !== null) ? moment(coaAuthorizationSettledAt).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} 本予約
${(gmoAuthorizationSettledAt !== null) ? moment(gmoAuthorizationSettledAt).format('YYYY-MM-DD HH:mm:ss') : '?????????? ????????'} 実売上
--------------------
購入者情報
--------------------
${anonymousOwner.name_first} ${anonymousOwner.name_last}
${anonymousOwner.email}
${anonymousOwner.tel}
--------------------
座席予約
--------------------
${performance.film.name.ja}
${performance.day} ${performance.time_start}-${performance.time_end}
@${performance.theater.name.ja} ${performance.screen.name.ja}
${coaSeatReservationAuthorization.assets.map((asset) => `●${asset.seat_code} ${asset.ticket_name_ja} ￥${asset.sale_price}`).join('\n')}
--------------------
GMO
--------------------
${(gmoAuthorization !== undefined) ? gmoAuthorization.gmo_order_id : ''}
${(gmoAuthorization !== undefined) ? '￥' + gmoAuthorization.price.toString() : ''}
--------------------
ムビチケ
--------------------
${(mvtkAuthorization !== undefined) ? mvtkAuthorization.knyknr_no_info.map((knyknrNoInfo) => knyknrNoInfo.knyknr_no).join('、') : ''}
`
        ;

    await pushMessage(userId, transactionDetails);

    if (transaction.inquiry_key !== undefined) {
        // COAからQRを取得
        const stateReserveResult = await COA.ReserveService.stateReserve(
            {
                theater_code: transaction.inquiry_key.theater_code,
                reserve_num: transaction.inquiry_key.reserve_num,
                tel_num: transaction.inquiry_key.tel
            }
        );
        debug(stateReserveResult);

        // 本予約済みであればQRコード送信
        if (stateReserveResult !== null) {
            stateReserveResult.list_ticket.forEach(async (ticket) => {
                // push message
                await request.post({
                    simple: false,
                    url: 'https://api.line.me/v2/bot/message/push',
                    auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
                    json: true,
                    body: {
                        to: userId,
                        messages: [
                            {
                                type: 'image',
                                // tslint:disable-next-line:max-line-length
                                originalContentUrl: `https://chart.apis.google.com/chart?chs=400x400&cht=qr&chl=${ticket.seat_qrcode}`,
                                previewImageUrl: `https://chart.apis.google.com/chart?chs=150x150&cht=qr&chl=${ticket.seat_qrcode}`
                            }
                        ]
                    }
                }).promise();
            });
        }
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
                        text: 'キュー実行',
                        actions: [
                            {
                                type: 'postback',
                                label: 'メール送信',
                                data: `action=pushNotification&transaction=${transaction.id}`
                            },
                            {
                                type: 'postback',
                                label: '本予約',
                                data: `action=transferCoaSeatReservationAuthorization&transaction=${transaction.id}`
                            }
                        ]
                    }
                }
            ]
        }
    }).promise();
}

export async function pushNotification(userId: string, transactionId: string) {
    const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
    let promises: Promise<void>[] = [];

    await pushMessage(userId, 'メールを送信しています...');

    // 取引検索
    const transactionDoc4notification = await transactionAdapter.transactionModel.findById(transactionId).exec();

    if (transactionDoc4notification === null) {
        await pushMessage(userId, 'no transaction');
        return;
    }

    if (transactionDoc4notification.get('status') !== sskts.factory.transactionStatus.CLOSED) {
        return;
    }

    const notifications = await transactionAdapter.findNotificationsById(transactionDoc4notification.get('_id'));
    debug(notifications);
    if (notifications.length === 0) {
        await pushMessage(userId, '通知がありません');
        return;
    }

    promises = [];
    promises = promises.concat(notifications.map(async (notification) => {
        switch (notification.group) {
            case sskts.factory.notificationGroup.EMAIL:
                await sskts.service.notification.sendEmail(<any>notification)();
                break;
            default:
                break;
        }
    }));

    try {
        await Promise.all(promises);
    } catch (error) {
        await pushMessage(userId, `送信できませんでした ${error.message}`);
        return;
    }

    await pushMessage(userId, '送信しました');
}

export async function transferCoaSeatReservationAuthorization(userId: string, transactionId: string) {
    const transactionAdapter = sskts.adapter.transaction(mongoose.connection);
    let promises: Promise<void>[] = [];

    await pushMessage(userId, '本予約処理をしています...');

    // 取引検索
    const transactionDoc4transfer = await transactionAdapter.transactionModel.findById(transactionId).exec();

    if (transactionDoc4transfer === null) {
        await pushMessage(userId, 'no transaction');
        return;
    }

    if (transactionDoc4transfer.get('status') !== sskts.factory.transactionStatus.CLOSED) {
        return;
    }

    const authorizations = await transactionAdapter.findAuthorizationsById(transactionDoc4transfer.get('_id'));
    debug(authorizations);
    if (authorizations.length === 0) {
        await pushMessage(userId, '仮予約データがありません');
        return;
    }

    promises = [];
    promises = promises.concat(authorizations.map(async (authorization) => {
        switch (authorization.group) {
            case sskts.factory.authorizationGroup.COA_SEAT_RESERVATION:
                await sskts.service.stock.transferCOASeatReservation(<any>authorization)(
                    sskts.adapter.asset(mongoose.connection),
                    sskts.adapter.owner(mongoose.connection)
                );
                break;
            default:
                break;
        }
    }));

    try {
        await Promise.all(promises);
    } catch (error) {
        await pushMessage(userId, `本予約できませんした ${error.message}`);
        return;
    }

    await pushMessage(userId, '本予約完了');
}
/**
 * メッセージ送信
 *
 * @param {string} userId
 * @param {string} text
 */
async function pushMessage(userId: string, text: string) {
    await request.post({
        simple: false,
        url: 'https://api.line.me/v2/bot/message/push',
        auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
        json: true,
        body: {
            to: userId,
            messages: [
                { type: 'text', text: text }
            ]
        }
    }).promise();
}