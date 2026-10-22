// Construction de la maquette 3D : bâtiments extrudés + terrain, fusionnés puis exportés en glTF binaire (.glb).
// Chaîne mesh → glTF inspirée de l'application « City Download Portal » d'Esri (Apache 2.0).

import type Polygon from "@arcgis/core/geometry/Polygon";
import type Extent from "@arcgis/core/geometry/Extent";
import PolygonGeom from "@arcgis/core/geometry/Polygon";
import Multipoint from "@arcgis/core/geometry/Multipoint";
import Mesh from "@arcgis/core/geometry/Mesh";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import type Ground from "@arcgis/core/Ground";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import MeshLocalVertexSpace from "@arcgis/core/geometry/support/MeshLocalVertexSpace";
import MeshGeoreferencedVertexSpace from "@arcgis/core/geometry/support/MeshGeoreferencedVertexSpace";
import MeshMaterialMetallicRoughness from "@arcgis/core/geometry/support/MeshMaterialMetallicRoughness";
import * as meshUtils from "@arcgis/core/geometry/support/meshUtils";
import * as projectOperator from "@arcgis/core/geometry/operators/projectOperator";
import { COULEUR_TERRAIN, MAX_BATIMENTS, couleurBatiment, type ModeRendu } from "./config";

export interface OptionsExport {
  zone: Polygon;
  /** Couche d'entités des bâtiments (emprises au sol + hauteurs) */
  batiments: FeatureLayer;
  sol: Ground;
  mode: ModeRendu;
  avecTerrain: boolean;
  signal?: AbortSignal;
  progression?: (message: string) => void;
}

export interface ResultatExport {
  fichier: Blob;
  nbBatiments: number;
}

export class ErreurExport extends Error {}

const materiau = (couleur: string, rugosite = 0.85) =>
  // alphaMode « opaque » : sans lui, le glTF est exporté en transparence (BLEND)
  // et les visionneuses dessinent le terrain par-dessus les bâtiments.
  new MeshMaterialMetallicRoughness({
    color: couleur,
    metallic: 0,
    roughness: rugosite,
    doubleSided: true,
    alphaMode: "opaque",
  });

/**
 * Extrude une emprise au sol entre deux altitudes : murs + toit plat (niveau de détail LoD1).
 * Les sommets sont en coordonnées géoréférencées (Web Mercator, altitudes en mètres).
 */
async function extruder(emprise: Polygon, base: number, sommet: number, couleur: string): Promise<Mesh[]> {
  const sr = emprise.spatialReference;
  const mat = materiau(couleur);

  // Toit : polygone triangulé par le SDK, placé à l'altitude du sommet
  const toit = await meshUtils.createFromPolygon(
    new PolygonGeom({
      hasZ: true,
      rings: emprise.rings.map((r) => r.map(([x, y]) => [x, y, sommet])),
      spatialReference: sr,
    }),
    { material: mat },
  );

  // Murs : deux triangles par arête de chaque anneau (extérieur et cours intérieures)
  const positions: number[] = [];
  const faces: number[] = [];
  for (const anneau of emprise.rings) {
    for (let i = 0; i < anneau.length - 1; i++) {
      const [ax, ay] = anneau[i];
      const [bx, by] = anneau[i + 1];
      const k = positions.length / 3;
      positions.push(ax, ay, base, bx, by, base, ax, ay, sommet, bx, by, sommet);
      // ordre choisi pour que les faces regardent vers l'extérieur du bâtiment
      faces.push(k, k + 3, k + 1, k, k + 2, k + 3);
    }
  }
  const murs = new Mesh({
    spatialReference: sr,
    vertexSpace: new MeshGeoreferencedVertexSpace(),
    vertexAttributes: { position: new Float64Array(positions) },
    components: [{ faces: new Uint32Array(faces), material: mat, shading: "flat" }],
  } as any);

  return [toit, murs];
}

export async function construireMaquette(o: OptionsExport): Promise<ResultatExport> {
  const { zone, batiments, sol, mode, avecTerrain, signal, progression } = o;
  // Tout est calculé en Web Mercator, le système de la vue et du terrain
  const sr = SpatialReference.WebMercator;

  // 1. Emprise de la zone en Web Mercator
  if (!projectOperator.isLoaded()) await projectOperator.load();
  const emprise = (
    zone.spatialReference.isWebMercator ? zone.extent : projectOperator.execute(zone.extent!, sr)
  ) as Extent;

  // 2. Emprises au sol et hauteurs des bâtiments
  progression?.("Récupération des bâtiments…");
  const requete = batiments.createQuery();
  requete.geometry = emprise;
  requete.spatialRelationship = "intersects";
  requete.returnGeometry = true;
  requete.outSpatialReference = sr;
  requete.outFields = ["OBJECTID", "H_MAX", "H_MOY", "Type_Toit"];
  const resultat = await batiments.queryFeatures(requete, { signal });
  const entites = resultat.features.filter((f) => f.geometry?.type === "polygon");

  if (entites.length > MAX_BATIMENTS) {
    throw new ErreurExport(
      `La zone contient ${entites.length} bâtiments (maximum ${MAX_BATIMENTS}). Réduisez la zone.`,
    );
  }
  if (entites.length === 0 && !avecTerrain) {
    throw new ErreurExport("Aucun bâtiment dans la zone. Activez le terrain ou déplacez la zone.");
  }

  // 3. Altitude du sol sous chaque bâtiment (une seule requête pour tous les sommets)
  progression?.("Lecture de l'altitude du terrain…");
  const centre = emprise.center!;
  const sommetsSol: number[][] = [[centre.x, centre.y]];
  for (const f of entites) for (const r of (f.geometry as Polygon).rings) for (const p of r) sommetsSol.push([p[0], p[1]]);
  const altitudes = await sol.queryElevation(new Multipoint({ points: sommetsSol, spatialReference: sr }), { signal });
  const z = (altitudes.geometry as Multipoint).points.map((p) => p[2] ?? 0);

  // Origine du modèle : centre de la zone, au niveau du sol
  const espace = new MeshLocalVertexSpace({ origin: [centre.x, centre.y, z[0]] });

  // 4. Extrusion de chaque bâtiment, puis passage dans le repère local (en mètres)
  progression?.(`Construction de ${entites.length} bâtiments…`);
  const maillages: Mesh[] = [];
  let curseur = 1;
  for (const f of entites) {
    const poly = f.geometry as Polygon;
    const nb = poly.rings.reduce((s, r) => s + r.length, 0);
    const zBat = z.slice(curseur, curseur + nb);
    curseur += nb;
    const base = Math.min(...zBat);
    const hauteur = Number(f.attributes.H_MOY) > 0 ? Number(f.attributes.H_MOY) : Number(f.attributes.H_MAX) || 3;
    const parties = await extruder(poly, base - 0.5, base + hauteur, couleurBatiment(f.attributes, mode));
    for (const m of parties) maillages.push(await meshUtils.convertVertexSpace(m, espace, { signal }));
  }

  // 5. Terrain extrait du modèle numérique de terrain
  if (avecTerrain) {
    progression?.("Extraction du terrain…");
    const terrain = await meshUtils.createFromElevation(sol, emprise, {
      demResolution: "finest-contiguous",
      signal,
    });
    for (const c of terrain.components ?? []) {
      c.name = "terrain";
      c.material = materiau(COULEUR_TERRAIN, 1);
    }
    maillages.push(await meshUtils.convertVertexSpace(terrain, espace, { signal }));
  }

  // 6. Fusion et export en glTF binaire
  progression?.("Fusion et export glTF…");
  const maquette = meshUtils.merge(maillages);
  if (!maquette) throw new ErreurExport("La fusion des maillages a échoué.");
  const tampon = await maquette.toBinaryGLTF();

  return {
    fichier: new Blob([tampon], { type: "model/gltf-binary" }),
    nbBatiments: entites.length,
  };
}
