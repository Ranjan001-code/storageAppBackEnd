import express from "express";
import {
  adminGetUsers,
  adminSoftDeleteUser,
  adminRevokeDelete,
  adminHardDeleteUser,
  createUser,
} from "../controllers/adminController.js";

const router = express.Router();

router.post("/createUser", createUser);
router.get("/users", adminGetUsers);
router.post("/users/:userId/soft-delete", adminSoftDeleteUser);
router.post("/users/:userId/revoke", adminRevokeDelete);
router.delete("/users/:userId", adminHardDeleteUser);

export default router;
