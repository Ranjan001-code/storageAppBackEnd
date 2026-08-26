import redisClient from "../config/redis.js";
import User from "../models/userModel.js";

export default async function checkAuth(req, res, next) {
  const { sid } = req.signedCookies;
  // console.log("sid from cookies:", sid);

  if (!sid) {
    res.clearCookie("sid");
    return res.status(401).json({ error: "1 Not logged in!" });
  }

  const session = await redisClient.json.get(`session:${sid}`);

  if (!session) {
    res.clearCookie("sid");
    return res.status(401).json({ error: "2 Not logged in!" });
  }

  req.user = { _id: session.userId, rootDirId: session.rootDirId, role: session.role || "User" };
  next();
}

export const checkNotRegularUser = (req, res, next) => {
  if (req.user.role !== "User") return next();
  res.status(403).json({ error: "You can not access users" });
};

export const checkIsAdminUser = (req, res, next) => {
  if (req.user.role === "Admin") return next();
  res.status(403).json({ error: "You can not delete users" });
};

export const checkIsAdmin = (req, res, next) => {
  if (req.user && req.user.role === "Admin") return next();
  res.status(403).json({ error: "Access denied. Admins only." });
};

export const checkIsManager = (req, res, next) => {
  if (req.user && req.user.role === "Manager") return next();
  res.status(403).json({ error: "Access denied. Managers only." });
};

