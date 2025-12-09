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
    motorAngle: Number // Angle du moteur (degrés)
  }],
  
  // Statistiques calculées
  stats: {
    minX: Number,
    maxX: Number,
    minY: Number,
    maxY: Number,
    minZ: Number,
    maxZ: Number,
    avgIntensity: Number,
    pointDensity: Number
  },
  
  // Statut
  status: { type: String, enum: ['collecting', 'completed', 'error'], default: 'collecting' },
  errorMessage: String
}, { timestamps: true });

// Index pour les recherches
LidarMeasurementSchema.index({ userId: 1, measurementDate: -1 });
LidarMeasurementSchema.index({ formId: 1 });

export default model("LidarMeasurement", LidarMeasurementSchema);


