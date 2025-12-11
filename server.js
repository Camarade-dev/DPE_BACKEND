import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { createServer } from "http";
import { initSocketServer } from "./socket-server.js";

dotenv.config();
const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(cookieParser());

app.use(morgan("dev"));

// Configuration CORS améliorée
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:8000',
      'http://localhost:4200',
      process.env.CORS_ORIGIN,
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    // En développement, autoriser toutes les origines locales
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
      callback(null, true);
    } 
    // Autoriser les domaines Vercel (production)
    else if (origin && origin.includes('vercel.app')) {
      callback(null, true);
    }
    // Autoriser les domaines Netlify (production)
    else if (origin && origin.includes('netlify.app')) {
      callback(null, true);
    }
    // Autoriser les domaines Render (production)
    else if (origin && origin.includes('onrender.com')) {
      callback(null, true);
    }
    else {
      console.log('CORS bloqué pour:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
};

app.use(cors(corsOptions));

// Middleware pour ajouter les headers CORS à toutes les réponses (même en cas d'erreur)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Fonction pour définir les headers CORS
  const setCorsHeaders = () => {
    if (origin && (
      origin.startsWith('http://localhost:') ||
      origin.includes('vercel.app') ||
      origin.includes('netlify.app') ||
      origin.includes('onrender.com') ||
      origin === process.env.CORS_ORIGIN ||
      origin === process.env.FRONTEND_URL
    )) {
      res.header('Access-Control-Allow-Origin', origin);
    } else if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Cookie');
  };
  
  // Répondre aux préflights
  if (req.method === 'OPTIONS') {
    setCorsHeaders();
    return res.sendStatus(204);
  }
  
  // Ajouter les headers CORS à toutes les réponses
  setCorsHeaders();
  
  // Intercepter les erreurs pour s'assurer que les headers CORS sont toujours présents
  const originalSend = res.send;
  res.send = function(data) {
    setCorsHeaders();
    return originalSend.call(this, data);
  };
  
  const originalJson = res.json;
  res.json = function(data) {
    setCorsHeaders();
    return originalJson.call(this, data);
  };
  
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

// Connexion à MongoDB avec options améliorées
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000, // Timeout de 5 secondes au lieu de 10
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  retryWrites: true,
  w: 'majority'
};

mongoose.connect(process.env.MONGO_URI, mongooseOptions)
  .then(() => console.log("✅ Connecté à MongoDB"))
  .catch(err => {
    console.error("❌ Erreur MongoDB:", err.message);
    console.error("💡 Vérifiez que l'IP de Render est whitelistée dans MongoDB Atlas");
    console.error("💡 Dans MongoDB Atlas, allez dans Network Access et ajoutez 0.0.0.0/0 (toutes les IPs)");
  });

// Initialiser Socket.io
const io = initSocketServer(httpServer, corsOptions);

const port = process.env.PORT || 3000;
httpServer.listen(port, () => {
  console.log("✅ API en écoute sur port", port);
  console.log("✅ Socket.io activé pour le temps réel");
});
