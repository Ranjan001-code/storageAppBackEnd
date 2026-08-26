import User from "../models/userModel.js";
import Directory from "../models/directoryModel.js";
import mongoose, { Types } from "mongoose";

export const createAdmin = async (req, res, next) => {
  const { name, email, password, secret } = req.body;
  const devSecret = process.env.DEV_SECRET || "dev_secret_key_2026";

  if (secret !== devSecret) {
    return res.status(403).json({ error: "Invalid developer secret key." });
  }

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }

  const existingUser = await User.findOne({ email});
  if (existingUser) {
    return res.status(409).json({ error: "Email already exists." });
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
      password, // Password will be hashed by mongoose pre-save hook
      rootDirId,
      role: "Admin",
    });
    await user.save({ session });

    await session.commitTransaction();
    res.status(201).json({ message: "Admin user created successfully." });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};
