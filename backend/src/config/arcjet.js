import arcjet, {tokenBucket, shield, detectBot } from "@arcjet/node";
import {ENV} from "./env.js";

export const aj = arcjet({
    key: ENV.ARCJET_KEY,
    characteristics: ["ip.src"],
    rules: [
        // shield protects your app from common attacks e.g. SQL injection, ESS, CSRF attacks
        shield({ mode: "LIVE"}),

        // bot detection - block all bots except search engines
        detectBot({
            mode: "LIVE",
            allow: [
                "CATEGORY:SEARCH_ENGINE",
                // see full list at https://arcjet.com/bot-list

            ],
        }),

        // rate limiting with token bucket algorithm
        tokenBucket({
            mode: "LIVE",
            refillRate: 10, //tokens added per interval
            interval: 10, //interval every 10 seconds
            capacity: 15, //max tokens in bucket
        }),
    ],
});