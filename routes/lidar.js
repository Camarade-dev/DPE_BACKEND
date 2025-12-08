// routes/lidar.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import LidarMeasurement from "../models/LidarMeasurement.js";

const router = Router();

// Middleware d'authentification
router.use((req, res, next) => {
  const token = req.cookies?.[process.env.COOKIE_NAME];
  if (!token) return res.status(401).json({ ok: false, error: "Non connecté" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Token invalide" });
  }
});

/**
 * Convertit les données brutes du robot en points 3D
 */
function convertTo3DPoints(rawData) {
  const points = [];
  const lines = rawData.split(";").filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const [angle, dist, inten, anglemot] = line.split(",").map(parseFloat);
      
      if (inten >= 0 && dist > 0 && dist < 12000) {
        // Conversion en coordonnées 3D (comme dans le client Python)
        const angleRad = (angle * Math.PI) / 180;
        const motorRad = (anglemot * Math.PI) / 180;
        
        const z = -dist * Math.sin(angleRad);
        const y = dist * Math.cos(angleRad) * Math.sin(motorRad);
        const x = dist * Math.cos(angleRad) * Math.cos(motorRad);
        
        points.push({
          x: x / 1000, // Convertir mm en mètres
          y: y / 1000,
          z: z / 1000,
          intensity: inten,
          angle: angle,
          distance: dist,
          motorAngle: anglemot
        });
      }
    } catch (err) {
      console.error("Erreur parsing point:", line, err);
    }
  }
  
  return points;
}

/**
 * Calcule les statistiques des points
 */
function calculateStats(points) {
  if (points.length === 0) {
    return {
      minX: 0, maxX: 0,
      minY: 0, maxY: 0,
      minZ: 0, maxZ: 0,
      avgIntensity: 0,
      pointDensity: 0
    };
  }
  
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const zs = points.map(p => p.z);
  const intensities = points.map(p => p.intensity);
  
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    avgIntensity: intensities.reduce((a, b) => a + b, 0) / intensities.length,
    pointDensity: points.length
  };
}

/**
 * Endpoint pour recevoir les données du robot
 * POST /api/lidar/measurements
 */
router.post("/measurements", async (req, res) => {
  try {
    const { rawData, formId, robotIp } = req.body;
    
    if (!rawData) {
      return res.status(400).json({ ok: false, error: "Données brutes manquantes" });
    }
    
    // Convertir les données brutes en points 3D
    const points = convertTo3DPoints(rawData);
    
    if (points.length === 0) {
      return res.status(400).json({ ok: false, error: "Aucun point valide trouvé dans les données" });
    }
    
    // Calculer les statistiques
    const stats = calculateStats(points);
    
    // Créer la mesure
    const measurement = await LidarMeasurement.create({
      userId: req.user.id,
      formId: formId || null,
      robotIp: robotIp || req.ip,
      totalPoints: points.length,
      points: points,
      stats: stats,
      status: 'completed'
    });
    
    console.log(`✅ Mesure LIDAR enregistrée: ${points.length} points pour userId ${req.user.id}`);
    
    res.json({
      ok: true,
      data: {
        id: measurement._id,
        totalPoints: points.length,
        stats: stats
      }
    });
  } catch (error) {
    console.error("Erreur lors de l'enregistrement de la mesure LIDAR:", error);
    res.status(500).json({ ok: false, error: "Erreur serveur lors de l'enregistrement" });
  }
});

/**
 * Endpoint pour recevoir les données en streaming (pour le robot)
 * POST /api/lidar/stream
 * Le robot peut envoyer plusieurs paquets
 */
router.post("/stream", async (req, res) => {
  try {
    const { rawData, measurementId, formId, robotIp, isLast } = req.body;
    
    if (!rawData) {
      return res.status(400).json({ ok: false, error: "Données brutes manquantes" });
    }
    
    let measurement;
    
    if (measurementId) {
      // Continuer une mesure existante
      measurement = await LidarMeasurement.findOne({
        _id: measurementId,
        userId: req.user.id,
        status: 'collecting'
      });
      
      if (!measurement) {
        return res.status(404).json({ ok: false, error: "Mesure non trouvée ou déjà terminée" });
      }
    } else {
      // Créer une nouvelle mesure
      measurement = await LidarMeasurement.create({
        userId: req.user.id,
        formId: formId || null,
        robotIp: robotIp || req.ip,
        points: [],
        status: 'collecting'
      });
    }
    
    // Convertir et ajouter les points
    const newPoints = convertTo3DPoints(rawData);
    measurement.points.push(...newPoints);
    measurement.totalPoints = measurement.points.length;
    
    // Si c'est le dernier paquet, calculer les stats et finaliser
    if (isLast) {
      measurement.stats = calculateStats(measurement.points);
      measurement.status = 'completed';
    }
    
    await measurement.save();
    
    res.json({
      ok: true,
      data: {
        measurementId: measurement._id,
        totalPoints: measurement.totalPoints,
        status: measurement.status
      }
    });
  } catch (error) {
    console.error("Erreur lors du streaming LIDAR:", error);
    res.status(500).json({ ok: false, error: "Erreur serveur lors du streaming" });
  }
});

/**
 * Lister toutes les mesures de l'utilisateur
 * GET /api/lidar/measurements
 */
router.get("/measurements", async (req, res) => {
  try {
    const measurements = await LidarMeasurement.find({ userId: req.user.id })
      .sort({ measurementDate: -1 })
      .select("_id measurementDate totalPoints stats status formId createdAt")
      .limit(100);
    
    res.json({ ok: true, data: measurements });
  } catch (error) {
    console.error("Erreur lors de la récupération des mesures:", error);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

/**
 * Obtenir une mesure spécifique avec tous ses points
 * GET /api/lidar/measurements/:id
 */
router.get("/measurements/:id", async (req, res) => {
  try {
    const measurement = await LidarMeasurement.findOne({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!measurement) {
      return res.status(404).json({ ok: false, error: "Mesure non trouvée" });
    }
    
    res.json({ ok: true, data: measurement });
  } catch (error) {
    console.error("Erreur lors de la récupération de la mesure:", error);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

/**
 * Supprimer une mesure
 * DELETE /api/lidar/measurements/:id
 */
router.delete("/measurements/:id", async (req, res) => {
  try {
    const measurement = await LidarMeasurement.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!measurement) {
      return res.status(404).json({ ok: false, error: "Mesure non trouvée" });
    }
    
    res.json({ ok: true, message: "Mesure supprimée" });
  } catch (error) {
    console.error("Erreur lors de la suppression:", error);
    res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

export default router;

