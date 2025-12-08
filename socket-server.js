// socket-server.js
// Serveur socket TCP pour recevoir les données du robot LIDAR
import net from "net";
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const SOCKET_PORT = process.env.LIDAR_SOCKET_PORT || 65432;
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";

/**
 * Envoie les données au backend via HTTP
 */
async function sendToBackend(rawData, robotIp, userId, formId = null, measurementId = null) {
  try {
    const url = `${BACKEND_URL}/api/lidar-public/stream`;
    
    const payload = {
      rawData: rawData,
      robotIp: robotIp,
      userId: userId,
      formId: formId,
      isLast: false
    };
    
    if (measurementId) {
      payload.measurementId = measurementId;
    }
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erreur envoi au backend:", errorText);
      return null;
    }
    
    const result = await response.json();
    return result.data?.measurementId;
  } catch (error) {
    console.error("Erreur lors de l'envoi au backend:", error);
    return null;
  }
}

/**
 * Finalise une mesure dans le backend
 */
async function finalizeMeasurement(measurementId, robotIp, userId) {
  try {
    const url = `${BACKEND_URL}/api/lidar-public/stream`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawData: "", // Données vides pour finaliser
        measurementId: measurementId,
        robotIp: robotIp,
        userId: userId,
        isLast: true
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error("Erreur lors de la finalisation:", error);
    return false;
  }
}

// Créer le serveur socket TCP
const server = net.createServer((socket) => {
  console.log(`✅ Client connecté: ${socket.remoteAddress}:${socket.remotePort}`);
  
  let measurementId = null;
  let buffer = "";
  let packetCount = 0;
  const robotIp = socket.remoteAddress;
  // TODO: Récupérer le userId depuis la connexion (première ligne envoyée par le robot)
  // Pour l'instant, utiliser un userId par défaut ou depuis les variables d'env
  const userId = process.env.ROBOT_USER_ID || "default";
  
  socket.on("data", async (data) => {
    try {
      buffer += data.toString("utf-8");
      
      // Traiter les paquets complets (séparés par ";")
      const packets = buffer.split(";");
      buffer = packets.pop() || ""; // Garder le dernier paquet incomplet dans le buffer
      
      for (const packet of packets) {
        if (packet.trim()) {
          packetCount++;
          
          // Envoyer au backend
          if (!measurementId) {
            const result = await sendToBackend(packet, robotIp, userId);
            if (result) {
              measurementId = result;
            }
          } else {
            await sendToBackend(packet, robotIp, userId, null, measurementId);
          }
          
          // Log tous les 100 paquets
          if (packetCount % 100 === 0) {
            console.log(`📦 ${packetCount} paquets reçus de ${robotIp}`);
          }
        }
      }
    } catch (error) {
      console.error("Erreur lors du traitement des données:", error);
    }
  });
  
  socket.on("end", async () => {
    console.log(`🔌 Client déconnecté: ${socket.remoteAddress}`);
    
    // Finaliser la mesure si elle existe
    if (measurementId) {
      console.log(`✅ Finalisation de la mesure ${measurementId}`);
      await finalizeMeasurement(measurementId, robotIp, userId);
      console.log(`✅ Mesure finalisée: ${packetCount} paquets reçus`);
    }
  });
  
  socket.on("error", (error) => {
    console.error(`❌ Erreur socket: ${error.message}`);
  });
});

server.listen(SOCKET_PORT, "0.0.0.0", () => {
  console.log(`✅ Serveur socket LIDAR en écoute sur le port ${SOCKET_PORT}`);
  console.log(`📡 En attente de connexion du robot...`);
});

server.on("error", (error) => {
  console.error(`❌ Erreur serveur socket: ${error.message}`);
});

