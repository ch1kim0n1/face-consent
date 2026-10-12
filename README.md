# Face Consent

Your face is an identifier you control. Scanning it (live or via a portrait QR) sends a permission request to the owner’s phone. Accept reveals a Discord-style profile card; reject or silence tells the scanner no.

Design spec: [docs/superpowers/specs/2026-10-12-face-consent-design.md](docs/superpowers/specs/2026-10-12-face-consent-design.md)

## Quick start (two-phone demo)

```bash
cd face-consent
npm install
npm run dev:server   # terminal 1 — magic links print in the log
npm run dev:client   # terminal 2 — http://localhost:5173
```

1. On phone A: sign in with email, open the magic link from the **server log**, set a display name, enroll a face in **Profile**, enable notifications.
2. On phone B: sign in as a second user, open **Scan**, point at A’s face or **My code** QR.
3. On A: accept or reject the prompt (push if VAPID is set, otherwise the in-app poll).

For LAN testing, set `CLIENT_ORIGIN` and use your machine’s IP in the Vite dev server (`vite --host`) and the magic links in the log.

## Web Push (optional)

Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

Copy the keys into `.env` (see `.env.example`) and restart the server.

## Tests

```bash
npm test
```

API tests use fixture face vectors (no photos).

## Project layout

- `server/` — Hono API, SQLite, matching, consent, push
- `client/` — React PWA, face-api.js descriptors in-browser, portrait QR
