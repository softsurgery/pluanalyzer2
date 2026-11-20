import type { TopicDefinition } from "@/types/pdf";

// ============================================================================
// PDF Cleaning & Extraction Constants
// ============================================================================

/**
 * Matches the start of a structural French PLU regulatory line (heading, article, zone, list item).
 * Used when condensing wrapped PDF lines so structural boundaries are never merged into prose.
 */
export const STRUCTURAL_LINE_START =
  /^(?:ARTICLE\b|CHAPITRE\b|TITRE\b|SECTION\b|SOUS-?SECTION\b|DISPOSITIONS\b|ZONE\s+[A-Z0-9]|ANNEXES?\b|OAP\b|SOMMAIRE\b|TABLE\s+DES\s+MATI[ÈE]RES\b|[A-Z]{1,3}\s*\d{1,2}\s*[:\-–]|\d+(?:\.\d+)*[.)]\s|[-•*▪]\s)/i;

/**
 * Minimum character count required across a parsed PDF before considering it digital text.
 * Documents below this threshold are flagged as `ocr_required` (or routed to OCR fallback).
 */
export const MIN_DIGITAL_TEXT_CHARS = 80;

/**
 * Default CLI command, language, and timeout for Tesseract OCR fallback on scanned PDFs.
 */
export const DEFAULT_OCR_COMMAND = "tesseract";
export const DEFAULT_OCR_LANGUAGE = "fra";
export const DEFAULT_OCR_TIMEOUT_MS = 30000;

// ============================================================================
// Logical Content Mapping Dictionaries & Patterns
// ============================================================================

/**
 * French urban-planning regulatory topic dictionary mapping canonical `PluTopicId`s
 * to normalized (accent-free, lowercase) domain terms.
 */
export const PLU_TOPIC_DICTIONARY: TopicDefinition[] = [
  {
    id: "setbacks",
    label: "Reculs et implantation",
    terms: [
      "recul",
      "retrait",
      "implantation",
      "limite separative",
      "limites separatives",
      "alignement",
      "marge de recul",
      "marge d'isolement",
      "prospect",
      "emprise publique",
      "bande constructible",
      "voie publique",
    ],
  },
  {
    id: "height",
    label: "Hauteur des constructions",
    terms: [
      "hauteur",
      "faitage",
      "egout du toit",
      "egout",
      "acrotere",
      "gabarit",
      "niveaux",
      "etage",
      "combles",
      "surelevation",
    ],
  },
  {
    id: "footprint",
    label: "Emprise au sol et densité",
    terms: [
      "emprise au sol",
      "coefficient d'emprise",
      "ces",
      "taux d'emprise",
      "surface de plancher",
      "sdp",
      "cos",
      "densite",
    ],
  },
  {
    id: "parking",
    label: "Stationnement",
    terms: [
      "stationnement",
      "place de stationnement",
      "places de stationnement",
      "parking",
      "garage",
      "aire de stationnement",
      "velo",
      "deux-roues",
      "borne de recharge",
    ],
  },
  {
    id: "access",
    label: "Accès et voirie",
    terms: [
      "acces",
      "voirie",
      "desserte",
      "circulation",
      "impasse",
      "rayon de braquage",
      "securite incendie",
      "voie privee",
    ],
  },
  {
    id: "green_spaces",
    label: "Espaces verts et pleine terre",
    terms: [
      "espaces verts",
      "espace vert",
      "espaces libres",
      "pleine terre",
      "vegetalise",
      "vegetalisation",
      "plantation",
      "arbres",
      "coefficient de biotope",
      "cbs",
      "espace boise",
      "ebc",
    ],
  },
  {
    id: "land_use",
    label: "Destinations et usage des sols",
    terms: [
      "destination",
      "destinations",
      "usage des sols",
      "occupations",
      "utilisation du sol",
      "interdit",
      "interdictions",
      "admis sous conditions",
      "mixite",
      "logement social",
      "commerce",
      "artisanat",
      "industrie",
      "agricole",
    ],
  },
  {
    id: "exterior_appearance",
    label: "Aspect extérieur et clôtures",
    terms: [
      "aspect exterieur",
      "facade",
      "toiture",
      "cloture",
      "materiaux",
      "pente de toit",
      "tuile",
      "enduit",
      "insertion paysagere",
      "integration paysagere",
    ],
  },
  {
    id: "utilities",
    label: "Réseaux et eaux pluviales",
    terms: [
      "reseaux",
      "eaux pluviales",
      "eaux usees",
      "assainissement",
      "eau potable",
      "electricite",
      "telecom",
      "dechets",
      "retention",
      "infiltration",
    ],
  },
  {
    id: "lot_characteristics",
    label: "Caractéristiques des terrains",
    terms: [
      "superficie minimale",
      "caracteristiques des terrains",
      "largeur de facade",
      "division parcellaire",
      "lotissement",
    ],
  },
  {
    id: "servitudes_risks",
    label: "Servitudes, risques et OAP",
    terms: [
      "servitude",
      "servitudes",
      "risque",
      "inondation",
      "ppri",
      "emplacement reserve",
      "monument historique",
      "abf",
      "patrimoine",
      "nuisance",
      "oap",
    ],
  },
];

/**
 * Common French stop-words and generic regulatory filler words excluded from keyword indexing
 * and TF cosine-similarity calculations.
 */
export const FRENCH_STOP_WORDS = new Set([
  "afin",
  "ainsi",
  "alors",
  "apres",
  "article",
  "articles",
  "aucun",
  "aucune",
  "aussi",
  "autre",
  "autres",
  "aux",
  "avant",
  "avec",
  "avoir",
  "bien",
  "car",
  "cas",
  "celle",
  "celles",
  "celui",
  "cependant",
  "cette",
  "ceux",
  "chez",
  "comme",
  "dans",
  "depuis",
  "des",
  "disposition",
  "dispositions",
  "doit",
  "doivent",
  "donc",
  "dont",
  "elle",
  "elles",
  "encore",
  "entre",
  "est",
  "etre",
  "hors",
  "ils",
  "les",
  "leur",
  "leurs",
  "lors",
  "mais",
  "meme",
  "moins",
  "non",
  "nos",
  "notamment",
  "nous",
  "ont",
  "oui",
  "par",
  "pas",
  "pendant",
  "peut",
  "peuvent",
  "plus",
  "pour",
  "present",
  "presente",
  "quels",
  "quelle",
  "quelles",
  "quel",
  "que",
  "qui",
  "quoi",
  "reglement",
  "sans",
  "selon",
  "sera",
  "seront",
  "ses",
  "soit",
  "son",
  "sont",
  "sous",
  "sur",
  "tout",
  "tous",
  "toute",
  "toutes",
  "tres",
  "une",
  "vers",
  "vos",
  "vous",
  "zone",
  "zones",
]);

/**
 * Pattern matching candidate French PLU/PLUi zone codes (e.g. `UA`, `UB1`, `1AU`, `2AU`, `N`, `A`).
 */
export const ZONE_CODE_REGEX =
  /\b(U[A-Z0-9]{0,4}|AU[A-Z0-9]{0,4}|1AU[A-Z0-9]{0,3}|2AU[A-Z0-9]{0,3}|N[A-Z0-9]{0,3}|A[A-Z0-9]{0,3})\b/g;

/**
 * Uppercase French words that match `ZONE_CODE_REGEX` syntax but are not urban zone codes.
 */
export const KNOWN_NON_ZONE_TOKENS = new Set([
  "AU",
  "AUX",
  "ART",
  "ANNEXE",
  "ALINEA",
  "AVEC",
  "APRES",
  "AVANT",
  "ACCES",
  "AIR",
  "ANS",
  "NO",
  "NON",
]);
