// models/Form.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const FormSchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  userLogin: { type: String, index: true },   // <- dénormalisé pour affichage
  userPseudo:{ type: String },

  // tes 18 réponses :
  rep1:String, rep2:String, rep3:String, rep4:String, rep5:String, rep6:String,
  rep7:String, rep8:String, rep9:String, rep10:String, rep11:String, rep12:String,
  rep13:String, rep14:String, rep15:String, rep16:String, rep17:String, rep18:String
}, { timestamps: true }); // createdAt, updatedAt

export default model("Form", FormSchema);
