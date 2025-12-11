// socket-server.js
// Serveur Socket.io pour le temps réel LiDAR
import { Server } from "socket.io";
import mongoose from "mongoose";
import LidarMeasurement from "./models/LidarMeasurement.js";
import User from "./models/User.js";

// Fonctions utilitaires (réutilisées depuis lidar-public.js)
function convertTo3DPoints(rawData) {
  const points = [];
  const lines = rawData.split(";").filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const [angle, dist, inten, anglemot] = line.split(",").map(parseFloat);
      
      if (inten >= 0 && dist > 0 && dist < 12000) {
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

    // Réception des données LiDAR du robot
    socket.on("lidar:data", async (data) => {
      try {
        const { rawData, userId, formId, robotIp, isLast, measurementId } = data;
        
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
          // Créer une nouvelle mesure
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
        }
        
        // Si c'est le dernier paquet, calculer les stats et finaliser
        if (isLast) {
          measurement.stats = calculateStats(measurement.points);
          measurement.status = 'completed';
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
