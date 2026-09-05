import { Resend } from "resend";
import OTP from "../models/otpModel.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpService(email) {
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  try {
    // Upsert OTP (replace if it already exists)
    await OTP.findOneAndUpdate(
      { email },
      { otp, createdAt: new Date() },
      { upsert: true },
    );

    // const transporter = nodemailer.createTransport({
    //   service: "gmail",
    //   auth: {
    //     user: process.env.GMAIL_USER,
    //     pass: process.env.GMAIL_APP_PASSWORD,
    //   },
    // });

    // await transporter.sendMail({
    //   from: process.env.GMAIL_USER,
    //   to: email,
    //   subject: "Storage App OTP",
    //   html,
    // });

    const html = `
  <div style="font-family: Arial, sans-serif; padding: 20px;">
    <h2>Storify</h2>

    <p>Your OTP is:</p>

    <h1 style="letter-spacing: 5px;">${otp}</h1>

    <p>This OTP is valid for 10 minutes.</p>

    <p>If you did not request this OTP, you can ignore this email.</p>

    <p>Thanks,<br>Storify Team</p>
  </div>
`;

    await resend.emails.send({
      from: "Storify <noreply@ranjan.website>",
      to: [email],
      subject: "Your Storify OTP",
      html,
    });

    return { success: true, message: `OTP sent successfully on ${email}` };
  } catch (err) {
    console.error("OTP sending service failed");
    return { success: false, message: "Failed to send OTP. Please try again." };
  }
}
