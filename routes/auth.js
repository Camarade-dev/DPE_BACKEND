// routes/auth.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = Router();

// POST /api/auth/login (publique)
router.post("/login", async (req, res) => {
  console.log("[AUTH] POST /login", req.body);
  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ ok:false, error:"Champs manquants" });

  try {
    const user = await User.findOne({ login });
    if (!user) return res.status(401).json({ ok:false, error:"Utilisateur inconnu" });

  const valid = bcrypt.compareSync(password, user.passHash);
  if (!valid) return res.status(401).json({ ok:false, error:"Mot de passe incorrect" });

  const token = jwt.sign(
    { id:user._id, pseudo:user.pseudo, login:user.login },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

    // Configuration des cookies pour la production (HTTPS) et développement (HTTP)
    const isProduction = process.env.NODE_ENV === 'production' || process.env.PORT;
    const cookieOptions = {
      httpOnly: true,
      path: "/",
      sameSite: isProduction ? "none" : "lax", // "none" requis pour cross-origin en HTTPS
      secure: isProduction, // true en production (HTTPS), false en dev (HTTP)
    };
    
    res.cookie(process.env.COOKIE_NAME || 'auth_token', token, cookieOptions);

    res.json({ ok: true, data: { pseudo: user.pseudo } });
  } catch (error) {
    console.error("[AUTH] Erreur lors du login:", error);
    res.status(500).json({ ok: false, error: "Erreur serveur lors de la connexion" });
  }
});

// POST /api/auth/logout (publique : on peut clear le cookie même sans token)
router.post("/logout", (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.PORT;
  res.clearCookie(process.env.COOKIE_NAME || 'auth_token', { 
    path: "/",
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction
  });
  res.json({ ok:true });
});

// GET /api/auth/me (publique : renvoie null si pas de cookie)
router.get("/me", (req, res) => {
  const token = req.cookies?.[process.env.COOKIE_NAME];
  if (!token) return res.json({ ok:true, data:null });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ ok:true, data: decoded });
  } catch {
    res.json({ ok:true, data:null });
  }
});
router.post("/register", async (req, res) => {
  console.log("[AUTH] POST /register", req.body);
  const { login, password, pseudo } = req.body || {};
  if (!login || !password || !pseudo) {
    return res.status(400).json({ ok:false, error:"Champs manquants" });
  }
  if (password.length < 6) {
    return res.status(400).json({ ok:false, error:"Mot de passe trop court (min 6)" });
  }

  const exists = await User.findOne({ login });
  if (exists) {
    return res.status(409).json({ ok:false, error:"Login déjà utilisé" });
  }

  const passHash = bcrypt.hashSync(password, 10);
  const user = await User.create({ login, pseudo, passHash });

  const token = jwt.sign(
    { id:user._id, pseudo:user.pseudo, login:user.login },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  // Configuration des cookies pour cross-origin (production HTTPS)
  const isProduction = process.env.NODE_ENV === 'production' || process.env.PORT;
  const cookieOptions = {
    httpOnly: true,
    path: "/",
    sameSite: isProduction ? "none" : "lax", // "none" requis pour cross-origin en HTTPS
    secure: isProduction, // true en production (HTTPS), false en dev (HTTP)
  };
  
  res.cookie(process.env.COOKIE_NAME || 'auth_token', token, cookieOptions);

  res.json({ ok:true, data:{ pseudo:user.pseudo } });
});
export default router;
