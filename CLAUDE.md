# Fabrieksplanner — Satisfactory calculator met plattegrond

Een productiecalculator voor Satisfactory 1.0 die de benodigde machines ook op een
plattegrond op schaal zet (raster van foundations van 8×8 m, optioneel met verdiepingen),
inclusief splitters/mergers (manifold of balancer), bandtiers en restproductie.
UI in Nederlands en Engels.

## Stack en commando's
TypeScript + Vite + Tailwind CSS v4 (via `@tailwindcss/vite`), tests met Vitest. Geen runtime-dependencies.

- `npm run dev` — dev-server (http://localhost:5173)
- `npm run build` — typecheck + productie-build naar `dist/`
- `npm test` — unit tests (`tests/`)
- `npm run typecheck`

`legacy/index.html` is de oude versie in één bestand (alleen ter referentie).

## Structuur (`src/`)
- `data/` — speldata, alles per minuut bij 100%.
  - `types.ts` — `Item`, `Recipe`, `Building`.
  - `buildings.ts` — `BUILDINGS`: breedte `w` × lengte `l` (m), vermogen `mw`, kleur. `v` = variabel vermogen (gemiddelde).
  - `items.ts` — `ITEMS`, `FLUIDS`, grondstoffen (`raw`). `tier` = groep in de keuzelijst (6 = tier 0–6, 7, 8, 9).
  - `recipes.ts` — `RECIPES[itemId]`; helpers `rec()` (standaard) en `A()` (alternate). `out` = hoofdproduct + bijproducten.
  - `logistics.ts` — bandcapaciteit (`BELTS` Mk1–6), pijpen (`PIPES` Mk1–2), maten van splitter/merger/sink/opslag.
  - `sinkPoints.ts` — AWESOME Sink-punten per item (ontbreekt = kan niet gesinkt worden).
- `calc/` — pure rekenlogica (geen DOM, getest).
  - `solver.ts` — `compute(input)`: fixed-point solver van doelen naar grondstoffen; bijproducten hergebruiken (optioneel),
    kringlopen, kloksnelheid begrensd door band/pijp-tier, klokmodus `even`/`fill`/`full`, restproductie → sink/opslag-groepen.
  - `model.ts` — `Group`, `Model`, `suppliers()` (wie levert wat, als aandeel van de totale productie).
  - `balancer.ts` — 1:N balancers uit 1:2/1:3 splitters, loopback voor andere priemfactoren, `balancerCount()`.
  - `extractors.ts` — miners/extractors (output begrensd door band/pijp).
  - `recipes.ts` — gekozen recept, productiediepte, alt-telling.
- `layout/geometry.ts` — `geomLocal()` legt één groep neer: invoer links-boven, uitvoer rechts-onder, meerdere rijen
  (max. per rij door instelling én bandcapaciteit), manifold (splitters in serie) of balancerboom, mergers aan de uitvoerkant.
  Levert tekenbare `parts` en `counts` (splitters/mergers/junctions). `worldGeom()` past positie/rotatie toe.
- `layout/autoLayout.ts` — rijen per productiediepte (grondstoffen boven, sink/opslag onder), barycentrum-sortering, verdiepingen.
- `render/map.ts` — SVG in wereldcoördinaten (1 eenheid = 1 meter), pan/zoom via één `matrix()`.
- `ui/` — zijbalk, tabel, infopaneel, receptenvenster, deelvenster, kaart-events.
- `app/context.ts` (runtime-state: model, selectie, view, geometrie) en `app/controller.ts` (`recompute()`, `refreshAll()`).
- `state/` — `State`-type en `store.ts` (localStorage-sleutel `sf-fabrieksplanner-v3`, migreert v2; deelcode export/import).
- `i18n/` — `texts.ts` met alle teksten (`nl`, `en`), `t('sleutel', ...args)`; statische HTML krijgt `data-i="sleutel"`.

## Conventies
- Nieuwe tekst = in beide talen toevoegen (TypeScript dwingt dat af via `Record<TextKey, string>`).
- Itemnamen blijven Engels (zoals in de game), ook in de NL-interface.
- Getallen tonen met `fmt()` (locale-afhankelijk), eenheden met `unit(itemId)`, banden met `beltFor()`.
- Rekenlogica blijft vrij van DOM/`state` zodat hij testbaar is; nieuwe solver-features krijgen een test in `tests/`.
- Nieuwe receptdata altijd controleren tegen de Satisfactory-wiki (satisfactory.wiki.gg).
- Styling met Tailwind-utilities; herbruikbare componentklassen staan in `src/styles.css` (`@layer components`).

## Ideeën voor volgende stappen
- Data genereren uit de game-data (`Docs.json`) i.p.v. handmatig.
- Meerdere recepten tegelijk voor één product (mix), overclock/Somersloops, slimmer banden routeren tussen groepen.
- Bandlengte en bouwkosten berekenen; export naar een blueprint of afbeelding.
