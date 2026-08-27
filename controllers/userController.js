import Directory from "../models/directoryModel.js";
import User from "../models/userModel.js";
import mongoose, { Types } from "mongoose";
import Session from "../models/sessionModel.js";
import OTP from "../models/otpModel.js";
import redisClient from "../config/redis.js";
import crypto from "crypto";
import { z } from "zod";
import { loginSchema, registerSchema } from "../validators/authSchema.js";
import { getDirectoryStats } from "./directoryController.js";
import Subscription from "../models/subscriptionModel.js";

export const register = async (req, res, next) => {
  const { success, data, error } = registerSchema.safeParse(req.body);

  console.log("Registering user with data:", data);

  if (!success) {
    return res.status(400).json({ error: error.flatten().fieldErrors });
  }

  const { name, email, password, otp } = data;
  console.log(otp);
  const otpRecord = await OTP.findOne({ email, otp });

  if (!otpRecord) {
    return res.status(400).json({ error: "Invalid or Expired OTP!" });
  }

  await otpRecord.deleteOne();

  const session = await mongoose.startSession();
  //transaction is used to ensure that both the directory and user are created successfully, if any of them fails, the transaction will be aborted and no changes will be made to the database.
  //this is important because we don't want to create a user without a root directory or vice versa.
  //it requires a replica set to be enabled in the MongoDB server, which is not the case for a standalone server. So we need to start a session and use it to create the directory and user.

  try {
    const rootDirId = new Types.ObjectId();
    const userId = new Types.ObjectId();

    session.startTransaction();

    console.log("Creating directory and user...");

    const directory = new Directory({
      _id: rootDirId,
      name: `root-${email}`,
      parentDirId: null,
      userId,
    });
    await directory.save({ session });

    console.log("Directory created");

    const user = new User({
      _id: userId,
      name,
      email,
      password,
      rootDirId,
    });
    await user.save({ session });

    console.log("User created");

    await session.commitTransaction();

    res.status(201).json({ message: "User Registered" });
  } catch (err) {
    await session.abortTransaction();
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    if (err.code === 121) {
      return res
        .status(400)
        .json({ error: "Invalid input, please enter valid details", err });
    } else if (err.code === 11000) {
      if (err.keyValue?.email) {
        return res.status(409).json({
          error: "This email already exists",
          message:
            "A user with this email address already exists. Please try logging in or use a different email.",
        });
      }
      return res
        .status(409)
        .json({ error: "Duplicate key error", keyValue: err.keyValue });
    } else {
      next(err);
    }
  } finally {
    session.endSession();
  }
};

export const login = async (req, res, next) => {
  const { success, data } = loginSchema.safeParse(req.body);

  if (!success) {
    return res.status(400).json({ error: "Invalid Credentials" });
  }

  const { email, password } = data;
  const user = await User.findOne({ email });

  if (user.deleted) {
    return res
      .status(404)
      .json({ error: "Your access has been blocked,Contact your manager" });
  }

  if (!user) {
    return res.status(404).json({ error: "Invalid Credentials" });
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    return res.status(404).json({ error: "Invalid Credentials" });
  }

  try {
    const allSessions = await redisClient.ft.search(
      "userIdx",
      `@userId:{${user.id}}`,
      {
        RETURN: [],
      },
    );
    console.log(allSessions);

    if (allSessions?.total >= 2) {
      await redisClient.del(allSessions.documents[0].id);
    }
  } catch (err) {
    console.warn("RediSearch ft.search warning:", err.message);
  }

  const sessionId = crypto.randomUUID();
  const redisKey = `session:${sessionId}`;
  await redisClient.json.set(redisKey, "$", {
    userId: user._id,
    rootDirId: user.rootDirId,
    role: user.role,
  });

  const sessionExpiryTime = 60 * 1000 * 60 * 24 * 7;
  await redisClient.expire(redisKey, sessionExpiryTime / 1000);

  res.cookie("sid", sessionId, {
   httpOnly: true,
      signed: true,
      secure: true,
      sameSite: "none",
    maxAge: sessionExpiryTime,
  });
  res.json({ message: "logged in" });
};

export const getAllUsers = async (req, res) => {
  const allUsers = await User.find({ deleted: false }).lean();
  const allSessions = await Session.find().lean();
  const allSessionsUserId = allSessions.map(({ userId }) => userId.toString());
  const allSessionsUserIdSet = new Set(allSessionsUserId);

  const transformedUsers = allUsers.map(({ _id, name, email }) => ({
    id: _id,
    name,
    email,
    isLoggedIn: allSessionsUserIdSet.has(_id.toString()),
  }));
  res.status(200).json(transformedUsers);
};

export const getCurrentUser = async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  const rootDir = await Directory.findById(user.rootDirId).lean();
  const password = user.password ? true : false;
  let usedStorageInBytes = rootDir ? rootDir.size : 0;
  if (user?.rootDirId) {
    const stats = await getDirectoryStats(user.rootDirId);
    usedStorageInBytes = stats.totalSize;
    if (rootDir && rootDir.size !== stats.totalSize) {
      await Directory.updateOne(
        { _id: user.rootDirId },
        { size: stats.totalSize },
      );
    }
  }
  const subscription = await Subscription.findOne({
    _id: user.subscriptionId,
    userId: user._id,
    status: "active",
  })
    .select("planId")
    .lean();
  const planId = subscription ? subscription.planId : null;
  res.status(200).json({
    id:user._id,
    name: user.name,
    email: user.email,
    picture: user.picture,
    password,
    role: user.role,
    planId,
    maxStorageInBytes: user.maxStorageInBytes,
    usedStorageInBytes,
  });
};

export const logout = async (req, res) => {
  const { sid } = req.signedCookies;
  await redisClient.del(`session:${sid}`);
  res.clearCookie("sid");
  res.status(204).end();
};

export const logoutById = async (req, res, next) => {
  const { userId } = req.params;
  console.log(userId);
  if (req.user._id === userId) {
    return res.status(403).json({ error: "You can not delete yourself." });
  }
  try {
    const allSessions = await redisClient.ft.search(
      "userIdx",
      `@userId:{${userId}}`,
      {
        RETURN: [],
      },
    );
    if (allSessions?.documents?.length > 0) {
      await redisClient.del(allSessions.documents.map(({ id }) => id));
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const logoutAll = async (req, res) => {
  const { sid } = req.signedCookies;
  if (sid) {
    try {
      const session = await redisClient.json.get(`session:${sid}`);
      if (session?.userId) {
        const allSessions = await redisClient.ft.search(
          "userIdx",
          `@userId:{${session.userId}}`,
          {
            RETURN: [],
          },
        );
        if (allSessions?.documents?.length > 0) {
          await redisClient.del(allSessions.documents.map(({ id }) => id));
        }
      }
    } catch (err) {
      console.warn("RediSearch ft.search warning in logoutAll:", err.message);
      await redisClient.del(`session:${sid}`);
    }
  }
  res.clearCookie("sid");
  res.status(204).end();
};

export const deleteUser = async (req, res, next) => {
  const { userId } = req.params;
  if (req.user._id.toString() === userId) {
    return res.status(403).json({ error: "You can not delete yourself." });
  }
  try {
    await Session.deleteMany({ userId });
    await User.findByIdAndUpdate(userId, { deleted: true });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export const setUserPassword = async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    user.password = password;
    await user.save();
    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
};
