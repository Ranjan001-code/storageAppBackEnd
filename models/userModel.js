import { model, Schema } from "mongoose";
import mongoose, { Types } from "mongoose";
import bcrypt from "bcrypt";
import { type } from "os";
import mongooseLong from "mongoose-long";
mongooseLong(mongoose);
const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      minLength: [
        3,
        "name field should a string with at least three characters",
      ],
    },
    email: {
      type: String,
      required: true,
      unique: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,}$/,
        "please enter a valid email",
      ],
    },
    password: {
      type: String,
      minLength: 4,
    },
    rootDirId: {
      type: Schema.Types.ObjectId,
      ref: "Directory",
    },
    picture: {
      type: String,
      default:
        "https://static.vecteezy.com/system/resources/previews/002/318/271/non_2x/user-profile-icon-free-vector.jpg",
    },
    role: {
      type: String,
      enum: ["Admin", "Manager", "User"],
      default: "User",
    },
    maxStorageInBytes: {
      type: mongoose.Schema.Types.Long,
      required: true,
      default: 2 * 1024 ** 3,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
  },
  {
    strict: "throw",
  }
);

//here this points to the current doc being saved, so we can access the password field and hash it before saving to the database
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = model("User", userSchema);

export default User;
