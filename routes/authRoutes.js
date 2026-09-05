import express from "express";
import { githubCallback, loginWithGithub, loginWithGoogle, sendOtp, verifyOtp } from "../controllers/authController.js";
import { otpLimiter } from "../middlewares/rateLimit.js";
const router = express.Router();

router.post("/send-otp", otpLimiter, sendOtp);

router.post("/verify-otp", verifyOtp);

router.post("/google", loginWithGoogle);

router.get("/github",loginWithGithub);
router.get("/github/callback", githubCallback);

export default router;
