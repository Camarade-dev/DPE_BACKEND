// routes/forms.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import Form from "../models/Form.js";

const router = Router();

router.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

router.use((req, res, next) => {
  const token = req.cookies?.[process.env.COOKIE_NAME];
  if (!token) return res.status(401).json({ ok:false, error:"Non connecté" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, login, pseudo }
    next();
  } catch {
    return res.status(401).json({ ok:false, error:"Token invalide" });
  }
});

// Créer un formulaire + attacher l'utilisateur
router.post("/", async (req, res) => {
  const form = await Form.create({
    userId: req.user.id,
    userLogin: req.user.login,
    userPseudo: req.user.pseudo,
    ...req.body
  });
  res.json({ ok:true, data:{ id: form._id } });
});

// Lister ceux du user connecté
router.get("/", async (req, res) => {
  const forms = await Form.find({ userId: req.user.id }).sort({ createdAt:-1 });
  res.json({ ok:true, data:forms });
});

export default router;
