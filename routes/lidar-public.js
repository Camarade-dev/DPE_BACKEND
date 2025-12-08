// routes/lidar-public.js
// Routes publiques pour le robot (sans authentification JWT)
import { Router } from "express";
import LidarMeasurement from "../models/LidarMeasurement.js";

const router = Router();

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
 * Endpoint public pour recevoir les données du robot (sans authentification)
 * POST /api/lidar-public/stream
 * Utilisé par le serveur socket
 */
router.post("/stream", async (req, res) => {
  try {
    const { rawData, measurementId, formId, robotIp, isLast, userId } = req.body;
    
    // userId est requis (peut être passé par le serveur socket)
    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId requis" });
    }
    
    let measurement;
    
    if (measurementId) {
      // Continuer une mesure existante
      measurement = await LidarMeasurement.findOne({
        _id: measurementId,
        userId: userId,
        status: 'collecting'
      });
      
      if (!measurement) {
        return res.status(404).json({ ok: false, error: "Mesure non trouvée ou déjà terminée" });
      }
      
      // Ajouter les nouveaux points
      if (rawData && rawData.trim()) {
        const newPoints = convertTo3DPoints(rawData);
        measurement.points.push(...newPoints);
        measurement.totalPoints = measurement.points.length;
      }
    } else {
      // Créer une nouvelle mesure
      if (!rawData || !rawData.trim()) {
        return res.status(400).json({ ok: false, error: "Données brutes requises pour créer une nouvelle mesure" });
      }
      
      const points = convertTo3DPoints(rawData);
      
      if (points.length === 0) {
        return res.status(400).json({ ok: false, error: "Aucun point valide trouvé dans les données" });
      }
      
      measurement = await LidarMeasurement.create({
        userId: userId,
        formId: formId || null,
        robotIp: robotIp || req.ip,
        totalPoints: points.length,
        points: points,
        status: 'collecting'
      });
    }
    
    // Si c'est le dernier paquet, calculer les stats et finaliser
    if (isLast) {
      measurement.stats = calculateStats(measurement.points);
      measurement.status = 'completed';
      console.log(`✅ Mesure LIDAR finalisée: ${measurement.totalPoints} points pour userId ${userId}`);
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

export default router;

