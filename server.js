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

// Configuration CORS améliorée
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:8000',
      'http://localhost:4200',
      process.env.CORS_ORIGIN
    ].filter(Boolean);
    
    // En développement, autoriser toutes les origines locales
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie']
};

app.use(cors(corsOptions));

// Répondre aux préflights sans router (compatible Express 5)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:8000');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
    return res.sendStatus(204);
  }
  next();
});
import authRoutes from "./routes/auth.js";
import formRoutes from "./routes/forms.js";
import lidarRoutes from "./routes/lidar.js";
import lidarPublicRoutes from "./routes/lidar-public.js";

app.use("/api/auth", authRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/lidar", lidarRoutes);
app.use("/api/lidar-public", lidarPublicRoutes);

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
