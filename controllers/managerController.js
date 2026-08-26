import User from "../models/userModel.js";
import Session from "../models/sessionModel.js";
import redisClient from "../config/redis.js";
import Directory from "../models/directoryModel.js";

// create normal user
export const createUser = async (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "Name, email and password  are required." });
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
      role:"User",
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



// 1. Get all non-admin users
export const managerGetUsers = async (req, res, next) => {
  try {
    // Find all users except Admin
    const allUsers = await User.find({ role: { $ne: "Admin" } }).lean();
    // const allSessions = await Session.find().lean();
    // const allSessionsUserId = allSessions.map(({ userId }) => userId.toString());
    // const allSessionsUserIdSet = new Set(allSessionsUserId);
    const allSessions = await redisClient.ft.search("userIdx", "*", {
      RETURN: ["userId"],
    });
    const allSessionsUserId = allSessions.documents.map(({ value }) => value.userId);
    const allSessionsUserIdSet = new Set(allSessionsUserId); //here we create a set of userIds that have active sessions in Redis

    const transformedUsers = allUsers.map((user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      deleted: user.deleted || false,
      rootDirId: user.rootDirId,
      isLoggedIn: allSessionsUserIdSet.has(user._id.toString()),
    }));

    res.status(200).json(transformedUsers);
  } catch (err) {
    next(err);
  }
};

// 2. Soft Delete User
export const managerSoftDeleteUser = async (req, res, next) => {
  const { userId } = req.params;

  try {
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    if (targetUser.role === "Admin") {
      return res.status(403).json({ error: "Managers cannot delete admin users." });
    }

    // Terminate DB sessions
    // await Session.deleteMany({ userId });

    // Terminate Redis sessions
    try {
      const allSessions = await redisClient.ft.search(
        "userIdx",
        `@userId:{${userId}}`,
        {
          RETURN: [],
        }
      );
      if (allSessions?.documents?.length > 0) {
        await redisClient.del(allSessions.documents.map(({ id }) => id));
      }
    } catch (redisErr) {
      console.warn("Redis session deletion warning:", redisErr.message);
    }

    await User.findByIdAndUpdate(userId, { deleted: true });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// 3. Revoke Soft Delete
export const managerRevokeDelete = async (req, res, next) => {
  const { userId } = req.params;

  try {
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    if (targetUser.role === "Admin") {
      return res.status(403).json({ error: "Managers cannot modify admin users." });
    }

    await User.findByIdAndUpdate(userId, { deleted: false });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
