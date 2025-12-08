// routes/forms.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Form from "../models/Form.js";
import { parseFormToDPEData } from "../utils/dpeParser.js";

const router = Router();

/**
 * Génère un hash MD5 des données DPE pour identifier les calculs identiques
 */
function hashDPEData(dpeData) {
  if (!dpeData) return null;
  // Créer une chaîne stable à partir des données DPE
  const dataString = JSON.stringify(dpeData, Object.keys(dpeData).sort());
  return crypto.createHash('md5').update(dataString).digest('hex');
}

/**
 * Génère un hash MD5 des résultats DPE pour identifier les RAG identiques
 */
function hashDPEResults(dpeResults) {
  if (!dpeResults) return null;
  // Utiliser uniquement les champs clés qui influencent la RAG
  const keyFields = {
    classe_dpe_finale: dpeResults.classe_dpe_finale,
    etiquette_energie: dpeResults.etiquette_energie,
    etiquette_climat: dpeResults.etiquette_climat
  };
  const dataString = JSON.stringify(keyFields, Object.keys(keyFields).sort());
  return crypto.createHash('md5').update(dataString).digest('hex');
}

/**
 * Génère une réponse RAG automatique basée sur les résultats du DPE
 */
async function generateRAGResponse(form, userId) {
  if (!form.dpeResults || !form.dpeCalculated) {
    throw new Error("Le DPE doit être calculé avant de générer la RAG");
  }

  // Générer le hash des résultats DPE pour le cache
  const dpeResultsHash = hashDPEResults(form.dpeResults);
  
  // Vérifier si une RAG existe déjà pour ce userId avec les mêmes résultats DPE
  const cachedForm = await Form.findOne({
    userId: userId,
    dpeResultsHash: dpeResultsHash,
    ragGenerated: true,
    ragResponse: { $exists: true, $ne: null, $ne: '' }
  }).sort({ ragGeneratedAt: -1 }); // Prendre le plus récent

  if (cachedForm && cachedForm.ragResponse) {
    console.log("✅ RAG trouvée en cache pour userId:", userId);
    // Copier la réponse RAG du cache
    form.ragResponse = cachedForm.ragResponse;
    form.ragSources = cachedForm.ragSources || [];
    form.ragGenerated = true;
    form.ragGeneratedAt = cachedForm.ragGeneratedAt || new Date();
    form.dpeResultsHash = dpeResultsHash;
    await form.save();
    return true;
  }

  // Pas de cache, générer la RAG
  console.log("🔄 Génération RAG nécessaire pour userId:", userId);
  const ragApiUrl = process.env.RAG_API_URL || "http://localhost:8002";
  
  // Construire une question personnalisée basée sur le DPE
  const classeDpe = form.dpeResults.classe_dpe_finale || "inconnue";
  const etiquetteEnergie = form.dpeResults.etiquette_energie || "inconnue";
  
  const question = `Mon logement a un DPE ${classeDpe} (étiquette énergétique ${etiquetteEnergie}). 
Quels sont les travaux de rénovation énergétique les plus prioritaires et efficaces pour améliorer mon DPE ? 
Donne-moi des conseils concrets et personnalisés.`;

  try {
    const response = await fetch(`${ragApiUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: question,
        dpe_results: form.dpeResults
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erreur API RAG (HTTP):", response.status, errorText);
      throw new Error(`Erreur API RAG: ${response.status} - ${errorText}`);
    }

    const ragResult = await response.json();
    console.log("Réponse API RAG:", JSON.stringify(ragResult, null, 2));
    
    if (ragResult.ok && ragResult.data && ragResult.data.response) {
      form.ragResponse = ragResult.data.response;
      // Sauvegarder les sources si disponibles
      if (ragResult.data.sources && Array.isArray(ragResult.data.sources)) {
        form.ragSources = ragResult.data.sources;
      }
      form.ragGenerated = true;
      form.ragGeneratedAt = new Date();
      form.dpeResultsHash = dpeResultsHash;
      await form.save();
      console.log("✅ Réponse RAG générée avec succès");
      return true;
    } else {
      console.error("Réponse RAG invalide:", ragResult);
      throw new Error(`Réponse RAG invalide: ${JSON.stringify(ragResult)}`);
    }
  } catch (error) {
    console.error("Erreur lors de l'appel RAG:", error);
    // Sauvegarder l'erreur pour debug
    form.ragResponse = `Erreur lors de la génération: ${error.message}`;
    form.ragGenerated = false;
    await form.save();
    throw error;
  }
}

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
  try {
    // Extraire les données DPE des réponses
    const dpeData = parseFormToDPEData(req.body);
    const dpeDataHash = hashDPEData(dpeData);
    
    const form = await Form.create({
      userId: req.user.id,
      userLogin: req.user.login,
      userPseudo: req.user.pseudo,
      ...req.body,
      dpeData,
      dpeDataHash
    });
    res.json({ ok:true, data:{ id: form._id } });
  } catch (error) {
    console.error("Erreur création formulaire:", error);
    res.status(500).json({ ok:false, error:"Erreur lors de la création du formulaire" });
  }
});

// Lister ceux du user connecté
router.get("/", async (req, res) => {
  const forms = await Form.find({ userId: req.user.id }).sort({ createdAt:-1 });
  res.json({ ok:true, data:forms });
});

// Obtenir un formulaire spécifique
router.get("/:id", async (req, res) => {
  const form = await Form.findOne({ _id: req.params.id, userId: req.user.id });
  if (!form) return res.status(404).json({ ok:false, error:"Formulaire non trouvé" });
  res.json({ ok:true, data:form });
});

// Calculer le DPE pour un formulaire
router.post("/:id/calculate-dpe", async (req, res) => {
  try {
    const form = await Form.findOne({ _id: req.params.id, userId: req.user.id });
    if (!form) return res.status(404).json({ ok:false, error:"Formulaire non trouvé" });

    // Vérifier que dpeData est présent
    if (!form.dpeData || !form.dpeData.code_departement_ban) {
      return res.status(400).json({ ok:false, error:"Données DPE incomplètes. Veuillez remplir tous les champs du formulaire." });
    }

    // Générer le hash des données DPE
    const dpeDataHash = hashDPEData(form.dpeData);
    
    // Vérifier si un résultat DPE existe déjà pour ce userId avec les mêmes données
    const cachedForm = await Form.findOne({
      userId: req.user.id,
      dpeDataHash: dpeDataHash,
      dpeCalculated: true,
      dpeResults: { $exists: true, $ne: null }
    }).sort({ dpeCalculatedAt: -1 }); // Prendre le plus récent

    if (cachedForm && cachedForm.dpeResults) {
      console.log("✅ DPE trouvé en cache pour userId:", req.user.id);
      // Copier les résultats du cache
      form.dpeResults = cachedForm.dpeResults;
      form.dpeCalculated = true;
      form.dpeCalculatedAt = cachedForm.dpeCalculatedAt || new Date();
      form.dpeDataHash = dpeDataHash;
      await form.save();
      
      // Retourner les résultats du cache
      return res.json({ ok:true, data:cachedForm.dpeResults, cached: true });
    }

    // Pas de cache, calculer le DPE
    console.log("🔄 Calcul DPE nécessaire pour userId:", req.user.id);
    console.log("📊 Données DPE envoyées (JSON complet):", JSON.stringify(form.dpeData, null, 2));
    console.log("🔍 Vérification ISOLATION:", {
      qualite_isolation_murs: form.dpeData.qualite_isolation_murs,
      qualite_isolation_plancher_bas: form.dpeData.qualite_isolation_plancher_bas,
      qualite_isolation_menuiseries: form.dpeData.qualite_isolation_menuiseries,
      qualite_isolation_plancher_haut_comble_perdu: form.dpeData.qualite_isolation_plancher_haut_comble_perdu,
      isolation_toiture: form.dpeData.isolation_toiture,
      rep10_qualite_murs: form.rep10_qualite_murs,
      rep12_qualite_plancher: form.rep12_qualite_plancher,
      rep13_type_vitrage: form.rep13_type_vitrage
    });
    console.log("🔍 Vérification ECS:", {
      type_energie_principale_ecs: form.dpeData.type_energie_principale_ecs,
      rep17_energie_ecs: form.rep17_energie_ecs
    });
    const pythonApiUrl = process.env.PYTHON_API_URL || "http://localhost:8001";
    const response = await fetch(`${pythonApiUrl}/calculate-dpe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form.dpeData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erreur API Python:", errorText);
      return res.status(500).json({ ok:false, error:"Erreur lors du calcul DPE" });
    }

    const result = await response.json();
    
    if (!result.ok) {
      return res.status(500).json({ ok:false, error:result.error || "Erreur lors du calcul DPE" });
    }

    // Mettre à jour le formulaire avec les résultats et le hash
    form.dpeResults = result.data;
    form.dpeCalculated = true;
    form.dpeCalculatedAt = new Date();
    form.dpeDataHash = dpeDataHash;
    await form.save();

    // Retourner immédiatement les résultats DPE (sans attendre la RAG)
    res.json({ ok:true, data:result.data, cached: false });
  } catch (error) {
    console.error("Erreur calculate-dpe:", error);
    res.status(500).json({ ok:false, error:"Erreur serveur lors du calcul DPE" });
  }
});

// Générer la réponse RAG séparément (appelé après l'affichage du DPE)
router.post("/:id/generate-rag", async (req, res) => {
  try {
    const form = await Form.findOne({ _id: req.params.id, userId: req.user.id });
    if (!form) return res.status(404).json({ ok:false, error:"Formulaire non trouvé" });

    if (!form.dpeCalculated || !form.dpeResults) {
      return res.status(400).json({ ok:false, error:"Le DPE doit être calculé avant de générer les conseils RAG" });
    }

    // Générer la réponse RAG
    let ragSuccess = false;
    try {
      ragSuccess = await generateRAGResponse(form, req.user.id);
      console.log("generateRAGResponse retourné:", ragSuccess);
    } catch (ragError) {
      console.error("Erreur dans generateRAGResponse:", ragError);
      console.error("Stack:", ragError.stack);
    }
    
    // Recharger le formulaire depuis la base de données
    const updatedForm = await Form.findById(req.params.id);
    console.log("Formulaire après RAG:", {
      ragGenerated: updatedForm.ragGenerated,
      hasRagResponse: !!updatedForm.ragResponse,
      ragResponseLength: updatedForm.ragResponse?.length,
      dpeResultsHash: updatedForm.dpeResultsHash
    });
    
    if (!updatedForm.ragGenerated || !updatedForm.ragResponse) {
      const errorMsg = updatedForm.ragResponse || "La génération RAG a échoué. Veuillez réessayer.";
      return res.status(500).json({ 
        ok:false, 
        error: errorMsg
      });
    }
    
    // Vérifier si c'était du cache (si un autre formulaire avec le même hash existe)
    const wasCached = updatedForm.dpeResultsHash && 
                      await Form.exists({
                        userId: req.user.id,
                        dpeResultsHash: updatedForm.dpeResultsHash,
                        _id: { $ne: updatedForm._id },
                        ragGenerated: true,
                        ragResponse: { $exists: true, $ne: null, $ne: '' }
                      });
    
    res.json({ 
      ok:true, 
      data:{
        ragResponse: updatedForm.ragResponse,
        ragSources: updatedForm.ragSources || [],
        ragGenerated: updatedForm.ragGenerated,
        ragGeneratedAt: updatedForm.ragGeneratedAt
      },
      cached: !!wasCached
    });
  } catch (error) {
    console.error("Erreur generate-rag:", error);
    res.status(500).json({ ok:false, error:"Erreur serveur lors de la génération RAG" });
  }
});

export default router;
