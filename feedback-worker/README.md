# Feedback-worker

Kleine Cloudflare Worker die meldingen uit de planner ontvangt en er een GitHub-issue van maakt.
Het GitHub-token staat alleen hier als geheim, nooit in de app.

Wat hij doet:
- **Controleren:** verplichte velden, maximale groottes, geldige JSON/PNG, honeypot tegen bots.
- **Spam beperken:** max. 5 meldingen per minuut per IP-adres (`[[ratelimits]]` in `wrangler.toml`).
- **Bijlagen:** screenshot en grote fabrieksplannen in de branch `feedback-assets`, met een link in het issue.
- **Issue:** labels `feedback` + `bug` / `idea` / `question`; `@mentions` en HTML in de tekst worden onschadelijk gemaakt.

## Eenmalig instellen

1. **Kies de repo voor de meldingen.** De hoofdrepo is openbaar, dus issues (met contactgegevens en fabrieksplannen)
   zijn dan voor iedereen zichtbaar. Aanrader: maak een **privé** repo, bijv. `lucius02/sfp-feedback`, en zet die in
   `wrangler.toml` bij `GITHUB_REPO`.
2. **Maak een fine-grained token** op GitHub → Settings → Developer settings → Fine-grained tokens:
   alleen toegang tot die ene repo, met de rechten **Issues: Read and write** en **Contents: Read and write**.
3. **Zet de Worker online** (gratis Cloudflare-account):
   ```bash
   cd feedback-worker
   npm install
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN   # plak het token
   npx wrangler deploy
   ```
   `deploy` toont de URL, bijv. `https://sfp-feedback.<jouw-subdomein>.workers.dev`.
4. **Geef de app de URL:**
   - Releases: GitHub → repo Settings → Secrets and variables → Actions → tab *Variables* →
     `FEEDBACK_URL` = de Worker-URL. De release-workflow bouwt hem in.
   - Lokaal ontwikkelen: maak `.env` in de projectmap met `VITE_FEEDBACK_URL=<url>` (zie `.env.example`).
5. Gebruik je een eigen domein in plaats van `*.workers.dev`, voeg het dan toe aan `connect-src` in
   `src-tauri/tauri.conf.json`, anders blokkeert de desktop-app het verzoek.

Zonder URL werkt de knop ook: de melding wordt dan als Markdown naar het klembord gekopieerd.

## Testen

De logica wordt getest vanuit de hoofdmap met `npm test` (`tests/feedback.test.ts`). Lokaal draaien kan met
`npm run dev` in deze map; zet `http://localhost:5173` in `ALLOWED_ORIGINS` (staat er standaard in).

## Claude laat meldingen oplossen (route B: alles privé)

`github/claude-fix.yml` is een workflow voor de **feedback-repo**. Reageer je in een feedback-issue met `@claude`
(alleen de eigenaar van de repo kan dat starten), dan:

1. haalt de workflow de hoofdrepo op en laat Claude het probleem oplossen (met de melding en het fabrieksplan als context);
2. draait hij `npm run typecheck` en `npm test`;
3. pusht hij een branch `claude/feedback-<nr>-…` naar de hoofdrepo en opent hij daar een **pull request**
   (als concept als de tests falen). In de PR staat alleen de codewijziging en een neutrale tekst: geen contactgegevens,
   plan of screenshot;
4. zet hij de link naar de PR als reactie in het feedback-issue.

Je kunt in je `@claude`-reactie ook extra aanwijzingen geven, bijv. *"@claude los dit op, de fout zit vermoedelijk in de
geometrie van de assembler"*.

### Eenmalig instellen

1. **Workflow plaatsen:** kopieer `github/claude-fix.yml` naar de feedback-repo als `.github/workflows/claude-fix.yml`
   (op GitHub: *Add file → Create new file*, plak de inhoud, commit).
2. **Token voor de hoofdrepo:** maak een fine-grained token met alleen toegang tot `Satisfactory-Factory-Planner` en de
   rechten **Contents: Read and write** en **Pull requests: Read and write**.
3. **Secrets in de feedback-repo** (Settings → Secrets and variables → Actions → *Secrets*):
   - `MAIN_REPO_TOKEN` = het token uit stap 2
   - `ANTHROPIC_API_KEY` = een API-sleutel van console.anthropic.com
     (of gebruik je Claude-abonnement: maak met `claude setup-token` een token, zet het als `CLAUDE_CODE_OAUTH_TOKEN`
     en wissel in de workflow de regel `anthropic_api_key` om voor `claude_code_oauth_token`).
4. **Actions aan:** controleer in de feedback-repo onder Settings → Actions dat workflows mogen draaien.

### Veiligheid

- Alleen jouw reactie (`OWNER`) start de workflow; meldingen van gebruikers zelf doen niets.
- De tekst van een melding is gebruikersinvoer. Claude krijgt alleen bestanden lezen/bewerken en `npm test`/`typecheck`/
  `build` als gereedschap, en het token voor de hoofdrepo wordt pas in de stap ná Claude gebruikt (de checkout bewaart het
  niet). Lees de PR dus altijd na voordat je merget; er wordt nooit direct naar `master` gecommit.
