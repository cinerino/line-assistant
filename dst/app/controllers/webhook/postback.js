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
 * LINE webhook postbackコントローラー
 */
const cinerinoapi = require("@cinerino/api-nodejs-client");
const createDebug = require("debug");
const moment = require("moment");
const otplib = require("otplib");
const querystring = require("querystring");
const request = require("request-promise-native");
const util = require("util");
const LINE = require("../../../line");
const debug = createDebug('cinerino-line-assistant:controller');
const MESSAGE_TRANSACTION_NOT_FOUND = '該当取引はありません';
const API_ENDPOINT = process.env.API_ENDPOINT;
if (API_ENDPOINT === undefined) {
    throw new Error('process.env.API_ENDPOINT undefined.');
}
/**
 * IDで取引検索
 */
function searchTransactionById(user, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        debug(user.userId, transactionId);
        yield LINE.pushMessage(user.userId, '取引IDで検索しています...');
        // 取引検索
        const placeOrderService = new cinerinoapi.service.txn.PlaceOrder({
            endpoint: API_ENDPOINT,
            auth: user.authClient
        });
        const searchResult = yield placeOrderService.search({
            typeOf: cinerinoapi.factory.transactionType.PlaceOrder,
            ids: [transactionId]
        });
        const transaction = searchResult.data.shift();
        if (transaction === undefined) {
            yield LINE.pushMessage(user.userId, `存在しない取引IDです: ${transactionId}`);
            return;
        }
        switch (transaction.status) {
            case cinerinoapi.factory.transactionStatusType.InProgress:
                yield LINE.pushMessage(user.userId, `注文取引[${transactionId}]は進行中です`);
                break;
            case cinerinoapi.factory.transactionStatusType.Confirmed:
                yield pushTransactionDetails(user, transaction.result.order.orderNumber);
                break;
            case cinerinoapi.factory.transactionStatusType.Expired:
                yield pushExpiredTransactionDetails(user, transactionId);
                break;
            default:
        }
    });
}
exports.searchTransactionById = searchTransactionById;
function selectSeller(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const sellerService = new cinerinoapi.service.Seller({
            endpoint: API_ENDPOINT,
            auth: params.user.authClient
        });
        const searchSellersResult = yield sellerService.search({});
        const sellers = searchSellersResult.data.filter((seller) => seller.location !== undefined);
        const LIMIT = 4;
        const pushCount = (sellers.length % LIMIT) + 1;
        for (const [i] of [...Array(pushCount)].entries()) {
            const sellerChoices = sellers.slice(LIMIT * i, LIMIT * (i + 1));
            yield request.post({
                simple: false,
                url: 'https://api.line.me/v2/bot/message/push',
                auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
                json: true,
                body: {
                    to: params.user.userId,
                    messages: [
                        {
                            type: 'template',
                            altText: 'aaa',
                            template: {
                                type: 'buttons',
                                text: '販売者を選択してください',
                                actions: sellerChoices.map((seller) => {
                                    return {
                                        type: 'postback',
                                        label: seller.name.ja,
                                        data: querystring.stringify(Object.assign({}, params.conditions, { action: 'searchTransactionByConditions', seller: seller.id })),
                                        displayText: `${seller.name.ja}で検索します...`
                                    };
                                })
                            }
                        }
                    ]
                }
            }).promise();
        }
    });
}
exports.selectSeller = selectSeller;
/**
 * 注文取引を検索する
 */
function searchTransactionByConditions(params) {
    return __awaiter(this, void 0, void 0, function* () {
        if (params.conditions.id === undefined
            && params.conditions.confirmationNumber === undefined
            && params.conditions.telephone === undefined) {
            yield LINE.pushMessage(params.user.userId, '検索条件が足りません');
            return;
        }
        // 劇場指定がなければ、販売者を確認する
        if (params.conditions.sellerId === '' || params.conditions.sellerId === undefined) {
            yield selectSeller(params);
            return;
        }
        yield LINE.pushMessage(params.user.userId, '取引を検索しています...');
        // 注文検索
        const orderService = new cinerinoapi.service.Order({
            endpoint: API_ENDPOINT,
            auth: params.user.authClient
        });
        const searchOrdersResult = yield orderService.search({
            confirmationNumbers: (params.conditions.confirmationNumber !== undefined)
                ? [params.conditions.confirmationNumber.toString()]
                : undefined,
            seller: { ids: [params.conditions.sellerId] },
            customer: {
                telephone: (params.conditions.telephone !== undefined)
                    ? params.conditions.telephone
                    : undefined
            }
            // acceptedOffers: {
            //     itemOffered: {
            //         reservationFor: {
            //             superEvent: {
            //                 location: {
            //                     branchCodes: [theaterCode.toString()]
            //                 }
            //             }
            //         }
            //     }
            // }
        });
        const order = searchOrdersResult.data.shift();
        if (order === undefined) {
            yield LINE.pushMessage(params.user.userId, MESSAGE_TRANSACTION_NOT_FOUND);
            return;
        }
        yield pushTransactionDetails(params.user, order.orderNumber);
    });
}
exports.searchTransactionByConditions = searchTransactionByConditions;
/**
 * 取引IDから取引情報詳細を送信する
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function pushTransactionDetails(user, orderNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(user.userId, `${orderNumber}の取引詳細をまとめています...`);
        const placeOrderService = new cinerinoapi.service.txn.PlaceOrder({
            endpoint: API_ENDPOINT,
            auth: user.authClient
        });
        const orderService = new cinerinoapi.service.Order({
            endpoint: API_ENDPOINT,
            auth: user.authClient
        });
        // 取引検索
        const searchTransactionsResult = yield placeOrderService.search({
            typeOf: cinerinoapi.factory.transactionType.PlaceOrder,
            result: {
                order: { orderNumbers: [orderNumber] }
            }
        });
        const transaction = searchTransactionsResult.data[0];
        // 確定取引なので、結果はundefinedではない
        const transactionResult = transaction.result;
        // 注文検索
        const searchOrdersResult = yield orderService.search({
            orderNumbers: [orderNumber]
        });
        let order = searchOrdersResult.data[0];
        debug('order:', order);
        if (order === undefined) {
            // 注文未作成であれば取引データから取得
            order = transactionResult.order;
        }
        // 所有権検索
        const ownershipInfos = [];
        // const ownershipInfos = await ownershipInfo.ownershipInfoModel.find({
        //     identifier: { $in: transactionResult.ownershipInfos.map((o) => o.identifier) }
        // }).exec().then((docs) => docs.map(
        //     (doc) => <cinerinoapi.factory.ownershipInfo.IOwnershipInfo<cinerinoapi.factory.ownershipInfo.IGoodType>>doc.toObject()
        // ));
        debug(ownershipInfos.length, 'ownershipInfos found.');
        const ownershipInfosStr = '';
        // const ownershipInfosStr = ownershipInfos.map((i) => {
        //     switch (i.typeOfGood.typeOf) {
        //         case cinerinoapi.factory.reservationType.EventReservation:
        //             return util.format(
        //                 '💲%s\n%s %s\n@%s\n~%s',
        //                 i.identifier,
        //                 (i.typeOfGood.reservedTicket.ticketedSeat !== undefined) ? i.typeOfGood.reservedTicket.ticketedSeat.seatNumber : '',
        //                 i.typeOfGood.reservedTicket.coaTicketInfo.ticketName,
        //                 i.typeOfGood.reservationStatus,
        //                 moment(i.ownedThrough).format('YYYY-MM-DD HH:mm:ss')
        //             );
        //         case 'ProgramMembership':
        //             return util.format(
        //                 '💲%s\n%s\n~%s',
        //                 i.identifier,
        //                 i.typeOfGood.programName,
        //                 moment(i.ownedThrough).format('YYYY-MM-DD HH:mm:ss')
        //             );
        //         case cinerinoapi.factory.pecorino.account.TypeOf.Account:
        //             return util.format(
        //                 '💲%s\n%s\n~%s',
        //                 i.identifier,
        //                 i.typeOfGood.accountNumber,
        //                 moment(i.ownedThrough).format('YYYY-MM-DD HH:mm:ss')
        //             );
        //         default:
        //             return i.identifier;
        //     }
        // }).join('\n');
        // 非同期タスク検索
        // const tasks = await taskRepo.taskModel.find({
        //     'data.transactionId': transaction.id
        // }).exec().then((docs) => docs.map((doc) => <cinerinoapi.factory.task.ITask<cinerinoapi.factory.taskName>>doc.toObject()));
        // タスクの実行日時を調べる
        const taskStrs = '';
        // const taskStrs = tasks.map((task) => {
        //     let taskNameStr = '???';
        //     switch (task.name) {
        //         case cinerinoapi.factory.taskName.PayAccount:
        //             taskNameStr = 'Account支払';
        //             break;
        //         case cinerinoapi.factory.taskName.PayCreditCard:
        //             taskNameStr = 'クレカ支払';
        //             break;
        //         case cinerinoapi.factory.taskName.UseMvtk:
        //             taskNameStr = 'ムビ使用';
        //             break;
        //         case cinerinoapi.factory.taskName.PlaceOrder:
        //             taskNameStr = '注文作成';
        //             break;
        //         case cinerinoapi.factory.taskName.SendEmailMessage:
        //             taskNameStr = 'メール送信';
        //             break;
        //         case cinerinoapi.factory.taskName.SendOrder:
        //             taskNameStr = '注文配送';
        //             break;
        //         default:
        //     }
        //     let statusStr = '→';
        //     switch (task.status) {
        //         case cinerinoapi.factory.taskStatus.Ready:
        //             statusStr = '-';
        //             break;
        //         case cinerinoapi.factory.taskStatus.Executed:
        //             statusStr = '↓';
        //             break;
        //         case cinerinoapi.factory.taskStatus.Aborted:
        //             statusStr = '×';
        //             break;
        //         default:
        //     }
        //     return util.format(
        //         '%s\n%s %s',
        //         (task.status === cinerinoapi.factory.taskStatus.Executed && task.lastTriedAt !== null)
        //             ? moment(task.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')
        //             : '---------- --:--:--',
        //         statusStr,
        //         taskNameStr
        //     );
        // }).join('\n');
        // 注文に対するアクション検索
        const actions = yield orderService.searchActionsByOrderNumber({
            orderNumber: order.orderNumber,
            sort: { startDate: cinerinoapi.factory.sortType.Ascending }
        });
        debug('actions:', actions);
        debug('actions on order found.', actions);
        // アクション履歴
        const actionStrs = actions
            .sort((a, b) => moment(a.endDate).unix() - moment(b.endDate).unix())
            .map((action) => {
            let actionName = action.typeOf;
            switch (action.typeOf) {
                case cinerinoapi.factory.actionType.ReturnAction:
                    actionName = '返品';
                    break;
                case cinerinoapi.factory.actionType.RefundAction:
                    actionName = '返金';
                    break;
                case cinerinoapi.factory.actionType.OrderAction:
                    actionName = '注文受付';
                    break;
                case cinerinoapi.factory.actionType.SendAction:
                    if (action.object.typeOf === 'Order') {
                        actionName = '配送';
                    }
                    else if (action.object.typeOf === 'EmailMessage') {
                        actionName = 'Eメール送信';
                    }
                    else {
                        actionName = `${action.typeOf} ${action.object.typeOf}`;
                    }
                    break;
                case cinerinoapi.factory.actionType.PayAction:
                    actionName = `支払(${action.object[0].paymentMethod.typeOf})`;
                    break;
                case cinerinoapi.factory.actionType.UseAction:
                    actionName = `${action.object.typeOf}使用`;
                    break;
                default:
            }
            let statusStr = '→';
            switch (action.actionStatus) {
                case cinerinoapi.factory.actionStatusType.CanceledActionStatus:
                    statusStr = '←';
                    break;
                case cinerinoapi.factory.actionStatusType.CompletedActionStatus:
                    statusStr = '↓';
                    break;
                case cinerinoapi.factory.actionStatusType.FailedActionStatus:
                    statusStr = '×';
                    break;
                default:
            }
            return util.format('%s\n%s %s', moment(action.endDate).format('YYYY-MM-DD HH:mm:ss'), statusStr, actionName);
        }).join('\n');
        const reservations = [];
        const event = undefined;
        // let event: any;
        // if (order.acceptedOffers[0] !== undefined
        //     && order.acceptedOffers[0].itemOffered.typeOf === cinerinoapi.factory.chevre.reservationType.EventReservation) {
        //     reservation = order.acceptedOffers[0].itemOffered;
        // }
        // tslint:disable:max-line-length
        const transactionDetails = [`----------------------------
注文状態
----------------------------
${order.orderNumber}
${order.confirmationNumber}
${order.orderStatus}
----------------------------
注文処理履歴
----------------------------
${actionStrs}
----------------------------
注文アイテム状態
----------------------------
${ownershipInfosStr}
`,
            `----------------------------
販売者情報 - ${order.orderNumber}
----------------------------
${transaction.seller.typeOf}
${transaction.seller.id}
${transaction.seller.identifier}
${transaction.seller.name.ja}
${transaction.seller.url}
----------------------------
購入者情報
----------------------------
${order.customer.name}
${order.customer.telephone}
${order.customer.email}
${(order.customer.memberOf !== undefined) ? `${order.customer.memberOf.membershipNumber}` : '非会員'}
----------------------------
座席予約
----------------------------
${(event !== undefined) ? event.name.ja : ''}
${(event !== undefined) ? `${moment(event.startDate).format('YYYY-MM-DD HH:mm')}-${moment(event.endDate).format('HH:mm')}` : ''}
${reservations.map((i) => `${i.typeOf} ${i.name} x${i.numItems} ￥${i.totalPrice}`)}
----------------------------
決済方法
----------------------------
${order.paymentMethods[0].typeOf}
${order.paymentMethods[0].paymentMethodId}
${order.price}
----------------------------
割引
----------------------------
`,
            `----------------------------
注文取引 - ${order.orderNumber}
----------------------------
${transaction.id}
${transaction.status}
----------------------------
取引進行クライアント
----------------------------
${(transaction.object.clientUser !== undefined) ? transaction.object.clientUser.client_id : ''}
${(transaction.object.clientUser !== undefined) ? transaction.object.clientUser.iss : ''}
----------------------------
取引状況
----------------------------
${moment(transaction.startDate).format('YYYY-MM-DD HH:mm:ss')} 開始
${moment(transaction.endDate).format('YYYY-MM-DD HH:mm:ss')} 成立
----------------------------
取引処理履歴
----------------------------
${taskStrs}
`];
        yield Promise.all(transactionDetails.map((text) => __awaiter(this, void 0, void 0, function* () {
            yield LINE.pushMessage(user.userId, text);
        })));
        // キュー実行のボタン表示
        const postActions = [
            {
                type: 'postback',
                label: '再照会する',
                data: `action = searchTransactionById & transaction=${transaction.id} `
            }
        ];
        if (order.orderStatus === cinerinoapi.factory.orderStatus.OrderDelivered) {
            // postActions.push({
            //     type: 'postback',
            //     label: 'メール送信',
            //     data: `action = pushNotification & transaction=${ transaction.id } `
            // });
            postActions.push({
                type: 'postback',
                label: '返品する',
                data: `action = startReturnOrder & orderNumber=${order.orderNumber} `
            });
        }
        if (postActions.length > 0) {
            yield request.post({
                simple: false,
                url: 'https://api.line.me/v2/bot/message/push',
                auth: { bearer: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
                json: true,
                body: {
                    to: user.userId,
                    messages: [
                        {
                            type: 'template',
                            altText: 'aaa',
                            template: {
                                type: 'buttons',
                                text: '本取引に対して何かアクションを実行しますか？',
                                actions: postActions
                            }
                        }
                    ]
                }
            }).promise();
        }
    });
}
/**
 * 期限切れの取引詳細を報告する
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function pushExpiredTransactionDetails(user, transactionId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(user.userId, `${transactionId} の取引詳細をまとめています...`);
        // 取引検索
        const placeOrderService = new cinerinoapi.service.txn.PlaceOrder({
            endpoint: API_ENDPOINT,
            auth: user.authClient
        });
        const searchResult = yield placeOrderService.search({
            typeOf: cinerinoapi.factory.transactionType.PlaceOrder,
            ids: [transactionId]
        });
        const transaction = searchResult.data.shift();
        if (transaction === undefined) {
            yield LINE.pushMessage(user.userId, `存在しない取引IDです: ${transactionId} `);
            return;
        }
        const actions = yield placeOrderService.searchActionsByTransactionId({
            id: transaction.id,
            sort: { startDate: cinerinoapi.factory.sortType.Ascending }
        });
        debug('actions:', actions);
        // 非同期タスク検索
        // const tasks = await taskRepo.taskModel.find({
        //     'data.transactionId': transaction.id
        // }).exec().then((docs) => docs.map((doc) => <cinerinoapi.factory.task.ITask<cinerinoapi.factory.taskName>>doc.toObject()));
        // タスクの実行日時を調べる
        const taskStrs = '';
        // const taskStrs = tasks.map((task) => {
        //     let taskNameStr = '???';
        //     switch (task.name) {
        //         case cinerinoapi.factory.taskName.CancelCreditCard:
        //             taskNameStr = 'クレカ取消';
        //             break;
        //         case cinerinoapi.factory.taskName.CancelMvtk:
        //             taskNameStr = 'ムビ取消';
        //             break;
        //         case cinerinoapi.factory.taskName.CancelSeatReservation:
        //             taskNameStr = '仮予約取消';
        //             break;
        //         default:
        //     }
        //     let statusStr = '→';
        //     switch (task.status) {
        //         case cinerinoapi.factory.taskStatus.Ready:
        //             statusStr = '-';
        //             break;
        //         case cinerinoapi.factory.taskStatus.Executed:
        //             statusStr = '↓';
        //             break;
        //         case cinerinoapi.factory.taskStatus.Aborted:
        //             statusStr = '×';
        //             break;
        //         default:
        //     }
        //     return util.format(
        //         '%s\n%s %s',
        //         (task.status === cinerinoapi.factory.taskStatus.Executed && task.lastTriedAt !== null)
        //             ? moment(task.lastTriedAt).format('YYYY-MM-DD HH:mm:ss')
        //             : '---------- --:--:--',
        //         statusStr,
        //         taskNameStr
        //     );
        // }).join('\n');
        // アクション履歴
        const actionStrs = actions
            .sort((a, b) => moment(a.endDate).unix() - moment(b.endDate).unix())
            .map((action) => {
            let actionName = `${action.typeOf} of ${action.object.typeOf} `;
            if (action.purpose !== undefined) {
                actionName += ` for ${action.purpose.typeOf}`;
            }
            let description = '';
            switch (action.object.typeOf) {
                case cinerinoapi.factory.paymentMethodType.CreditCard:
                    actionName = 'クレカオーソリ';
                    description = action.object.orderId;
                    break;
                case cinerinoapi.factory.action.authorize.offer.seatReservation.ObjectType.SeatReservation:
                    actionName = '座席仮予約';
                    if (action.result !== undefined) {
                        description = action.result.updTmpReserveSeatResult.tmpReserveNum;
                    }
                    break;
                case cinerinoapi.factory.action.authorize.discount.mvtk.ObjectType.Mvtk:
                    actionName = 'ムビチケ承認';
                    if (action.result !== undefined) {
                        description = action.object.seatInfoSyncIn.knyknrNoInfo.map((i) => i.knyknrNo).join(',');
                    }
                    break;
                default:
            }
            let statusStr = '→';
            switch (action.actionStatus) {
                case cinerinoapi.factory.actionStatusType.CanceledActionStatus:
                    statusStr = '←';
                    break;
                case cinerinoapi.factory.actionStatusType.CompletedActionStatus:
                    statusStr = '↓';
                    break;
                case cinerinoapi.factory.actionStatusType.FailedActionStatus:
                    statusStr = '×';
                    break;
                default:
            }
            return util.format('%s\n%s %s\n%s %s', moment(action.endDate).format('YYYY-MM-DD HH:mm:ss'), statusStr, actionName, statusStr, description);
        }).join('\n');
        const customerContact = transaction.object.customerContact;
        // tslint:disable:max-line-length
        const transactionDetails = [`----------------------------
注文取引概要
----------------------------
${transaction.id}
${transaction.status}
----------------------------
販売者情報
----------------------------
${transaction.seller.typeOf}
${transaction.seller.id}
${transaction.seller.identifier}
${transaction.seller.name.ja}
${transaction.seller.url}
----------------------------
購入者情報
----------------------------
${(customerContact !== undefined) ? `${customerContact.familyName} ${customerContact.givenName}` : ''}
${(customerContact !== undefined) ? customerContact.telephone : ''}
${(customerContact !== undefined) ? customerContact.email : ''}
${(transaction.agent.memberOf !== undefined) ? `${transaction.agent.memberOf.membershipNumber}` : '非会員'}
`,
            `----------------------------
注文取引
${transaction.id}
----------------------------
取引進行クライアント
----------------------------
${(transaction.object.clientUser !== undefined) ? transaction.object.clientUser.client_id : ''}
${(transaction.object.clientUser !== undefined) ? transaction.object.clientUser.iss : ''}
----------------------------
取引状況
----------------------------
${moment(transaction.startDate).format('YYYY-MM-DD HH:mm:ss')} 開始
${moment(transaction.endDate).format('YYYY-MM-DD HH:mm:ss')} 期限切れ
----------------------------
承認アクション履歴
----------------------------
${actionStrs}
----------------------------
取引処理履歴
----------------------------
${taskStrs}
`];
        yield Promise.all(transactionDetails.map((text) => __awaiter(this, void 0, void 0, function* () {
            yield LINE.pushMessage(user.userId, text);
        })));
    });
}
/**
 * 返品取引開始
 */
function startReturnOrder(user, orderNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(user.userId, '返品取引を開始します...');
        const returnOrderService = new cinerinoapi.service.transaction.ReturnOrder({
            endpoint: API_ENDPOINT,
            auth: user.authClient
        });
        const returnOrderTransaction = yield returnOrderService.start({
            // tslint:disable-next-line:no-magic-numbers
            expires: moment().add(15, 'minutes').toDate(),
            object: {
                order: { orderNumber: orderNumber }
            }
        });
        debug('return order transaction started.', returnOrderTransaction.id);
        // 二段階認証のためのワンタイムトークンを保管
        const secret = otplib.authenticator.generateSecret();
        const pass = otplib.authenticator.generate(secret);
        const postEvent = {
            postback: {
                data: `action = confirmReturnOrder & transaction=${returnOrderTransaction.id}& pass=${pass} `
            },
            // replyToken: '26d0dd0923a94583871ecd7e6efec8e2',
            source: {
                type: 'user',
                userId: user.userId
            },
            timestamp: 1487085535998,
            type: 'postback'
        };
        yield user.saveMFAPass(pass, postEvent);
        yield LINE.pushMessage(user.userId, '返品取引を開始しました');
        yield LINE.pushMessage(user.userId, '二段階認証を行います。送信されてくる文字列を入力してください');
        yield LINE.pushMessage(user.userId, pass);
    });
}
exports.startReturnOrder = startReturnOrder;
/**
 * 返品取引確定
 */
function confirmReturnOrder(user, transactionId, pass) {
    return __awaiter(this, void 0, void 0, function* () {
        yield LINE.pushMessage(user.userId, '返品取引を受け付けようとしています...');
        const postEvent = yield user.verifyMFAPass(pass);
        if (postEvent === null) {
            yield LINE.pushMessage(user.userId, 'パスの有効期限が切れました');
            return;
        }
        // パス削除
        yield user.deleteMFAPass(pass);
        const returnOrderService = new cinerinoapi.service.transaction.ReturnOrder({
            endpoint: API_ENDPOINT,
            auth: user.authClient
        });
        yield returnOrderService.confirm({
            id: transactionId
        });
        debug('return order transaction confirmed.');
        yield LINE.pushMessage(user.userId, '返品取引を受け付けました');
    });
}
exports.confirmReturnOrder = confirmReturnOrder;
