import User from "../models/userModel.js";
import Directory from "../models/directoryModel.js";
import File from "../models/fileModel.js";
import Session from "../models/sessionModel.js";
import redisClient from "../config/redis.js";
import { deleteS3Files } from "../services/s3.js";
import mongoose, { Types } from "mongoose";

// Helper to recursively delete directories and files from database & S3
async function deleteUserContents(rootDirId) {
  if (!rootDirId) return;

  async function getDirectoryContents(dirId) {
    let files = await File.find({ parentDirId: dirId })
      .select("extension size")
      .lean();
    let directories = await Directory.find({ parentDirId: dirId })
      .select("_id")
      .lean();

    for (const { _id } of directories) {
      const { files: childFiles, directories: childDirectories } =
        await getDirectoryContents(_id);

      files = [...files, ...childFiles];
      directories = [...directories, ...childDirectories];
    }

    return { files, directories };
  }

  const { files, directories } = await getDirectoryContents(rootDirId);

  const keys = files.map(({ _id, extension }) => ({
    Key: `${_id}${extension}`,
  }));

  if (keys.length > 0) {
    try {
      await deleteS3Files(keys);
    } catch (err) {
      console.error("Error deleting user S3 files:", err);
    }
  }

  await File.deleteMany({
    _id: { $in: files.map(({ _id }) => _id) },
  });

  await Directory.deleteMany({
    _id: { $in: [...directories.map(({ _id }) => _id), rootDirId] }, //here we include the rootDirId to delete the root directory as well
  });
}

// 1. Create a Manager
export const createUser = async (req, res, next) => {
  const { name, email, password,role } = req.body;

  if (!name || !email || !password || !role) {
    return res
      .status(400)
      .json({ error: "Name, email, password and role are required." });
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ error: "Email already in use." });
  }

  const session = await mongoose.startSession();
  try {
    const rootDirId = new Types.ObjectId();
    const userId = new Types.ObjectId();

    session.startTransaction();

    const directory = new Directory({
      _id: rootDirId,
      name: `root-${email}`,
      parentDirId: null,
      userId,
    });
    await directory.save({ session });

    const user = new User({
      _id: userId,
      name,
      email,
      password,
      rootDirId,
      role,
    });
    await user.save({ session });

    await session.commitTransaction();
    res.status(201).json({ message: "User created successfully." });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// 2. Get all users (for Admin dashboard)
export const adminGetUsers = async (req, res, next) => {
  try {
    const allUsers = await User.find({}).lean();
   const allSessions = await redisClient.ft.search("userIdx", "*", {
      RETURN: ["userId"],
    });
    const allSessionsUserId = allSessions.documents.map(({ value }) => value.userId);
    const allSessionsUserIdSet = new Set(allSessionsUserId);

    const transformedUsers = allUsers.map((user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      deleted: user.deleted || false,
      rootDirId: user.rootDirId,
      isLoggedIn: allSessionsUserIdSet.has(user._id.toString()),
    }));
    // console.log(transformedUsers);
    res.status(200).json(transformedUsers);
  } catch (err) {
    next(err);
  }
};

// 3. Soft Delete a User/Manager
export const adminSoftDeleteUser = async (req, res, next) => {
  const { userId } = req.params;
  if (req.user._id.toString() === userId) {
    return res.status(403).json({ error: "You cannot delete yourself." });
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

    await User.findByIdAndUpdate(userId, { deleted: true });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// 4. Revoke Soft Delete
export const adminRevokeDelete = async (req, res, next) => {
  const { userId } = req.params;
  try {
    await User.findByIdAndUpdate(userId, { deleted: false });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// 5. Hard Delete a User/Manager
export const adminHardDeleteUser = async (req, res, next) => {
  const { userId } = req.params;
  if (req.user._id.toString() === userId) {
    return res.status(403).json({ error: "You cannot delete yourself." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // 1. Delete all user files and directories recursively from S3 and Database
    if (user.rootDirId) {
      await deleteUserContents(user.rootDirId);
    }

    // 2. Terminate sessions
    // await Session.deleteMany({ userId });
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
    } catch (redisErr) {
      console.warn("Redis session deletion warning:", redisErr.message);
    }

    // 3. Delete the user
    await user.deleteOne();

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
