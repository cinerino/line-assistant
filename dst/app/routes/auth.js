"use strict";
/**
 * 認証ルーター
 * @ignore
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const LINE = require("../controllers/line");
const user_1 = require("../user");
const authRouter = express.Router();
/**
 * サインイン
 * Cognitoからリダイレクトしてくる
 */
authRouter.get('/signIn', (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        const userId = req.query.state;
        const user = new user_1.default({
            host: req.hostname,
            userId: userId
        });
        yield user.signIn(req.query.code);
        yield user.isAuthenticated();
        yield LINE.pushMessage(userId, `Signed in. ${user.payload.username}`);
        res.send(`<html>
<body>Signed in. ${user.payload.username}</body>
</html>
`);
    }
    catch (error) {
        next(error);
    }
}));
exports.default = authRouter;