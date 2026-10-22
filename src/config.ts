// Configuration de l'application : sources de données, lieux, couleurs.

/** Bâtiments 3D de Paris (couche de scène publique publiée par Esri France sur ArcGIS Online). */
export const BATIMENTS_URL =
  "https://services.arcgis.com/d3voDfTFbHOCRwVR/arcgis/rest/services/Batiments_3D_Paris/SceneServer/layers/0";

/** Même jeu de bâtiments, en couche d'entités multipatch : c'est elle qui fournit les maillages 3D à l'export. */
export const BATIMENTS_ENTITES_URL =
  "https://services.arcgis.com/d3voDfTFbHOCRwVR/arcgis/rest/services/Batiments_3D_Paris/FeatureServer/0";

/** Imagerie mondiale Esri (fond de carte public, sans clé d'API). */
export const IMAGERIE_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";

/** Fond de carte gris clair Esri (public). */
export const GRIS_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer";

/** Modèle numérique de terrain mondial Esri (public). */
export const TERRAIN_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

/** Nombre maximal de bâtiments exportables en une fois (au-delà, le navigateur peine). */
export const MAX_BATIMENTS = 300;

/** Lieux de départ proposés. */
export const LIEUX: { nom: string; lon: number; lat: number; cap?: number }[] = [
  { nom: "Tour Eiffel", lon: 2.2945, lat: 48.8584, cap: 300 },
  { nom: "Île de la Cité", lon: 2.3499, lat: 48.853, cap: 20 },
  { nom: "Opéra Garnier", lon: 2.3317, lat: 48.872 },
  { nom: "Montmartre", lon: 2.3431, lat: 48.8867, cap: 340 },
  { nom: "Front de Seine", lon: 2.284, lat: 48.849, cap: 60 },
  { nom: "Bibliothèque F. Mitterrand", lon: 2.376, lat: 48.8337, cap: 330 },
];

export type ModeRendu = "hauteur" | "toit" | "blanc";

/** Classes de hauteur (champ H_MAX, en mètres). */
export const CLASSES_HAUTEUR: { min: number; max: number; label: string; couleur: string }[] = [
  { min: 0, max: 10, label: "moins de 10 m", couleur: "#f3e9d2" },
  { min: 10, max: 20, label: "10 à 20 m", couleur: "#f6c46a" },
  { min: 20, max: 30, label: "20 à 30 m", couleur: "#ee8a48" },
  { min: 30, max: 50, label: "30 à 50 m", couleur: "#d4504c" },
  { min: 50, max: 1000, label: "plus de 50 m", couleur: "#8f2a5d" },
];

/** Types de toit (champ Type_Toit). */
export const TYPES_TOIT: { valeur: string; label: string; couleur: string }[] = [
  { valeur: "haussmannien", label: "Haussmannien", couleur: "#d1a866" },
  { valeur: "2pentes", label: "Deux pentes", couleur: "#6fa8dc" },
  { valeur: "4pentes", label: "Quatre pentes", couleur: "#9c8ad0" },
  { valeur: "plat", label: "Plat", couleur: "#a3adb8" },
  { valeur: "plat_parapet", label: "Plat avec parapet", couleur: "#74b49b" },
];

export const COULEUR_BLANC = "#f4f4f2";
export const COULEUR_TERRAIN = "#8c9a7a";
export const COULEUR_AUTRE = "#c8c8c8";

/** Couleur d'un bâtiment selon le mode de rendu choisi (sert aussi à colorer l'export). */
export function couleurBatiment(attributs: Record<string, unknown>, mode: ModeRendu): string {
  if (mode === "blanc") return COULEUR_BLANC;
  if (mode === "toit") {
    return TYPES_TOIT.find((t) => t.valeur === attributs.Type_Toit)?.couleur ?? COULEUR_AUTRE;
  }
  const h = Number(attributs.H_MAX);
  if (!Number.isFinite(h)) return COULEUR_AUTRE;
  return CLASSES_HAUTEUR.find((c) => h >= c.min && h < c.max)?.couleur ?? COULEUR_AUTRE;
}

/** N_SQ_AR vaut 7500000xx : on en tire le numéro d'arrondissement. */
export function arrondissement(code: unknown): number | null {
  const n = Number(code);
  if (!Number.isFinite(n)) return null;
  const arr = n % 100;
  return arr >= 1 && arr <= 20 ? arr : null;
}
