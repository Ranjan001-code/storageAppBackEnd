import { Resend } from "resend";
import OTP from "../models/otpModel.js";
import nodemailer from "nodemailer";
import { nextTick } from "process";

export async function sendOtpService(email) {
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  try {
    // Upsert OTP (replace if it already exists)
    await OTP.findOneAndUpdate(
      { email },
      { otp, createdAt: new Date() },
      { upsert: true },
    );

    const html = `
    <div style="font-family:sans-serif;">
      <h2>Your OTP is: ${otp}</h2>
      <p>This OTP is valid for 10 minutes.</p>
    </div>
  `;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Storage App OTP",
      html,
    });
  } catch (err) {
    next(err);
  }

  return { success: true, message: `OTP sent successfully on ${email}` };
}
