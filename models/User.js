import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  login: { type: String, required: true, unique: true },
  pseudo: { type: String, required: true },
  passHash: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model("User", userSchema);
