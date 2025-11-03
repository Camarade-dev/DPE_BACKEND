import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

dotenv.config();
const app = express();

app.use(express.json());
app.use(cookieParser());

app.use(morgan("dev"));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:8000',
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// Répondre aux préflights sans router (compatible Express 5)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
import authRoutes from "./routes/auth.js";
import formRoutes from "./routes/forms.js";

app.use("/api/auth", authRoutes);
app.use("/api/forms", formRoutes);

// Exemple de route test
app.get("/api/test", (req, res) => {
  res.json({ ok: true, message: "API opérationnelle 🚀" });
});

// Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connecté à MongoDB"))
  .catch(err => console.error("Erreur MongoDB:", err));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("✅ API en écoute sur port", port));
