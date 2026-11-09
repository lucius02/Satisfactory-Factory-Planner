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
