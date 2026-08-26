import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, //it sets a TTL (time to live) index on the createdAt field, which means that documents in this collection will automatically be deleted 10 minutes after they are created.
  },
});

const OTP = mongoose.model("OTP", otpSchema);

export default OTP;
