import "@arcgis/core/assets/esri/themes/dark/main.css";
import "@esri/calcite-components/main.css";
import "./style.css";

import "@esri/calcite-components/components/calcite-shell";
import "@esri/calcite-components/components/calcite-shell-panel";
import "@esri/calcite-components/components/calcite-panel";
import "@esri/calcite-components/components/calcite-block";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-chip";
import "@esri/calcite-components/components/calcite-segmented-control";
import "@esri/calcite-components/components/calcite-segmented-control-item";
import "@esri/calcite-components/components/calcite-switch";
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-notice";
import "@esri/calcite-components/components/calcite-progress";
import "@esri/calcite-components/components/calcite-dialog";
import "@esri/calcite-components/components/calcite-link";

import EsriMap from "@arcgis/core/Map";
import SceneView from "@arcgis/core/views/SceneView";
import Basemap from "@arcgis/core/Basemap";
import Ground from "@arcgis/core/Ground";
import TileLayer from "@arcgis/core/layers/TileLayer";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer";
import SceneLayer from "@arcgis/core/layers/SceneLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Multipoint from "@arcgis/core/geometry/Multipoint";
import type Polygon from "@arcgis/core/geometry/Polygon";
import ClassBreaksRenderer from "@arcgis/core/renderers/ClassBreaksRenderer";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer";
import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel";
import type SceneLayerView from "@arcgis/core/views/layers/SceneLayerView";
import * as geodeticAreaOperator from "@arcgis/core/geometry/operators/geodeticAreaOperator";

import {
  BATIMENTS_URL,
  CLASSES_HAUTEUR,
  COULEUR_BLANC,
  GRIS_URL,
  IMAGERIE_URL,
  LIEUX,
  MAX_BATIMENTS,
  TERRAIN_URL,
  TYPES_TOIT,
  arrondissement,
  type ModeRendu,
} from "./config";
import { ErreurExport, construireMaquette } from "./export";

// ---------------------------------------------------------------------------
// Raccourcis DOM
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

// ---------------------------------------------------------------------------
// Carte et vue 3D
// ---------------------------------------------------------------------------
function symboleMaillage(couleur: string) {
  return {
    type: "mesh-3d",
    symbolLayers: [
      {
        type: "fill",
        material: { color: couleur, colorMixMode: "replace" },
        edges: { type: "solid", color: [20, 22, 28, 0.35], size: 0.6 },
      },
    ],
  } as any;
}

const renderers: Record<ModeRendu, any> = {
  hauteur: new ClassBreaksRenderer({
    field: "H_MAX",
    defaultSymbol: symboleMaillage("#c8c8c8"),
    classBreakInfos: CLASSES_HAUTEUR.map((c) => ({
      minValue: c.min,
      maxValue: c.max,
      label: c.label,
      symbol: symboleMaillage(c.couleur),
    })),
  }),
  toit: new UniqueValueRenderer({
    field: "Type_Toit",
    defaultSymbol: symboleMaillage("#c8c8c8"),
    uniqueValueInfos: TYPES_TOIT.map((t) => ({
      value: t.valeur,
      label: t.label,
      symbol: symboleMaillage(t.couleur),
    })),
  }),
  blanc: new SimpleRenderer({ symbol: symboleMaillage(COULEUR_BLANC) }),
};

const batiments = new SceneLayer({
  url: BATIMENTS_URL,
  title: "Bâtiments 3D de Paris",
  outFields: ["OBJECTID", "H_MAX", "H_MOY", "Type_Toit", "N_SQ_AR"],
  renderer: renderers.hauteur,
  popupTemplate: {
    title: "Bâtiment",
    content: [
      {
        type: "fields",
        fieldInfos: [
          { fieldName: "H_MAX", label: "Hauteur maximale (m)", format: { places: 1 } },
          { fieldName: "H_MOY", label: "Hauteur moyenne (m)", format: { places: 1 } },
          { fieldName: "Type_Toit", label: "Type de toit" },
        ],
      },
    ],
  } as any,
});

const sol = new Ground({ layers: [new ElevationLayer({ url: TERRAIN_URL })] });
const zoneLayer = new GraphicsLayer({ title: "Zone", elevationInfo: { mode: "on-the-ground" } });

const carte = new EsriMap({
  basemap: new Basemap({
    baseLayers: [new TileLayer({ url: IMAGERIE_URL }), new TileLayer({ url: GRIS_URL, opacity: 0.45 })],
  }),
  ground: sol,
  layers: [batiments, zoneLayer],
});

const vue = new SceneView({
  container: "vue",
  map: carte,
  camera: { position: { longitude: 2.3, latitude: 48.81, z: 3200 }, heading: 20, tilt: 62 },
  qualityProfile: "high",
  environment: {
    lighting: { type: "sun", date: new Date("2026-06-21T15:00:00+02:00"), directShadowsEnabled: true },
    atmosphereEnabled: true,
  } as any,
  popup: { dockEnabled: false, defaultPopupTemplateEnabled: false } as any,
  ui: { components: ["zoom", "compass", "navigation-toggle"] } as any,
});

let vueBatiments: SceneLayerView | null = null;
vue.whenLayerView(batiments).then((lv) => (vueBatiments = lv as SceneLayerView));

// ---------------------------------------------------------------------------
// 1. Lieux
// ---------------------------------------------------------------------------
for (const lieu of LIEUX) {
  const chip = document.createElement("calcite-chip");
  chip.textContent = lieu.nom;
  chip.setAttribute("scale", "s");
  chip.setAttribute("interactive", "");
  chip.setAttribute("icon", "pin");
  chip.addEventListener("click", () => {
    vue.goTo(
      { center: [lieu.lon, lieu.lat], zoom: 17, tilt: 62, heading: lieu.cap ?? 0 },
      { duration: 1800 },
    );
  });
  $("lieux").append(chip);
}

// ---------------------------------------------------------------------------
// 2. Sélection de la zone
// ---------------------------------------------------------------------------
const sketch = new SketchViewModel({
  view: vue,
  layer: zoneLayer,
  polygonSymbol: {
    type: "polygon-3d",
    symbolLayers: [
      {
        type: "fill",
        material: { color: [246, 196, 106, 0.18] },
        outline: { color: [246, 196, 106, 1], size: 2.5 },
      },
    ],
  } as any,
  defaultUpdateOptions: { tool: "transform", enableRotation: false, enableZ: false },
});

let zone: Polygon | null = null;
let surbrillance: { remove(): void } | null = null;

$("btn-dessiner").addEventListener("click", () => {
  zoneLayer.removeAll();
  reinitialiserStats();
  vue.popupEnabled = false;
  vue.closePopup?.();
  sketch.create("rectangle");
});

$("btn-effacer").addEventListener("click", () => {
  sketch.cancel();
  zoneLayer.removeAll();
  zone = null;
  reinitialiserStats();
});

sketch.on("create", (e) => {
  if (e.state === "complete") {
    vue.popupEnabled = true;
    zone = e.graphic.geometry as Polygon;
    analyserZone();
  } else if (e.state === "cancel") {
    vue.popupEnabled = true;
  }
});

sketch.on("update", (e) => {
  const fin = e.state === "complete" || e.toolEventInfo?.type?.endsWith("-stop");
  if (fin && e.graphics[0]) {
    zone = e.graphics[0].geometry as Polygon;
    analyserZone();
  }
});

function reinitialiserStats() {
  surbrillance?.remove();
  surbrillance = null;
  $("stats").hidden = true;
  $("notice-trop").hidden = true;
  $("resultat").hidden = true;
  $("notice-erreur").hidden = true;
  ($("btn-effacer") as any).disabled = zone == null;
  ($("btn-exporter") as any).disabled = true;
}

let jetonAnalyse = 0;

async function analyserZone() {
  if (!zone || !vueBatiments) return;
  const jeton = ++jetonAnalyse;
  ($("btn-effacer") as any).disabled = false;
  $("resultat").hidden = true;

  // Bâtiments affichés dans la zone (requête côté client, très rapide)
  const requete = vueBatiments.createQuery();
  requete.geometry = zone;
  requete.spatialRelationship = "intersects";
  requete.outFields = ["OBJECTID", "H_MAX", "H_MOY", "Type_Toit", "N_SQ_AR"];
  const [resultat, altitudes] = await Promise.all([
    vueBatiments.queryFeatures(requete),
    sol.queryElevation(new Multipoint({ points: zone.rings[0], spatialReference: zone.spatialReference })),
  ]);
  if (jeton !== jetonAnalyse) return;

  const attrs = resultat.features.map((f) => f.attributes);
  const n = attrs.length;

  if (!geodeticAreaOperator.isLoaded()) await geodeticAreaOperator.load();
  const hectares = geodeticAreaOperator.execute(zone, { unit: "hectares" });

  const hmax = n ? Math.max(...attrs.map((a) => Number(a.H_MAX) || 0)) : 0;
  const hmoy = n ? attrs.reduce((s, a) => s + (Number(a.H_MOY) || 0), 0) / n : 0;
  const z = (altitudes.geometry as Multipoint).points.map((p) => p[2]);
  const arrs = [...new Set(attrs.map((a) => arrondissement(a.N_SQ_AR)).filter((a): a is number => a != null))].sort(
    (a, b) => a - b,
  );

  $("st-bat").textContent = String(n);
  $("st-surface").textContent = nf.format(hectares);
  $("st-hmax").textContent = n ? nf.format(hmax) : "–";
  $("st-hmoy").textContent = n ? nf.format(hmoy) : "–";
  $("st-alt").textContent = `${nf.format(Math.min(...z))} à ${nf.format(Math.max(...z))} m`;
  $("st-arr").textContent = arrs.length ? arrs.map((a) => (a === 1 ? "1er" : `${a}e`)).join(", ") : "–";

  // Répartition des types de toit
  const toits = $("st-toits");
  toits.replaceChildren();
  for (const t of TYPES_TOIT) {
    const nb = attrs.filter((a) => a.Type_Toit === t.valeur).length;
    if (!nb) continue;
    const pct = (nb / n) * 100;
    const ligne = document.createElement("div");
    ligne.className = "toit-ligne";
    ligne.innerHTML = `<span>${t.label}</span><span class="toit-barre"><i style="width:${pct}%;background:${t.couleur}"></i></span><b>${Math.round(pct)} %</b>`;
    toits.append(ligne);
  }
  $("stats").hidden = false;

  surbrillance?.remove();
  surbrillance = vueBatiments.highlight(resultat.features);

  const trop = n > MAX_BATIMENTS;
  $("notice-trop").hidden = !trop;
  $("notice-trop-texte").textContent = `${n} bâtiments sélectionnés : l'export est limité à ${MAX_BATIMENTS}. Réduisez la zone.`;
  ($("btn-exporter") as any).disabled = trop;
}

// ---------------------------------------------------------------------------
// Rendu et légende
// ---------------------------------------------------------------------------
let mode: ModeRendu = "hauteur";

function majLegende() {
  const items =
    mode === "hauteur"
      ? CLASSES_HAUTEUR.map((c) => [c.couleur, c.label])
      : mode === "toit"
        ? TYPES_TOIT.map((t) => [t.couleur, t.label])
        : [[COULEUR_BLANC, "Maquette blanche (rendu architecte)"]];
  $("legende").innerHTML = items.map(([c, l]) => `<li><i style="background:${c}"></i>${l}</li>`).join("");
}

$("mode").addEventListener("calciteSegmentedControlChange", (e) => {
  mode = (e.target as any).value as ModeRendu;
  batiments.renderer = renderers[mode];
  majLegende();
  $("resultat").hidden = true;
});
majLegende();

// ---------------------------------------------------------------------------
// 3. Export glTF
// ---------------------------------------------------------------------------
let fichierExporte: Blob | null = null;
let urlFichier: string | null = null;
let annulation: AbortController | null = null;

$("btn-exporter").addEventListener("click", async () => {
  if (!zone) return;
  annulation?.abort();
  annulation = new AbortController();

  const bouton = $("btn-exporter") as any;
  bouton.loading = true;
  bouton.disabled = true;
  $("resultat").hidden = true;
  $("notice-erreur").hidden = true;
  $("progression").hidden = false;

  try {
    const { fichier, nbBatiments } = await construireMaquette({
      zone,
      batiments,
      sol,
      mode,
      avecTerrain: ($("sw-terrain") as any).checked,
      signal: annulation.signal,
      progression: (m) => ($("progression-texte").textContent = m),
    });
    fichierExporte = fichier;
    if (urlFichier) URL.revokeObjectURL(urlFichier);
    urlFichier = URL.createObjectURL(fichier);
    $("resultat-texte").textContent =
      `${nbBatiments} bâtiments${($("sw-terrain") as any).checked ? " + terrain" : ""} · ${nf.format(fichier.size / 1e6)} Mo · format glTF binaire, compatible Blender, SketchUp, Rhino, three.js…`;
    $("resultat").hidden = false;
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    console.error(err);
    $("notice-erreur-texte").textContent =
      err instanceof ErreurExport ? err.message : "La création de la maquette a échoué. Réessayez avec une zone plus petite.";
    $("notice-erreur").hidden = false;
  } finally {
    bouton.loading = false;
    bouton.disabled = false;
    $("progression").hidden = true;
  }
});

function telecharger() {
  if (!urlFichier) return;
  const d = new Date();
  const horodatage = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  const a = document.createElement("a");
  a.href = urlFichier;
  a.download = `maquette-paris-${horodatage}.glb`;
  a.click();
}
$("btn-telecharger").addEventListener("click", telecharger);
$("btn-telecharger-2").addEventListener("click", telecharger);

$("btn-apercu").addEventListener("click", async () => {
  if (!urlFichier || !fichierExporte) return;
  await import("@google/model-viewer");
  const conteneur = $("apercu");
  conteneur.replaceChildren();
  const viewer = document.createElement("model-viewer");
  viewer.setAttribute("src", urlFichier);
  viewer.setAttribute("camera-controls", "");
  viewer.setAttribute("auto-rotate", "");
  viewer.setAttribute("shadow-intensity", "1");
  viewer.setAttribute("exposure", "1.1");
  viewer.setAttribute("camera-orbit", "30deg 60deg auto");
  viewer.setAttribute("alt", "Aperçu de la maquette 3D exportée");
  conteneur.append(viewer);
  ($("dialog-apercu") as any).open = true;
});
