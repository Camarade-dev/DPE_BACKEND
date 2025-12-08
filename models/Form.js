// models/Form.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const FormSchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  userLogin: { type: String, index: true },   // <- dénormalisé pour affichage
  userPseudo:{ type: String },

  // Réponses originales (compatibilité)
  rep1:String, rep2:String, rep3:String, rep4:String, rep5:String, rep6:String,
  rep7:String, rep8:String, rep9:String, rep10:String, rep11:String, rep12:String,
  rep13:String, rep14:String, rep15:String, rep16:String, rep17:String, rep18:String,
  rep19:String,
  
  // Nouvelles clés structurées (pour meilleur parsing)
  rep6_surface: String, rep6_hauteur: String,
  rep7_type: String, rep7_niveaux: String,
  rep9_type_toiture: String, rep9_isolation_toiture: String, rep9_qualite_toiture: String,
  rep10_qualite_murs: String,
  rep12_qualite_plancher: String,
  rep13_qualite_menuiseries: String,
  rep15_energie_chauffage: String,
  rep16_type_chauffage: String,
  rep17_energie_ecs: String,
  rep18_ventilation: String,
  rep19_climatisation: String,
  rep8_mitoyen: String,
  rep11_materiau_murs: String,

  // Données structurées pour le DPE (extrait des réponses)
  dpeData: {
    code_departement_ban: Number,
    annee_construction: Number,
    hauteur_sous_plafond: Number,
    nombre_niveau_logement: Number,
    surface_habitable_logement: Number,
    isolation_toiture: Number,
    qualite_isolation_murs: String,
    qualite_isolation_plancher_haut_comble_amenage: String,
    qualite_isolation_plancher_haut_comble_perdu: String,
    qualite_isolation_plancher_haut_toit_terrasse: String,
    qualite_isolation_plancher_bas: String,
    qualite_isolation_menuiseries: String,
    type_energie_n1: String,
    type_energie_n2: String,
    type_energie_n3: String,
    type_energie_principale_chauffage: String,
    type_energie_principale_ecs: String,
    type_energie_climatisation: String,
  },

  // Résultats du DPE (calculés par l'IA)
  dpeResults: {
    classe_dpe_finale: String,
    etiquette_energie: String,
    etiquette_climat: String,
    ubat_w_par_m2_k: Number,
    conso_5_usages_par_m2_ef: Number,
    conso_5_usages_par_m2_ep: Number,
    conso_chauffage_ep_par_m2: Number,
    conso_ecs_ep_par_m2: Number,
    emission_ges_5_usages_par_m2: Number,
    emission_ges_chauffage_par_m2: Number,
    emission_ges_ecs_par_m2: Number,
    score_ubat: Number,
    score_chauffage_ep: Number,
    score_ecs_ep: Number,
    score_ges_chauffage: Number,
    score_ges_ecs: Number,
  },

  dpeCalculated: { type: Boolean, default: false },
  dpeCalculatedAt: Date,
  dpeDataHash: { type: String, index: true }, // Hash des données DPE pour le cache

  // Réponse RAG (conseils de rénovation)
  ragResponse: { type: String },
  ragSources: [{
    file_name: String,
    page: String,
    score: Number
  }],
  ragGenerated: { type: Boolean, default: false },
  ragGeneratedAt: Date,
  dpeResultsHash: { type: String, index: true } // Hash des résultats DPE pour le cache RAG
}, { timestamps: true }); // createdAt, updatedAt

export default model("Form", FormSchema);
