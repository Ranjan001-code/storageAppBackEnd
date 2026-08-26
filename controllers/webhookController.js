import Razorpay from "razorpay";
import Subscription from "../models/subscriptionModel.js";
import User from "../models/userModel.js";

export const PLANS = {
  plan_TTrLc8yCZqZBAI: {
    storageQuotaBytes: 2 * 1024 ** 3,
  },
  plan_TTrNqbKjXcGqZE: {
    storageQuotaBytes: 2 * 1024 ** 3,
  },
  plan_TTrMt7NsTWZ7E3: {
    storageQuotaBytes: 5 * 1024 ** 3,
  },
  plan_TTrOMBY3wcGK1d: {
    storageQuotaBytes: 5 * 1024 ** 3,
  },
  plan_TTrNCEObL2OhMo: {
    storageQuotaBytes: 10 * 1024 ** 3,
  },
  plan_TTrOiRy4Tf95Yi: {
    storageQuotaBytes: 10 * 1024 ** 3,
  },
};

export const handleRazorpayWebhook = async (req, res) => {
  // return res.status(200).json({ message: "Webhook received" });
  const signature = req.headers["x-razorpay-signature"];
  const payload = req.rawBody
    ? req.rawBody.toString("utf8")
    : JSON.stringify(req.body);
  const isSignatureValid = Razorpay.validateWebhookSignature(
    payload,
    signature,
    process.env.RAZORPAY_WEBHOOK_SECRET,
  );
  if (isSignatureValid) {
    console.log("Signature verified");

    console.log(req.body);
    if (req.body.event === "subscription.activated") {
      const rzpSubscription = req.body.payload?.subscription?.entity;
      if (rzpSubscription) {
        const planId = rzpSubscription.plan_id;
        const subscription = await Subscription.findOne({
          razorpaySubscriptionId: rzpSubscription.id,
        });
        if (subscription) {
          subscription.status = rzpSubscription.status || "active";
          if (planId) subscription.planId = planId;
          await subscription.save();

          const storageQuotaBytes = PLANS[planId]?.storageQuotaBytes;
          if (storageQuotaBytes) {
            const user = await User.findById(subscription.userId);
            if (user) {
              user.maxStorageInBytes = storageQuotaBytes;
              user.subscriptionId = subscription._id;
              await user.save();
              console.log("subscription activated for user:", user._id);
            }
          }
        }
      }
    }
  } else {
    console.log("Signature not verified");
  }
  res.end("OK");
};
