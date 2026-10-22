// Construction de la maquette 3D : bâtiments + terrain fusionnés, puis export glTF binaire (.glb).
// Méthode inspirée de l'application « City Download Portal » d'Esri (Apache 2.0).

import type Polygon from "@arcgis/core/geometry/Polygon";
import type Extent from "@arcgis/core/geometry/Extent";
import Point from "@arcgis/core/geometry/Point";
import type Mesh from "@arcgis/core/geometry/Mesh";
import type Ground from "@arcgis/core/Ground";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import MeshLocalVertexSpace from "@arcgis/core/geometry/support/MeshLocalVertexSpace";
import MeshMaterialMetallicRoughness from "@arcgis/core/geometry/support/MeshMaterialMetallicRoughness";
import * as meshUtils from "@arcgis/core/geometry/support/meshUtils";
import * as projectOperator from "@arcgis/core/geometry/operators/projectOperator";
import { COULEUR_TERRAIN, MAX_BATIMENTS, couleurBatiment, type ModeRendu } from "./config";

export interface OptionsExport {
  zone: Polygon;
  /** Couche d'entités multipatch (FeatureServer) des bâtiments 3D */
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

export async function construireMaquette(o: OptionsExport): Promise<ResultatExport> {
  const { zone, batiments, sol, mode, avecTerrain, signal, progression } = o;
  // Tout est calculé en Web Mercator, le système de la vue et du terrain
  const sr = SpatialReference.WebMercator;

  // 1. Emprise de la zone en Web Mercator
  if (!projectOperator.isLoaded()) await projectOperator.load();
  const emprise = (
    zone.spatialReference.isWebMercator ? zone.extent : projectOperator.execute(zone.extent!, sr)
  ) as Extent;

  // 2. Requête des bâtiments avec leur géométrie 3D (maillages)
  progression?.("Récupération des bâtiments…");
  const requete = batiments.createQuery();
  requete.geometry = emprise;
  requete.spatialRelationship = "intersects";
  requete.returnGeometry = true;
  requete.outSpatialReference = sr;
  requete.outFields = ["OBJECTID", "H_MAX", "Type_Toit"];
  const resultat = await batiments.queryFeatures(requete, { signal });
  const entites = resultat.features.filter((f) => f.geometry?.type === "mesh");

  if (entites.length > MAX_BATIMENTS) {
    throw new ErreurExport(
      `La zone contient ${entites.length} bâtiments (maximum ${MAX_BATIMENTS}). Réduisez la zone.`,
    );
  }
  if (entites.length === 0 && !avecTerrain) {
    throw new ErreurExport("Aucun bâtiment dans la zone. Activez le terrain ou déplacez la zone.");
  }

  // 3. Origine du modèle : centre de la zone, à l'altitude du sol
  const centre = emprise.center!;
  const altitude = await sol.queryElevation(
    new Point({ x: centre.x, y: centre.y, spatialReference: sr }),
    { signal },
  );
  const z = (altitude.geometry as Point).z ?? 0;
  const espace = new MeshLocalVertexSpace({ origin: [centre.x, centre.y, z] });

  // 4. Conversion de chaque bâtiment dans un repère local (en mètres), avec sa couleur
  progression?.(`Préparation de ${entites.length} bâtiments…`);
  const maillages: Mesh[] = await Promise.all(
    entites.map(async (f) => {
      const m = f.geometry as Mesh;
      await m.load();
      const couleur = couleurBatiment(f.attributes, mode);
      for (const c of m.components ?? []) {
        c.name = `batiment-${f.attributes.OBJECTID}`;
        c.material = new MeshMaterialMetallicRoughness({ color: couleur, metallic: 0, roughness: 0.85 });
      }
      return meshUtils.convertVertexSpace(m, espace, { signal });
    }),
  );

  // 5. Terrain extrait du modèle numérique de terrain
  if (avecTerrain) {
    progression?.("Extraction du terrain…");
    const terrain = await meshUtils.createFromElevation(sol, emprise, {
      demResolution: "finest-contiguous",
      signal,
    });
    for (const c of terrain.components ?? []) {
      c.name = "terrain";
      c.material = new MeshMaterialMetallicRoughness({ color: COULEUR_TERRAIN, metallic: 0, roughness: 1 });
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
