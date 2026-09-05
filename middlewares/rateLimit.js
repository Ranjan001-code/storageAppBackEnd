import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redisClient from "../config/redis.js";

const createStore = () => {
  return new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args)
  });
};

export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  store:createStore(),
    message: "Too many accounts created from this IP, please try again after 15 minutes",
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  store: createStore(),
   message: "Too many login attempts. Please try again later.",

});

export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  store: createStore(),
  message: "Too many OTP requests. Please try again later.",
});

