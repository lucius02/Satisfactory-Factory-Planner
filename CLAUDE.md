# Satisfactory Factory Planner — Satisfactory calculator met plattegrond

Een productiecalculator voor Satisfactory 1.2 die de benodigde machines ook op een
plattegrond op schaal zet (raster van foundations van 8×8 m, optioneel met verdiepingen),
inclusief splitters/mergers (manifold of balancer), bandtiers en restproductie.
UI in Nederlands en Engels.

## Stack en commando's
TypeScript + Vite + Tailwind CSS v4 (via `@tailwindcss/vite`), tests met Vitest. Geen runtime-dependencies.

- `npm run dev` — dev-server (http://localhost:5173)
- `npm run build` — typecheck + productie-build naar `dist/`
- `npm test` — unit tests (`tests/`)
- `npm run typecheck`
- `npm run electron:dev` / `npm run electron:build` — desktop-app met Electron (`electron/main.cjs`, uitvoer in `release/`)
- `npm run tauri:dev` / `npm run tauri:build` — desktop-app met Tauri 2 (`src-tauri/`, vereist Rust; uitvoer in `src-tauri/target/release/bundle/`)

Lettertypes komen uit `@fontsource/*` (gebundeld), zodat de desktop-apps offline werken. Icoon: `build/icon.svg`
(PNG's/ICO voor Tauri opnieuw genereren met `npx tauri icon build/icon.svg`, daarna `src-tauri/icons/icon.png` naar `build/icon.png` kopiëren).

## CI en releases
- `.github/workflows/ci.yml` — bij push/PR: typecheck, tests, build, `cargo check` van `src-tauri`.
- `.github/workflows/release.yml` — bij een tag `vX.Y.Z` (gelijk aan `version` in `package.json`): Tauri-builds voor Windows en
  Linux via `tauri-action`, direct gepubliceerd (met `latest.json` voor de updater).
- Release maken: versie in `package.json` ophogen, committen, `git tag v2.1.0 && git push --tags`.
- Tauri auto-updater (`tauri-plugin-updater` + `tauri-plugin-process`): `src/app/updater.ts` checkt bij opstarten en elk uur
  `releases/latest/download/latest.json`, downloadt stil en installeert bij afsluiten (of via "Nu herstarten"). Updates zijn gesigneerd: publieke sleutel staat in
  `src-tauri/tauri.conf.json`, de private sleutel staat lokaal in `~/.tauri/fabrieksplanner.key` (nooit committen) en
  als GitHub-secret `TAURI_SIGNING_PRIVATE_KEY` (+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, leeg). Sleutel kwijt = geen updates meer.
- Feedback: knop "Feedback" → `src/ui/feedback.ts` (formulier) + `src/feedback/collect.ts` (foutenbuffer, systeeminfo,
  PNG-screenshot van de kaart, deelcode). Versturen naar `VITE_FEEDBACK_URL` (`.env` lokaal, repo-variabele `FEEDBACK_URL`
  in de release-workflow); zonder URL wordt de melding als Markdown gekopieerd. `feedback-worker/` = Cloudflare Worker
  die het GitHub-issue maakt (token als Worker-secret, rate limit, bijlagen in branch `feedback-assets`); zie de README daar.
- Electron heeft geen auto-updater en wordt niet in CI gebouwd; lokaal via `npm run electron:build`.

`legacy/index.html` is de oude versie in één bestand (alleen ter referentie).

## Structuur (`src/`)
- `data/` — speldata, alles per minuut bij 100%.
  - `types.ts` — `Item`, `Recipe`, `Building`.
  - `buildings.ts` — `BUILDINGS`: breedte `w` × lengte `l` (m), vermogen `mw`, kleur. `v` = variabel vermogen (gemiddelde).
  - `items.ts` — `ITEMS`, `FLUIDS`, grondstoffen (`raw`). `tier` = groep in de keuzelijst (6 = tier 0–6, 7, 8, 9).
  - `recipes.ts` — `RECIPES[itemId]`; helpers `rec()` (standaard) en `A()` (alternate). `out` = hoofdproduct + bijproducten.
  - `logistics.ts` — bandcapaciteit (`BELTS` Mk1–6), pijpen (`PIPES` Mk1–2), maten van splitter/merger/sink/opslag.
  - `generators.ts` — `GENERATORS` (Biomass Burner, Coal, Fuel, Nuclear): maat, MW, water, brandstoffen en afval; `GenSpec`.
  - `sinkPoints.ts` — AWESOME Sink-punten per item (ontbreekt = kan niet gesinkt worden).
- `calc/` — pure rekenlogica (geen DOM, getest).
  - `solver.ts` — `compute(input)`: fixed-point solver van doelen naar grondstoffen; externe aanvoer (`external`, groep `x:item`) dekt eerst vraag af; bijproducten hergebruiken (optioneel),
    kringlopen, kloksnelheid begrensd door band/pijp-tier, klokmodus `even`/`fill`/`full`, restproductie → sink/opslag-groepen.
  - `model.ts` — `Group`, `Model`, `suppliers()` (wie levert wat, als aandeel van de totale productie).
  - `balancer.ts` — 1:N balancers uit 1:2/1:3 splitters, loopback voor andere priemfactoren, `balancerCount()`.
  - `extractors.ts` — miners/extractors (output begrensd door band/pijp).
  - `recipes.ts` — gekozen recept, productiediepte, alt-telling.
  - `optimize.ts` — `chooseRecipes()`: kiest per product automatisch het beste recept uit de ontgrendelde recepten
    (`state.unlocked`; standaardrecepten altijd beschikbaar), doel `raw`/`power`/`machines`. Handmatige keuzes (`state.rc`) blijven vast.
    Effectieve recepten = `{ ...ctx.auto, ...state.rc }` (`effectiveRc()` in de controller).
- `layout/geometry.ts` — `geomLocal()` legt één groep neer: invoer boven, uitvoer onder, elk links/midden/rechts
  (`inSides` per invoeritem / `outSide`; blokinstelling `inSides`/`side`/`outSide`, anders automatisch via `layout/sides.ts`
  uit de posities van leveranciers/afnemers per item, in `ctx.sides`; breedte hangt niet af van de kant). Een balancer in één rij
  wordt altijd recht boven het midden gevoed. `outSplit` (blokinstelling): hoofduitvoer per afnemer een eigen band
  (machines verdeeld met `allocate()`, verschil via splitter→merger); `WorldGeom.outFor(item, afnemer)` geeft het uitgangspunt.
  Uitvoerkant en splitsen werken bij elk blok met uitvoer, ook grondstofblokken (`consumersOf()` gebruikt de eerste uitvoer). Meerdere rijen
  (max. per rij door instelling én bandcapaciteit), manifold (splitters in serie) of balancerboom, mergers aan de uitvoerkant.
  Eén rij met één band per stroom: invoer direct boven de eerste machine, uitvoer onder de laatste, geen zijstroken;
  blokgrootte = machines + splitter/merger-rijen (1 Constructor = 1×3 foundations). Kabels pole→machine/pole→pole zijn `wire`-parts.
  Te veel voor één band: standaard parallelle banden in dezelfde rij (`capRows` = extra rijen; balancers altijd rijen).
  Per blok (`state.blockOpt[key]`): invoerkant links/midden/rechts (`side`), machines per rij, extra ruimte (`spacing`).
  Midden: elke rij wordt vanuit het midden naar buiten gevoed (oneven aantal: punt bij de middelste machine, één 3-weg splitter/merger); bij meerdere rijen loopt de trunk door een gang van 1 foundation.
  `align` (standaard aan) zet elke machine midden op hele foundations. Geen spiegelen meer.
  Levert tekenbare `parts` en `counts` (splitters/mergers/junctions). `worldGeom()` past positie/rotatie toe.
- `layout/autoLayout.ts` — `flow` (rijen per productiediepte) of `compact` (shelf-packing), barycentrum-sortering,
  max. verdiepingsgrootte (`floorW`×`floorL` foundations), verdiepingen; handmatig geplaatste blokken zijn obstakels.
- `render/router.ts` — A*-bandrouter op een raster van 2 m om blokken heen (weinig bochten, niet over andere banden).
  Sleeppunt per verbinding in `state.beltOff`, relatief t.o.v. het midden tussen beide band-uiteinden (beweegt mee met de blokken).
  Tijdens slepen snelle route, bij loslaten A*. Blokken tegen elkaar (`touching()`): directe band langs de naad, zonder label, met eigen pijlpunt;
  `straighten()` haalt kleine haakjes uit A*-routes;
  klik op een band (`.belt-hit`) toont item, hoeveelheid en bandtype. Labels langs verticale banden staan verticaal.
- Twee pagina's: `state.page` = `factory` of `power`. `state.pos`/`state.beltWp` horen altijd bij de open pagina, de andere
  staat in `state.otherLayout` (`switchPage()` wisselt ze). `planInput()` in de controller bouwt de solver-invoer per pagina;
  op de stroompagina worden generatoren (`gens`, groep `g:i`, kind `generator`, `gen` = MW) als vaste vraag naar brandstof/water
  meegerekend, met `produceFuel` uit = brandstof als externe aanvoer. `ui/power.ts` = generatorenpaneel.
- Versie: `__APP_VERSION__` (uit `package.json`, via `define` in `vite.config.ts`) staat onderin de zijbalk.
- Daisy-chaining (1.2, `state.daisy`, standaard aan): één pole per rij, machines geven stroom door aan de volgende.
- Power poles: `state.pole` (Mk1–3, 4/7/10 aansluitingen); `geomLocal()` plaatst per rij (en bij miners/extractors) één pole per
  (aansluitingen − 2) machines. `layout/powerNet.ts` verbindt alle lijnen met een minimum spanning tree, kabels max. 100 m
  (tussenpoles), verdiepingshoogte 8 m; een volle pole (`used` = aansluitingen in gebruik) krijgt een hulppole ernaast; getekend in `render/map.ts` (`state.showWires`), resultaat in `ctx.net`.
- `ui/picker.ts` — productkiezer en externe aanvoer (zoekbalk + checkboxlijst, alfabetisch).
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
