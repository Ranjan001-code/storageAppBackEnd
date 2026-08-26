import express from "express";
import {
  managerGetUsers,
  managerSoftDeleteUser,
  managerRevokeDelete,
  createUser,
} from "../controllers/managerController.js";

const router = express.Router();

router.post('/createUser',createUser);
router.get("/users", managerGetUsers);
router.post("/users/:userId/soft-delete", managerSoftDeleteUser);
router.post("/users/:userId/revoke", managerRevokeDelete);

export default router;
