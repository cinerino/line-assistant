/**
 * oauthミドルウェア
 * @module middlewares.authentication
 * @see https://aws.amazon.com/blogs/mobile/integrating-amazon-cognito-user-pools-with-api-gateway/
 */

import * as sskts from '@motionpicture/sskts-domain';
import { NextFunction, Request, Response } from 'express';
import { OK } from 'http-status';
import * as request from 'request-promise-native';

import * as LINE from '../../line';
import User from '../user';

export default async (req: Request, res: Response, next: NextFunction) => {
    try {
        // RedisからBearerトークンを取り出す
        const event: LINE.IWebhookEvent | undefined = (req.body.events !== undefined) ? req.body.events[0] : undefined;
        if (event === undefined) {
            throw new Error('Invalid request.');
        }

        const userId = event.source.userId;
        req.user = new User({
            host: req.hostname,
            userId: userId,
            state: JSON.stringify(event)
        });

        if (await req.user.isAuthenticated()) {
            next();

            return;
        }

        // ログインボタンを送信
        // await LINE.pushMessage(userId, req.user.generateAuthUrl());
        await request.post({
            simple: false,
            url: LINE.URL_PUSH_MESSAGE,
            auth: { bearer: <string>process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN },
            json: true,
            body: {
                to: userId,
                messages: [
                    {
                        type: 'template',
                        altText: 'ログインボタン',
                        template: {
                            type: 'buttons',
                            text: 'ログインしてください。',
                            actions: [
                                {
                                    type: 'uri',
                                    label: 'Sign In',
                                    uri: req.user.generateAuthUrl()
                                }
                            ]
                        }
                    }
                ]
            }
        });

        res.status(OK).send('ok');
    } catch (error) {
        next(new sskts.factory.errors.Unauthorized(error.message));
    }
};
