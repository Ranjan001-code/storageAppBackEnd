import mongoose from "mongoose";
import { connectDB } from "./db.js";

await connectDB();
const client = mongoose.connection.getClient();

try {
  const db = mongoose.connection.db;
  const command = "collMod";

  await db.command({
    [command]: "users",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "name", "email", "rootDirId"],
        properties: {
          _id: {
            bsonType: "objectId",
          },
          name: {
            bsonType: "string",
            minLength: 3,
            description:
              "name field should a string with at least three characters",
          },
          maxStorageInBytes: {
            bsonType: "long",
          },
          email: {
            bsonType: "string",
            description: "please enter a valid email",
            pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,}$",
          },
          password: {
            bsonType: "string",
            minLength: 4,
          },
          rootDirId: {
            bsonType: "objectId",
          },
          subscriptionId: {
            bsonType: ["objectId", "null"],
          },
          picture: {
            bsonType: "string",
          },
          role: {
            enum: ["Admin", "Manager", "User"],
          },
          deleted: {
            bsonType: "bool",
          },
          __v: {
            bsonType: "int",
          },
        },
        additionalProperties: false,
      },
    },
    validationAction: "error",
    validationLevel: "strict",
  });

  await db.command({
    [command]: "directories",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "name", "userId", "parentDirId"],
        properties: {
          _id: {
            bsonType: "objectId",
          },
          name: {
            bsonType: "string",
          },
          size: {
            bsonType: ["int", "long", "double", "number"],
          },
          userId: {
            bsonType: "objectId",
          },
          parentDirId: {
            bsonType: ["objectId", "null"],
          },
          createdAt: {
            bsonType: "date",
          },
          updatedAt: {
            bsonType: "date",
          },
          __v: {
            bsonType: "int",
          },
        },
        additionalProperties: false,
      },
    },
    validationAction: "error",
    validationLevel: "strict",
  });

  await db.command({
    [command]: "files",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "name", "extension", "userId", "parentDirId"],
        properties: {
          _id: {
            bsonType: "objectId",
          },
          name: {
            bsonType: "string",
          },
          size: {
            bsonType: ["int", "long", "double", "number"],
          },
          extension: {
            bsonType: "string",
          },
          userId: {
            bsonType: "objectId",
          },
          isUploading: {
            bsonType: "bool",
          },
          parentDirId: {
            bsonType: "objectId",
          },
          createdAt: {
            bsonType: "date",
          },
          updatedAt: {
            bsonType: "date",
          },
          __v: {
            bsonType: "int",
          },
        },
        additionalProperties: false,
      },
    },
    validationAction: "error",
    validationLevel: "strict",
  });

  await db.command({
    [command]: "subscriptions",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "razorpaySubscriptionId", "userId"],
        properties: {
          _id: {
            bsonType: "objectId",
          },
          razorpaySubscriptionId: {
            bsonType: "string",
          },
          userId: {
            bsonType: "objectId",
          },
          status: {
            enum: [
              "created",
              "active",
              "pending",
              "past_due",
              "paused",
              "canceled",
              "in_grace",
            ],
          },
          planId: {
            bsonType: "string",
          },
          billingCycle: {
            enum: ["monthly", "yearly"],
          },
          currentPeriodStart: {
            bsonType: "date",
          },
          currentPeriodEnd: {
            bsonType: "date",
          },
          cancelAtPeriodEnd: {
            bsonType: "bool",
          },
          createdAt: {
            bsonType: "date",
          },
          updatedAt: {
            bsonType: "date",
          },
          __v: {
            bsonType: "int",
          },
        },
        additionalProperties: false,
      },
    },
    validationAction: "error",
    validationLevel: "strict",
  });
} catch (err) {
  console.log("Error setting up the database", err);
} finally {
  await client.close();
}
