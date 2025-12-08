/**
 * Parse les réponses du formulaire pour extraire les données DPE structurées
 * Version avec mappings simplifiés pour l'utilisateur
 */

// Mapping des qualités d'isolation simplifiées vers les valeurs du modèle
const QUALITE_MAP = {
  // Isolation murs/plancher
  'pas_isole': 'insuffisante',
  'isole_partiel': 'moyenne',
  'isole_complet': 'bonne',
  'isole_renforce': 'très bonne',
  
  // Vitrage
  'simple': 'insuffisante',
  'double': 'bonne',
  'double_vir': 'bonne',
  'triple': 'très bonne',
  
  // Valeurs directes (compatibilité)
  'insuffisante': 'insuffisante',
  'moyenne': 'moyenne',
  'bonne': 'bonne',
  'très bonne': 'très bonne',
  'excellente': 'très bonne',
};

// Mapping des types d'énergie
const ENERGIE_MAP = {
  'électricité': 'Électricité',
  'electricite': 'Électricité',
  'elec': 'Électricité',
  'gaz': 'Gaz naturel',
  'gaz naturel': 'Gaz naturel',
  'fioul': 'Fioul domestique',
  'fioul domestique': 'Fioul domestique',
  'mazout': 'Fioul domestique',
  'bois': 'Bois – Bûches',
  'bois bûches': 'Bois – Bûches',
  'bois buches': 'Bois – Bûches',
  'pellets': 'Bois – Granulés (pellets) ou briquettes',
  'granulés': 'Bois – Granulés (pellets) ou briquettes',
  'charbon': 'Charbon',
};

/**
 * Extrait un nombre d'une chaîne de caractères
 */
function extractNumber(str, defaultValue = null) {
  if (!str) return defaultValue;
  if (typeof str === 'number') return str;
  const match = str.toString().match(/\d+(?:[.,]\d+)?/);
  return match ? parseFloat(match[0].replace(',', '.')) : defaultValue;
}

/**
 * Extrait le code département d'une adresse
 */
function extractDepartement(adresse) {
  if (!adresse) return null;
  // Cherche un code postal (5 chiffres)
  const match = adresse.toString().match(/\b(\d{5})\b/);
  if (match) {
    const cp = match[1];
    // Les départements 2A et 2B sont spéciaux
    if (cp.startsWith('20')) {
      if (parseInt(cp) >= 20000 && parseInt(cp) < 20100) return 2; // Corse-du-Sud
      if (parseInt(cp) >= 20100 && parseInt(cp) < 20200) return 2; // Haute-Corse
    }
    // Extraire les 2 premiers chiffres du code postal
    const dept = parseInt(cp.substring(0, 2));
    if (dept >= 1 && dept <= 95) return dept;
    // DOM-TOM
    if (cp.startsWith('97')) return parseInt(cp.substring(0, 3));
  }
  return null;
}

/**
 * Extrait l'année de construction
 */
function extractAnneeConstruction(str) {
  if (!str) return null;
  if (typeof str === 'number') return str;
  // Cherche une année entre 1000 et 2100
  const match = str.toString().match(/\b(1[0-9]{3}|20[0-2]\d)\b/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Normalise la qualité d'isolation (utilise les mappings simplifiés)
 */
function normalizeQualite(str) {
  if (!str) return 'insuffisante';
  const lower = str.toString().toLowerCase().trim();
  
  // Vérifier d'abord dans le mapping
  if (QUALITE_MAP[lower]) {
    return QUALITE_MAP[lower];
  }
  
  // Sinon, chercher dans les clés du mapping
  for (const [key, value] of Object.entries(QUALITE_MAP)) {
    if (lower.includes(key)) return value;
  }
  
  return 'insuffisante';
}

/**
 * Normalise le type d'énergie
 */
function normalizeEnergie(str) {
  if (!str) return 'Inconnu';
  const lower = str.toString().toLowerCase();
  
  // Vérifier d'abord dans le mapping
  if (ENERGIE_MAP[lower]) {
    return ENERGIE_MAP[lower];
  }
  
  // Chercher dans les clés du mapping
  for (const [key, value] of Object.entries(ENERGIE_MAP)) {
    if (lower.includes(key)) return value;
  }
  
  // Si c'est déjà une valeur valide, la retourner
  const validEnergies = ['Électricité', 'Gaz naturel', 'Fioul domestique', 'Bois – Bûches', 
                         'Bois – Granulés (pellets) ou briquettes', 'Charbon', 'Inconnu'];
  if (validEnergies.includes(str)) return str;
  
  return 'Inconnu';
}

/**
 * Parse les réponses du formulaire et retourne les données DPE structurées
 */
export function parseFormToDPEData(reps) {
  const data = {};

  // ===== ÉTAPE 2 : Localisation et caractéristiques =====
  // rep4: Adresse (pour code département)
  data.code_departement_ban = extractDepartement(reps.rep4) || 75; // Défaut Paris

  // rep5: Année de construction (déjà un nombre ou texte)
  data.annee_construction = extractAnneeConstruction(reps.rep5) || 
                            extractNumber(reps.rep5) || 1980;

  // rep6_surface: Surface habitable (nouvelle clé structurée ou ancienne rep6)
  let surface = 70;
  if (reps.rep6_surface) {
    surface = extractNumber(reps.rep6_surface) || 70;
  } else if (reps.rep6) {
    // Compatibilité avec l'ancien format
    const surfaceHauteur = reps.rep6 || '';
    surface = extractNumber(surfaceHauteur) || 70;
  }
  
  // Validation : surface minimale de 20 m² (pour éviter les calculs aberrants)
  if (surface < 20) {
    console.warn(`⚠️ Surface très petite détectée: ${surface} m². Utilisation de 20 m² minimum.`);
    surface = 20;
  }
  data.surface_habitable_logement = surface;
  console.log(`📐 Surface habitable: ${surface} m²`);

  // rep6_hauteur: Hauteur sous plafond (nouvelle clé structurée ou ancienne rep6)
  if (reps.rep6_hauteur) {
    data.hauteur_sous_plafond = extractNumber(reps.rep6_hauteur) || 2.5;
  } else if (reps.rep6) {
    // Compatibilité avec l'ancien format
    const surfaceHauteur = reps.rep6 || '';
    data.hauteur_sous_plafond = extractNumber(surfaceHauteur.split(/[,\s]+/)[1] || '') || 2.5;
  } else {
    data.hauteur_sous_plafond = 2.5;
  }

  // ===== ÉTAPE 3 : Structure =====
  // rep7_niveaux: Nombre de niveaux (nouvelle clé structurée ou ancienne rep7)
  if (reps.rep7_niveaux) {
    data.nombre_niveau_logement = extractNumber(reps.rep7_niveaux) || 1;
  } else if (reps.rep7) {
    // Compatibilité avec l'ancien format
    const typeLogement = reps.rep7 || '';
    const match = typeLogement.toLowerCase().match(/(\d+)\s*(?:étage|niveau|rdc)/i);
    data.nombre_niveau_logement = match ? parseInt(match[1]) + 1 : 1;
  } else {
    data.nombre_niveau_logement = 1;
  }

  // rep9_type_toiture: Type de toiture
  const typeToiture = reps.rep9_type_toiture || '';
  data.qualite_isolation_plancher_haut_comble_amenage = null;
  data.qualite_isolation_plancher_haut_comble_perdu = null;
  data.qualite_isolation_plancher_haut_toit_terrasse = null;

  // Qualité de la toiture : déduite de l'isolation
  // Si rep9_qualite_toiture existe (ancien format), on l'utilise, sinon on déduit de rep9_isolation_toiture
  let qualiteToiture = 'moyenne';
  if (reps.rep9_qualite_toiture) {
    qualiteToiture = normalizeQualite(reps.rep9_qualite_toiture);
    console.log(`🔍 Qualité toiture (rep9_qualite_toiture): "${reps.rep9_qualite_toiture}" → "${qualiteToiture}"`);
  } else if (reps.rep9_isolation_toiture !== undefined && reps.rep9_isolation_toiture !== null) {
    // Si la toiture est isolée, on considère que c'est "bonne", sinon "moyenne"
    const isole = (reps.rep9_isolation_toiture === '1' || reps.rep9_isolation_toiture === 1);
    qualiteToiture = isole ? 'bonne' : 'moyenne';
    console.log(`🔍 Qualité toiture (déduite de isolation_toiture=${reps.rep9_isolation_toiture}): "${qualiteToiture}"`);
  } else {
    console.warn(`⚠️ Isolation toiture non spécifiée, utilisation de "moyenne" par défaut`);
  }

  if (typeToiture === 'comble_amenage') {
    data.qualite_isolation_plancher_haut_comble_amenage = qualiteToiture;
    console.log(`🔍 Type toiture: combles aménagés → qualité "${qualiteToiture}"`);
  } else if (typeToiture === 'comble_perdu') {
    data.qualite_isolation_plancher_haut_comble_perdu = qualiteToiture;
    console.log(`🔍 Type toiture: combles perdus → qualité "${qualiteToiture}"`);
  } else if (typeToiture === 'toit_terrasse') {
    data.qualite_isolation_plancher_haut_toit_terrasse = qualiteToiture;
    console.log(`🔍 Type toiture: toit terrasse → qualité "${qualiteToiture}"`);
  } else if (reps.rep9) {
    // Compatibilité avec l'ancien format
    const toiture = reps.rep9 || '';
    const lower = toiture.toLowerCase();
    if (lower.includes('aménagé') || lower.includes('amenage')) {
      data.qualite_isolation_plancher_haut_comble_amenage = normalizeQualite(toiture);
    } else if (lower.includes('perdu') || lower.includes('comble perdu')) {
      data.qualite_isolation_plancher_haut_comble_perdu = normalizeQualite(toiture);
    } else if (lower.includes('terrasse') || lower.includes('toit terrasse')) {
      data.qualite_isolation_plancher_haut_toit_terrasse = normalizeQualite(toiture);
    } else {
      data.qualite_isolation_plancher_haut_comble_perdu = 'moyenne';
    }
  } else {
    // Par défaut, combles perdus
    data.qualite_isolation_plancher_haut_comble_perdu = 'moyenne';
  }

  // rep9_isolation_toiture: Isolation toiture (0 ou 1)
  if (reps.rep9_isolation_toiture !== undefined) {
    data.isolation_toiture = (reps.rep9_isolation_toiture === '1' || reps.rep9_isolation_toiture === 1) ? 1 : 0;
  } else if (reps.rep9) {
    // Compatibilité avec l'ancien format
    const toiture = reps.rep9 || '';
    data.isolation_toiture = (toiture.toLowerCase().includes('isol') || toiture.toLowerCase().includes('isolation')) ? 1 : 0;
  } else {
    data.isolation_toiture = 0;
  }

  // ===== ÉTAPE 4 : Isolation =====
  // rep10_qualite_murs: Qualité isolation murs (mapping simplifié)
  if (reps.rep10_qualite_murs) {
    data.qualite_isolation_murs = normalizeQualite(reps.rep10_qualite_murs);
    console.log(`🔍 Isolation murs: "${reps.rep10_qualite_murs}" → "${data.qualite_isolation_murs}"`);
  } else {
    data.qualite_isolation_murs = normalizeQualite(reps.rep10 || 'insuffisante');
    console.log(`🔍 Isolation murs (ancien format): "${reps.rep10}" → "${data.qualite_isolation_murs}"`);
  }

  // rep12_qualite_plancher: Qualité isolation plancher bas (mapping simplifié)
  if (reps.rep12_qualite_plancher) {
    data.qualite_isolation_plancher_bas = normalizeQualite(reps.rep12_qualite_plancher);
    console.log(`🔍 Isolation plancher: "${reps.rep12_qualite_plancher}" → "${data.qualite_isolation_plancher_bas}"`);
  } else {
    data.qualite_isolation_plancher_bas = normalizeQualite(reps.rep12 || 'insuffisante');
    console.log(`🔍 Isolation plancher (ancien format): "${reps.rep12}" → "${data.qualite_isolation_plancher_bas}"`);
  }

  // rep13_type_vitrage: Type de vitrage → qualité isolation menuiseries (mapping simplifié)
  if (reps.rep13_type_vitrage && reps.rep13_type_vitrage !== 'undefined' && reps.rep13_type_vitrage !== '') {
    data.qualite_isolation_menuiseries = normalizeQualite(reps.rep13_type_vitrage);
    console.log(`🔍 Isolation menuiseries: "${reps.rep13_type_vitrage}" → "${data.qualite_isolation_menuiseries}"`);
  } else if (reps.rep13_qualite_menuiseries && reps.rep13_qualite_menuiseries !== 'undefined' && reps.rep13_qualite_menuiseries !== '') {
    data.qualite_isolation_menuiseries = normalizeQualite(reps.rep13_qualite_menuiseries);
    console.log(`🔍 Isolation menuiseries (qualite): "${reps.rep13_qualite_menuiseries}" → "${data.qualite_isolation_menuiseries}"`);
  } else if (reps.rep13 && reps.rep13 !== 'undefined' && reps.rep13 !== '') {
    data.qualite_isolation_menuiseries = normalizeQualite(reps.rep13);
    console.log(`🔍 Isolation menuiseries (ancien format): "${reps.rep13}" → "${data.qualite_isolation_menuiseries}"`);
  } else {
    // Si aucune valeur n'est fournie, utiliser "bonne" par défaut (double vitrage standard)
    // plutôt que "insuffisante" qui pénalise trop
    data.qualite_isolation_menuiseries = 'bonne';
    console.log(`⚠️ Isolation menuiseries: AUCUNE VALEUR FOURNIE, utilisation de "bonne" par défaut`);
  }

  // ===== ÉTAPE 5 : Énergies =====
  // rep15_energie_chauffage: Énergie principale chauffage
  if (reps.rep15_energie_chauffage) {
    data.type_energie_principale_chauffage = normalizeEnergie(reps.rep15_energie_chauffage);
  } else {
    data.type_energie_principale_chauffage = normalizeEnergie(reps.rep15 || 'Inconnu');
  }

  // rep17_energie_ecs: Énergie ECS
  if (reps.rep17_energie_ecs) {
    data.type_energie_principale_ecs = normalizeEnergie(reps.rep17_energie_ecs);
  } else if (reps.rep17) {
    // Compatibilité avec l'ancien format
    data.type_energie_principale_ecs = normalizeEnergie(reps.rep17);
  } else {
    // Par défaut, utiliser la même énergie que le chauffage si ECS non spécifiée
    // Mais seulement si le chauffage est déjà défini
    if (data.type_energie_principale_chauffage && data.type_energie_principale_chauffage !== 'Inconnu') {
      data.type_energie_principale_ecs = data.type_energie_principale_chauffage;
    } else {
      data.type_energie_principale_ecs = 'Inconnu';
    }
  }
  
  // Log pour debug
  console.log("🔍 Parser ECS:", {
    rep17_energie_ecs: reps.rep17_energie_ecs,
    rep17: reps.rep17,
    type_energie_principale_ecs: data.type_energie_principale_ecs,
    type_energie_principale_chauffage: data.type_energie_principale_chauffage
  });

  // rep16_type_chauffage: Peut contenir type_energie_n1
  const typeChauffage = reps.rep16_type_chauffage || reps.rep16 || '';
  data.type_energie_n1 = normalizeEnergie(typeChauffage) || data.type_energie_principale_chauffage;

  // ===== Champs optionnels =====
  data.type_energie_n2 = 'Inconnu';
  data.type_energie_n3 = 'Inconnu';
  
  // rep19_climatisation: Climatisation (optionnel)
  if (reps.rep19_climatisation) {
    if (reps.rep19_climatisation === 'Aucune' || reps.rep19_climatisation === 'Non') {
      data.type_energie_climatisation = 'Inconnu';
    } else {
      data.type_energie_climatisation = normalizeEnergie(reps.rep19_climatisation);
    }
  } else {
    data.type_energie_climatisation = 'Inconnu';
  }

  // Si aucune qualité de toiture n'est définie, utiliser une valeur par défaut
  if (!data.qualite_isolation_plancher_haut_comble_amenage && 
      !data.qualite_isolation_plancher_haut_comble_perdu && 
      !data.qualite_isolation_plancher_haut_toit_terrasse) {
    data.qualite_isolation_plancher_haut_comble_perdu = 'moyenne';
  }

  // Log complet des données d'isolation pour debug
  console.log("📊 RÉSUMÉ DES DONNÉES D'ISOLATION PARSÉES:", {
    qualite_isolation_murs: data.qualite_isolation_murs,
    qualite_isolation_plancher_bas: data.qualite_isolation_plancher_bas,
    qualite_isolation_menuiseries: data.qualite_isolation_menuiseries,
    qualite_isolation_plancher_haut_comble_amenage: data.qualite_isolation_plancher_haut_comble_amenage,
    qualite_isolation_plancher_haut_comble_perdu: data.qualite_isolation_plancher_haut_comble_perdu,
    qualite_isolation_plancher_haut_toit_terrasse: data.qualite_isolation_plancher_haut_toit_terrasse,
    isolation_toiture: data.isolation_toiture
  });

  return data;
}
