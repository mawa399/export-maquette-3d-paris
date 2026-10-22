# Maquette 3D de Paris — export glTF

Application web 3D qui permet de **sélectionner un quartier de Paris et de télécharger sa maquette 3D** (bâtiments + terrain) au format **glTF binaire (.glb)**, directement depuis le navigateur.

La maquette exportée est une **maquette volumétrique (LoD1)** : chaque bâtiment est extrudé à partir de son emprise au sol et de sa hauteur moyenne réelle, puis posé sur le terrain.

Le fichier obtenu s'ouvre dans Blender, SketchUp, Rhino, Unity, three.js… Utile pour l'urbanisme, l'architecture, la visualisation ou l'impression 3D.

**Démo en ligne :** https://mawa399.github.io/export-maquette-3d-paris/

Réalisé avec **ArcGIS Maps SDK for JavaScript 5.1** et le design system **Calcite**.

## Fonctionnalités

- Scène 3D de Paris : bâtiments 3D, terrain, imagerie, ombres portées au soleil
- Accès rapide à des lieux (Tour Eiffel, Île de la Cité, Montmartre, Front de Seine…)
- **Sélection d'une zone** par rectangle, déplaçable et redimensionnable
- **Statistiques de la zone** en direct : nombre de bâtiments, surface (ha), hauteurs max et moyenne, altitude du sol, arrondissements, répartition des types de toit
- **Trois rendus** : par classe de hauteur, par type de toit (haussmannien, plat, deux pentes…) ou « maquette blanche » d'architecte
- **Export glTF** des bâtiments, avec ou sans terrain, en reprenant les couleurs du rendu choisi
- **Aperçu 3D** du fichier exporté dans l'application avant téléchargement

## Comment ça marche

| Étape | API du SDK |
|---|---|
| Tracé de la zone | `SketchViewModel` (outil rectangle, mode transformation) |
| Statistiques instantanées | requête côté client `SceneLayerView.queryFeatures()`, `geodeticAreaOperator`, `Ground.queryElevation()` |
| Emprises et hauteurs des bâtiments | `FeatureLayer.queryFeatures()` sur le service d'entités (emprises `xyFootprint`, champs `H_MOY`, `H_MAX`) |
| Altitude du sol sous chaque bâtiment | `Ground.queryElevation()` en une seule requête pour tous les sommets |
| Extrusion des volumes (LoD1) | `meshUtils.createFromPolygon()` pour les toits + `Mesh` construit sommet par sommet pour les murs |
| Extraction du terrain | `meshUtils.createFromElevation()` |
| Passage en repère local (mètres) | `meshUtils.convertVertexSpace()` + `MeshLocalVertexSpace` centré sur la zone |
| Couleurs | `MeshMaterialMetallicRoughness` (PBR, opaque) appliqué à chaque composant |
| Fusion et export | `meshUtils.merge()` puis `Mesh.toBinaryGLTF()` |

Le code d'export est dans [`src/export.ts`](src/export.ts), l'interface dans [`src/main.ts`](src/main.ts).

## Données

- **Bâtiments 3D** : service public « Batiments_3D_Paris » publié sur ArcGIS Online par Esri France — couche de scène pour l'affichage, couche d'entités pour l'export (attributs : hauteurs, type de toit, arrondissement). Couverture : Paris intra-muros.
- **Terrain** : World Elevation 3D (Esri)
- **Imagerie** : World Imagery (Esri)

Aucune clé d'API n'est nécessaire : tous les services utilisés sont publics.

## Lancer en local

```bash
npm install
npm run dev
```

Puis ouvrir l'adresse affichée (http://localhost:5173).

## Déploiement

Chaque `push` sur `main` construit l'application et la publie sur GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`).

### Référencer l'application dans ArcGIS Online

1. Dans ArcGIS Online : **Contenu › Nouvel élément › Application**
2. Type : **Application web**, URL : `https://mawa399.github.io/export-maquette-3d-paris/`
3. Ajouter titre, résumé, miniature et balises, puis partager

L'application apparaît alors dans le contenu et la galerie ArcGIS Online.

## Pistes d'évolution

- Ajouter d'autres communes (bâtiments BD TOPO de l'IGN publiés en couche de scène)
- Esquisser de nouveaux bâtiments dans la zone et les inclure dans l'export
- Export de l'emprise et des attributs en GeoJSON en complément du glTF

## Crédits

Méthode d'export inspirée de l'application de démonstration [City Download Portal](https://github.com/Esri/city-download-portal) d'Esri (licence Apache 2.0).

Auteur : **Mawa Diaw** — géomaticien / développeur SIG · [LinkedIn](https://www.linkedin.com/in/mawa-diaw)

Licence : MIT
