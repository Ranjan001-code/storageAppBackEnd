import { model, Schema } from "mongoose";

const subscriptionSchema = new Schema(
  {
    razorpaySubscriptionId: {
      type: String,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "created",
        "active",
        "pending",
        "past_due",
        "paused",
        "canceled",
        "in_grace",
      ],
      default: "pending",
    },
    planId: {
      type: String,
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
    },
    currentPeriodStart: {
      type: Date,
    },
    currentPeriodEnd: {
      type: Date,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
  },
  {
    strict: "throw",
    timestamps: true,
  }
);

const Subscription = model("Subscription", subscriptionSchema);

export default Subscription;
