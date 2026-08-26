import mongoose, { Types } from "mongoose";
import OTP from "../models/otpModel.js";
import User from "../models/userModel.js";
import Directory from "../models/directoryModel.js";
import { verifyIdToken } from "../services/googleAuthService.js";
import { sendOtpService } from "../services/sendOtpService.js";
import redisClient from "../config/redis.js";
import crypto from "crypto";
import { otpSchema } from "../validators/authSchema.js";

export const sendOtp = async (req, res, next) => {
  const { email } = req.body;
  const resData = await sendOtpService(email);
  res.status(201).json(resData);
};

export const verifyOtp = async (req, res, next) => {
  const { success, data } = otpSchema.safeParse(req.body);
  if (!success) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  const { email, otp } = data;
  const otpRecord = await OTP.findOne({ email, otp });

  if (!otpRecord) {
    return res.status(400).json({ error: "Invalid or Expired OTP!" });
  }

  return res.json({ message: "OTP Verified!" });
};

async function generateSession(
  userId,
  rootDirId,
  role = "User",
  expiresIn = 60 * 1000 * 60 * 24 * 7,
) {
  const sessionId = crypto.randomUUID();
  const redisKey = `session:${sessionId}`;
  await redisClient.json.set(redisKey, "$", {
    userId: userId,
    rootDirId: rootDirId,
    role: role,
  });

  const sessionExpiryTime = expiresIn;
  await redisClient.expire(redisKey, sessionExpiryTime / 1000);

  return sessionId;
}

export const loginWithGoogle = async (req, res, next) => {
  const { idToken } = req.body;
  const userData = await verifyIdToken(idToken);
  console.log("User data from Google:", userData);
  const { name, email, picture } = userData;
  const user = await User.findOne({ email }).select("-__v");
  if (user) {
    if (user.deleted) {
      return res.status(403).json({
        error: "Your account has been deleted. Contact app owner to recover.",
      });
    }

    try {
      const allSessions = await redisClient.ft.search(
        "userIdx",
        `@userId:{${user.id}}`,
        {
          RETURN: [],
        },
      );

      if (allSessions?.total >= 2) {
        await redisClient.del(allSessions.documents[0].id);
      }
    } catch (err) {
      console.warn("RediSearch ft.search warning:", err.message);
    }

    if (!user.picture.includes("googleusercontent.com")) {
      user.picture = picture;
      await user.save();
    }

    const sessionExpiryTime = 60 * 1000 * 60 * 24 * 7;
    const sessionId = await generateSession(user.id, user.rootDirId, user.role);

    res.cookie("sid", sessionId, {
      httpOnly: true,
      signed: true,
      maxAge: sessionExpiryTime,
    });

    return res.json({ message: "logged in" });
  }

  const mongooseSession = await mongoose.startSession();

  try {
    const rootDirId = new Types.ObjectId();
    const userId = new Types.ObjectId();

    mongooseSession.startTransaction();

    const directory = new Directory({
      _id: rootDirId,
      name: `root-${email}`,
      parentDirId: null,
      userId,
    });
    await directory.save({ session: mongooseSession });

    const userDoc = new User({
      _id: userId,
      name,
      email,
      picture,
      rootDirId,
    });
    await userDoc.save({ session: mongooseSession });

    const sessionId = await generateSession(userId, rootDirId, userDoc.role);
    const sessionExpiryTime = 60 * 1000 * 60 * 24 * 7;
    res.cookie("sid", sessionId, {
      httpOnly: true,
      signed: true,
      maxAge: sessionExpiryTime,
    });

    await mongooseSession.commitTransaction();
    res.status(201).json({ message: "account created and logged in" });
  } catch (err) {
    await mongooseSession.abortTransaction();
    next(err);
  } finally {
    mongooseSession.endSession();
  }
};

export const loginWithGithub = async (req, res, next) => {
  console.log("GitHub login route hit");
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_CALLBACK_URL,
    scope: "read:user user:email",
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
};

export const githubCallback = async (req, res, next) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("Authorization code missing");
    }

    console.log("GitHub callback route hit with code:", code);

    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: process.env.GITHUB_CALLBACK_URL,
        }),
      },
    );
    const { access_token: accessToken } = await response.json();
    console.log("GitHub access token:", accessToken);
    if (!accessToken) {
      return res.status(401).send("Failed to get GitHub access token");
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    const githubUser = await userResponse.json();

    const emailResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    const emails = await emailResponse.json();

    const primaryEmail =
      emails.find((email) => email.primary)?.email || emails[0]?.email;

    if (!primaryEmail) {
      return res.status(401).send("Failed to get GitHub user email");
    }
    //    console.log({
    //     githubId: githubUser.id,
    //     username: githubUser.login,
    //     name: githubUser.name,
    //     email: primaryEmail,
    //     avatar: githubUser.avatar_url,
    //   });
    //  return;
    const { name, avatar_url: picture } = githubUser;
    const email = primaryEmail;

    console.log("Github processing complete");

    const user = await User.findOne({ email }).select("-__v");
    if (user) {
      if (user.deleted) {
        return res.status(403).json({
          error: "Your account has been deleted. Contact app owner to recover.",
        });
      }

      try {
        const allSessions = await redisClient.ft.search(
          "userIdx",
          `@userId:{${user.id}}`,
          {
            RETURN: [],
          },
        );

        if (allSessions?.total >= 2) {
          await redisClient.del(allSessions.documents[0].id);
        }
      } catch (err) {
        console.warn("RediSearch ft.search warning:", err.message);
      }

      if (!user.picture.includes("googleusercontent.com")) {
        user.picture = picture;
        await user.save();
      }

      const sessionExpiryTime = 60 * 1000 * 60 * 24 * 7;
      const sessionId = await generateSession(user.id, user.rootDirId, user.role);

      res.cookie("sid", sessionId, {
        httpOnly: true,
        signed: true,
        maxAge: sessionExpiryTime,
      });

      return res.send(`
  <script>
    window.opener.postMessage(
      {
        type: "GITHUB_AUTH",
        status: "success"
      },
      "${process.env.CLIENT_URL}"
    );

    window.close();
  </script>
`);
    }

    const mongooseSession = await mongoose.startSession();
    try {
      const rootDirId = new Types.ObjectId();
      const userId = new Types.ObjectId();

      mongooseSession.startTransaction();

      const directory = new Directory({
        _id: rootDirId,
        name: `root-${email}`,
        parentDirId: null,
        userId,
      });
      await directory.save({ session: mongooseSession });

      const userDoc = new User({
        _id: userId,
        name,
        email,
        picture,
        rootDirId,
      });
      await userDoc.save({ session: mongooseSession });

      const sessionId = await generateSession(userId, rootDirId, userDoc.role);
      const sessionExpiryTime = 60 * 1000 * 60 * 24 * 7;
      res.cookie("sid", sessionId, {
        httpOnly: true,
        signed: true,
        maxAge: sessionExpiryTime,
      });

      await mongooseSession.commitTransaction();

      res.send(`
  <script>
    window.opener.postMessage(
      {
        type: "GITHUB_AUTH",
        status: "success"
      },
      "${process.env.CLIENT_URL}"
    );

    window.close();
  </script>
`);
    } catch (err) {
      await mongooseSession.abortTransaction();
      throw err;
    } finally {
      mongooseSession.endSession();
    }
  } catch (error) {
    res.send(`
  <script>
    window.opener.postMessage(
      {
        type: "GITHUB_AUTH",
        status: "failed"
      },
      "${process.env.CLIENT_URL}"
    );

    window.close();
  </script>
`);
  }
};
