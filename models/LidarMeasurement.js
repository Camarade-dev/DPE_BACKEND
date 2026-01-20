// models/LidarMeasurement.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const LidarMeasurementSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  formId: { type: Schema.Types.ObjectId, ref: "Form", index: true }, // Optionnel : lier à un formulaire
  
  // Métadonnées de la mesure
  measurementDate: { type: Date, default: Date.now, index: true },
  robotIp: String,
  totalPoints: Number,
  
  // Points LIDAR (coordonnées 3D)
  points: [{
    x: Number,      // Coordonnée X (mètres)
    y: Number,      // Coordonnée Y (mètres)
    z: Number,      // Coordonnée Z (mètres)
    intensity: Number, // Intensité du signal
    angle: Number,     // Angle LIDAR (degrés)
    distance: Number,   // Distance brute (mm)
    motorAngle: Number, // Angle du moteur M1 (degrés)
    temperature: Number // Température (°C) - optionnel, ajouté par fusion thermique
  }],
  
  // Images thermiques reçues (pour fusion)
  thermalImages: [{
    matrix: [[Number]], // Matrice de températures (80x62 pour MI48)
    m1Angle: Number,    // Angle moteur M1 au moment de la capture
    m2Angle: Number,   // Angle moteur M2 au moment de la capture
    timestamp: Date    // Timestamp de la capture
  }],
  
  // Paramètres de fusion thermique
  thermalFusion: {
    fovHorizontal: Number,  // FOV horizontal (44° pour MI48)
    fovVertical: Number,    // FOV vertical (35° pour MI48)
    resolutionX: Number,    // Résolution X (80 pour MI48)
    resolutionY: Number,   // Résolution Y (62 pour MI48)
    fusionCompleted: Boolean // Indique si la fusion a été effectuée
  },
  
  // Statistiques calculées
  stats: {
    minX: Number,
    maxX: Number,
    minY: Number,
    maxY: Number,
    minZ: Number,
    maxZ: Number,
    avgIntensity: Number,
    pointDensity: Number,
    minTemperature: Number,  // Température minimale (°C)
    maxTemperature: Number,  // Température maximale (°C)
    avgTemperature: Number   // Température moyenne (°C)
  },
  
  // Statut
  status: { type: String, enum: ['collecting', 'completed', 'error'], default: 'collecting' },
  errorMessage: String
}, { timestamps: true });

// Index pour les recherches
LidarMeasurementSchema.index({ userId: 1, measurementDate: -1 });
LidarMeasurementSchema.index({ formId: 1 });

export default model("LidarMeasurement", LidarMeasurementSchema);












