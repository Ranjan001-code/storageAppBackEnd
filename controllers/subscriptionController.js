import Razorpay from "razorpay";
import Subscription from "../models/subscriptionModel.js";

const rzpInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_TPvmLfTzotPd5l",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "s7a6U6PP36sW69AtAe6XN1OD",
});

export const createSubscription = async (req, res, next) => {
  try {
    const newSubscription = await rzpInstance.subscriptions.create({
      plan_id: req.body.planId,
      total_count: `${req.body.period === "monthly" ? 120 : 10}`,
      notes: {
        userId: req.user._id,
      },
    });

    const subscription = new Subscription({
      razorpaySubscriptionId: newSubscription.id,
      userId: req.user._id,
      planId: req.body.planId,
      status: "pending",
    });

    await subscription.save();
    res.json({ subscriptionId: newSubscription.id });
  } catch (err) {
    console.log(err);
    next(err);
  }
};
