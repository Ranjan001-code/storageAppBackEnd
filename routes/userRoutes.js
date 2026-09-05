import express from "express";
import checkAuth, {
  checkIsAdminUser,
  checkNotRegularUser,
} from "../middlewares/authMiddleware.js";
import {
  deleteUser,
  getAllUsers,
  getCurrentUser,
  login,
  logout,
  logoutAll,
  logoutById,
  register,
  setUserPassword,
} from "../controllers/userController.js";
import { loginLimiter, registerLimiter } from "../middlewares/rateLimit.js";

const router = express.Router();

router.post("/user/register", registerLimiter, register);

router.post("/user/login", loginLimiter, login);

router.get("/user", checkAuth, getCurrentUser);
router.post("/user/set-password", checkAuth, setUserPassword);

router.post("/user/logout", logout);
router.post("/user/logout-all", logoutAll);

router.get("/users", checkAuth, checkNotRegularUser, getAllUsers);

router.post(
  "/users/:userId/logout",
  checkAuth,
  checkNotRegularUser,
  logoutById,
);

router.delete("/users/:userId", checkAuth, checkIsAdminUser, deleteUser);

export default router;
