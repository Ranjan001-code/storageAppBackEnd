import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import directoryRoutes from "./routes/directoryRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import devRoutes from "./routes/devRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import managerRoutes from "./routes/managerRoutes.js";
import checkAuth, {
  checkIsAdmin,
  checkIsManager,
} from "./middlewares/authMiddleware.js";
import { connectDB } from "./config/db.js";

await connectDB();

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use("/", () => {
  return res.status(200).json({ msg: "Hello from storageAppBackEnd" });
});
app.use("/directory", checkAuth, directoryRoutes);
app.use("/file", checkAuth, fileRoutes);
app.use("/subscriptions", checkAuth, subscriptionRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/dev", devRoutes);
app.use("/admin", checkAuth, checkIsAdmin, adminRoutes);
app.use("/manager", checkAuth, checkIsManager, managerRoutes);
app.use("/", userRoutes);
app.use("/auth", authRoutes);

app.use((err, req, res, next) => {
  console.error("Global Error Handler caught:", err);

  if (res.headersSent) {
    return next(err);
  }

  // 1. Mongoose ValidationError
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      error: "Validation Error",
      details: messages.length ? messages : err.message,
    });
  }

  // 2. MongoDB Duplicate Key Error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({
      error: field ? `${field} already exists` : "Duplicate key error",
      keyValue: err.keyValue,
    });
  }

  // 3. MongoDB Document Validation Failure (Code 121)
  if (err.code === 121) {
    return res.status(400).json({
      error: "Document validation failed on database level",
      details: err.message,
    });
  }

  // 4. Mongoose CastError (invalid ObjectId, etc.)
  if (err.name === "CastError") {
    return res.status(400).json({
      error: `Invalid value for ${err.path}: ${err.value}`,
    });
  }

  // 5. Zod Error
  if (err.name === "ZodError" || err.issues) {
    return res.status(400).json({
      error: "Invalid request payload",
      details: err.issues || err.message,
    });
  }

  // 6. Custom or standard errors with status
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  return res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Server Started`);
});

// https://stackoverflow.com/questions/18367824/how-to-cancel-http-upload-from-data-events

// mongod --config "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg"
