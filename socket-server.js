// socket-server.js
// Serveur Socket.io pour le temps réel LiDAR
import { Server } from "socket.io";
import mongoose from "mongoose";
import LidarMeasurement from "./models/LidarMeasurement.js";
import User from "./models/User.js";

// Fonctions utilitaires (réutilisées depuis lidar-public.js)
function convertTo3DPoints(rawData) {
  const points = [];
  
  if (!rawData || !rawData.trim()) {
    return points;
  }
  
  // Détecter le format: "angle_m1|angle1,dist1,inten1;angle2,dist2,inten2;..."
  let motorAngle = 0; // Angle du moteur M1 (horizontal)
  let dataToParse = rawData;
  
  if (rawData.includes("|")) {
    const parts = rawData.split("|");
    if (parts.length === 2) {
      motorAngle = parseFloat(parts[0]);
      dataToParse = parts[1];
      
      // Valider que motorAngle est un nombre valide
      if (isNaN(motorAngle) || !isFinite(motorAngle)) {
        console.warn("⚠️ Angle moteur invalide, utilisation de 0");
        motorAngle = 0;
      }
    }
  }
  
  const lines = dataToParse.split(";").filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const parts = line.split(",").map(s => {
        const val = parseFloat(s.trim());
        return isNaN(val) || !isFinite(val) ? null : val;
      });
      
      // Format attendu: angle,dist,inten (3 valeurs)
      // ou angle,dist,inten,anglemot (4 valeurs - format ancien)
      let angle, dist, inten, anglemot;
      
      if (parts.length >= 3) {
        angle = parts[0];
        dist = parts[1];
        inten = parts[2];
        anglemot = parts.length >= 4 ? parts[3] : motorAngle; // Utiliser motorAngle si non fourni
      } else {
        continue; // Ignorer les lignes invalides
      }
      
      // Valider que toutes les valeurs sont des nombres valides
      if (angle === null || dist === null || inten === null || anglemot === null) {
        continue; // Ignorer les points avec valeurs invalides
      }
      
      // Valider les contraintes
      if (inten < 0 || dist <= 0 || dist >= 12000) {
        continue; // Ignorer les points invalides
      }
      
      // Calculer les coordonnées 3D
      const angleRad = (angle * Math.PI) / 180;
      const motorRad = (anglemot * Math.PI) / 180;
      
      const z = -dist * Math.sin(angleRad);
      const y = dist * Math.cos(angleRad) * Math.sin(motorRad);
      const x = dist * Math.cos(angleRad) * Math.cos(motorRad);
      
      // Vérifier que les calculs ont produit des nombres valides
      if (isNaN(x) || isNaN(y) || isNaN(z) || !isFinite(x) || !isFinite(y) || !isFinite(z)) {
        console.warn(`⚠️ Point invalide ignoré: angle=${angle}, dist=${dist}, anglemot=${anglemot}`);
        continue;
      }
      
      points.push({
        x: x / 1000, // Convertir mm en mètres
        y: y / 1000,
        z: z / 1000,
        intensity: inten,
        angle: angle,
        distance: dist,
        motorAngle: anglemot
      });
    } catch (err) {
      console.error("Erreur parsing point:", line, err);
      continue; // Ignorer ce point et continuer
    }
  }
  
  return points;
}

function calculateStats(points) {
  if (points.length === 0) {
    return {
      minX: 0, maxX: 0,
      minY: 0, maxY: 0,
      minZ: 0, maxZ: 0,
      avgIntensity: 0,
      pointDensity: 0,
      minTemperature: null,
      maxTemperature: null,
      avgTemperature: null
    };
  }
  
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const zs = points.map(p => p.z);
  const intensities = points.map(p => p.intensity);
  const temperatures = points.map(p => p.temperature).filter(t => t !== undefined && t !== null);
  
  const stats = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    avgIntensity: intensities.reduce((a, b) => a + b, 0) / intensities.length,
    pointDensity: points.length
  };
  
  if (temperatures.length > 0) {
    stats.minTemperature = Math.min(...temperatures);
    stats.maxTemperature = Math.max(...temperatures);
    stats.avgTemperature = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
  } else {
    stats.minTemperature = null;
    stats.maxTemperature = null;
    stats.avgTemperature = null;
  }
  
  return stats;
}

/**
 * Effectue la fusion spatiale entre les points LIDAR et les images thermiques
 * Inspiré du code Python fourni
 */
async function performThermalFusion(measurement) {
  if (!measurement.thermalImages || measurement.thermalImages.length === 0) {
    return;
  }
  
  const fusion = measurement.thermalFusion || {
    fovHorizontal: 44.0,
    fovVertical: 35.0,
    resolutionX: 80,
    resolutionY: 62
  };
  
  const FOV_H = fusion.fovHorizontal;
  const FOV_V = fusion.fovVertical;
  const RES_X = fusion.resolutionX;
  const RES_Y = fusion.resolutionY;
  const DX = FOV_H / RES_X;
  const DY = FOV_V / RES_Y;
  
  // Pour chaque point LIDAR, chercher la température correspondante
  let pointsWithTemp = 0;
  
  for (const point of measurement.points) {
    const a_lidar = point.angle; // Angle vertical (élévation)
    const m1_lidar = point.motorAngle; // Angle horizontal (azimut)
    const temperatures = [];
    
    // Parcourir toutes les images thermiques
    for (const thermalImg of measurement.thermalImages) {
      const m1_img = thermalImg.m1Angle;
      const m2_img = thermalImg.m2Angle;
      
      // Calculer les écarts angulaires
      const delta_h = m1_lidar - m1_img; // Écart horizontal
      const delta_v = a_lidar - m2_img;  // Écart vertical
      
      // Vérifier si le point est dans le champ de vision
      if (Math.abs(delta_h) <= (FOV_H / 2) && Math.abs(delta_v) <= (FOV_V / 2)) {
        // Calculer les coordonnées du pixel dans l'image
        const col = Math.floor((delta_h + (FOV_H / 2)) / DX);
        const row = Math.floor((delta_v + (FOV_V / 2)) / DY);
        
        // Vérifier que les coordonnées sont valides
        if (col >= 0 && col < RES_X && row >= 0 && row < RES_Y) {
          // Récupérer la température du pixel
          if (thermalImg.matrix && 
              Array.isArray(thermalImg.matrix) && 
              thermalImg.matrix[row] && 
              thermalImg.matrix[row][col] !== undefined) {
            const temp = thermalImg.matrix[row][col];
            if (!isNaN(temp) && temp !== null) {
              temperatures.push(temp);
            }
          }
        }
      }
    }
    
    // Si au moins une température a été trouvée, calculer la moyenne
    if (temperatures.length > 0) {
      const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
      point.temperature = avgTemp;
      pointsWithTemp++;
    }
  }
  
  // Marquer la fusion comme terminée
  if (!measurement.thermalFusion) {
    measurement.thermalFusion = {};
  }
  measurement.thermalFusion.fusionCompleted = true;
  
  console.log(`✅ Fusion: ${pointsWithTemp}/${measurement.points.length} points ont une température (${(pointsWithTemp/measurement.points.length*100).toFixed(1)}%)`);
}

/**
 * Résout le userId en ObjectId valide
 * Si userId n'est pas un ObjectId, cherche l'utilisateur par login ou pseudo
 */
async function resolveUserId(userId) {
  if (!userId) {
    return null;
  }

  // Vérifier si c'est déjà un ObjectId valide
  if (mongoose.Types.ObjectId.isValid(userId)) {
    return new mongoose.Types.ObjectId(userId);
  }

  // Sinon, chercher l'utilisateur par login ou pseudo
  try {
    const user = await User.findOne({
      $or: [
        { login: userId },
        { pseudo: userId }
      ]
    });

    if (user) {
      return user._id;
    }

    // Si aucun utilisateur trouvé, retourner null
    console.warn(`⚠️  Utilisateur non trouvé pour: ${userId}`);
    return null;
  } catch (error) {
    console.error(`❌ Erreur lors de la recherche de l'utilisateur ${userId}:`, error);
    return null;
  }
}

/**
 * Initialise le serveur Socket.io
 */
export function initSocketServer(httpServer, corsOptions) {
  const io = new Server(httpServer, {
    cors: corsOptions,
    transports: ['websocket', 'polling']
  });

  // Stocker les mesures en cours par userId
  const activeMeasurements = new Map();

  io.on("connection", (socket) => {
    console.log(`✅ Client connecté: ${socket.id}`);

    // Connexion du robot
    socket.on("robot:connect", async (data) => {
      const { userId, formId, robotIp } = data;
      
      // Résoudre le userId en ObjectId valide
      const resolvedUserId = await resolveUserId(userId);
      if (!resolvedUserId) {
        socket.emit("error", { 
          message: `Utilisateur non trouvé: ${userId}. Vérifiez que le login/pseudo existe dans la base de données.` 
        });
        return;
      }
      
      console.log(`🤖 Robot connecté: ${robotIp} pour userId ${resolvedUserId} (${userId})`);
      
      // Associer le socket au userId résolu
      socket.userId = resolvedUserId.toString();
      socket.robotIp = robotIp;
      socket.formId = formId;
      
      socket.emit("connected", { ok: true, userId: resolvedUserId.toString() });
    });

    // Réception des images thermiques du robot
    socket.on("thermal:image", async (data) => {
      try {
        const { measurementId, userId, formId, robotIp, imageData, m1Angle, m2Angle } = data;
        
        if (!userId) {
          socket.emit("error", { message: "userId requis" });
          return;
        }

        const resolvedUserId = await resolveUserId(userId);
        if (!resolvedUserId) {
          socket.emit("error", { 
            message: `Utilisateur non trouvé: ${userId}` 
          });
          return;
        }

        let measurement;
        
        if (measurementId) {
          measurement = await LidarMeasurement.findOne({
            _id: measurementId,
            userId: resolvedUserId,
            status: { $in: ['collecting', 'completed'] }
          });
        } else {
          // Chercher la dernière mesure en cours
          measurement = await LidarMeasurement.findOne({
            userId: resolvedUserId,
            status: { $in: ['collecting', 'completed'] }
          }).sort({ createdAt: -1 });
        }
        
        if (!measurement) {
          socket.emit("error", { message: "Aucune mesure trouvée pour cette image thermique" });
          return;
        }
        
        // Initialiser les paramètres de fusion si nécessaire
        if (!measurement.thermalFusion) {
          measurement.thermalFusion = {
            fovHorizontal: 44.0,
            fovVertical: 35.0,
            resolutionX: 80,
            resolutionY: 62,
            fusionCompleted: false
          };
        }
        
        // Ajouter l'image thermique
        if (!measurement.thermalImages) {
          measurement.thermalImages = [];
        }
        
        measurement.thermalImages.push({
          matrix: imageData, // Matrice 80x62 de températures
          m1Angle: m1Angle || 0,
          m2Angle: m2Angle || 0,
          timestamp: new Date()
        });
        
        await measurement.save();
        
        console.log(`📸 Image thermique reçue: M1=${m1Angle}°, M2=${m2Angle}° pour mesure ${measurement._id}`);
        
        socket.emit("thermal:ack", {
          ok: true,
          measurementId: measurement._id.toString(),
          imageCount: measurement.thermalImages.length
        });
        
      } catch (error) {
        console.error("Erreur lors du traitement de l'image thermique:", error);
        socket.emit("error", { message: "Erreur serveur lors du traitement de l'image thermique" });
      }
    });

    // Réception des données LiDAR du robot
    socket.on("lidar:data", async (data) => {
      try {
        const { rawData, userId, formId, robotIp, isLast, measurementId } = data;
        console.log("🔄 Données LiDAR reçues:", data);
        if (!userId) {
          socket.emit("error", { message: "userId requis" });
          return;
        }

        // Résoudre le userId en ObjectId valide
        const resolvedUserId = await resolveUserId(userId);
        if (!resolvedUserId) {
          socket.emit("error", { 
            message: `Utilisateur non trouvé: ${userId}. Vérifiez que le login/pseudo existe dans la base de données.` 
          });
          return;
        }

        let measurement;

        if (measurementId) {
          // Continuer une mesure existante
          measurement = await LidarMeasurement.findOne({
            _id: measurementId,
            userId: resolvedUserId,
            status: 'collecting'
          });
          
          if (!measurement) {
            socket.emit("error", { message: "Mesure non trouvée ou déjà terminée" });
            return;
          }
          
          // Ajouter les nouveaux points
          if (rawData && rawData.trim()) {
            const newPoints = convertTo3DPoints(rawData);
            measurement.points.push(...newPoints);
            measurement.totalPoints = measurement.points.length;
          }
        } else {
          // Vérifier s'il existe déjà une mesure en cours pour cet utilisateur
          measurement = await LidarMeasurement.findOne({
            userId: resolvedUserId,
            status: 'collecting'
          }).sort({ createdAt: -1 });
          
          if (!measurement) {
            // Créer une nouvelle mesure seulement si aucune mesure en cours n'existe
            if (!rawData || !rawData.trim()) {
              socket.emit("error", { message: "Données brutes requises pour créer une nouvelle mesure" });
              return;
            }
            
            const points = convertTo3DPoints(rawData);
            
            if (points.length === 0) {
              socket.emit("error", { message: "Aucun point valide trouvé dans les données" });
              return;
            }
            
            measurement = await LidarMeasurement.create({
              userId: resolvedUserId,
              formId: formId || null,
              robotIp: robotIp || socket.handshake.address,
              totalPoints: points.length,
              points: points,
              status: 'collecting'
            });
            
            // Envoyer l'ID de la mesure au robot
            socket.emit("measurement_created", { measurementId: measurement._id });
            console.log(`📝 Nouvelle mesure créée: ${measurement._id} pour userId ${resolvedUserId}`);
          } else {
            // Utiliser la mesure existante et ajouter les nouveaux points
            if (rawData && rawData.trim()) {
              const newPoints = convertTo3DPoints(rawData);
              measurement.points.push(...newPoints);
              measurement.totalPoints = measurement.points.length;
            }
            // Envoyer l'ID de la mesure existante au robot (au cas où il ne l'aurait pas)
            socket.emit("measurement_created", { measurementId: measurement._id });
          }
        }
        
        // Si c'est le dernier paquet, calculer les stats et finaliser
        if (isLast) {
          measurement.stats = calculateStats(measurement.points);
          measurement.status = 'completed';
          
          // Si des images thermiques sont disponibles, effectuer la fusion
          if (measurement.thermalImages && measurement.thermalImages.length > 0) {
            console.log(`🔄 Fusion thermique en cours: ${measurement.thermalImages.length} images pour ${measurement.points.length} points...`);
            await performThermalFusion(measurement);
            measurement.stats = calculateStats(measurement.points); // Recalculer avec températures
            console.log(`✅ Fusion thermique terminée`);
          }
          
          console.log(`✅ Mesure LIDAR finalisée: ${measurement.totalPoints} points pour userId ${resolvedUserId} (${userId})`);
        }
        
        await measurement.save();
        
        // Diffuser la mise à jour à tous les clients frontend connectés (même userId)
        io.emit("lidar:update", {
          measurementId: measurement._id.toString(),
          userId: resolvedUserId.toString(),
          totalPoints: measurement.totalPoints,
          status: measurement.status,
          stats: measurement.stats
        });
        
        // Confirmation au robot
        socket.emit("lidar:ack", {
          ok: true,
          measurementId: measurement._id.toString(),
          totalPoints: measurement.totalPoints
        });
        
      } catch (error) {
        console.error("Erreur lors du traitement des données LiDAR:", error);
        socket.emit("error", { message: "Erreur serveur lors du traitement" });
      }
    });

    // Déconnexion
    socket.on("disconnect", () => {
      console.log(`❌ Client déconnecté: ${socket.id}`);
      if (socket.userId) {
        activeMeasurements.delete(socket.userId);
      }
    });
  });

  return io;
}
