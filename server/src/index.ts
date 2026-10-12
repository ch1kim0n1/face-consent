import { serve } from "@hono/node-server";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { configurePush } from "./push.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = process.env.DATA_DIR ?? path.join(root, "data", "uploads");
const dbPath = process.env.DB_PATH ?? path.join(root, "data", "face-consent.db");
const secret = process.env.SESSION_SECRET ?? "dev-change-me";
const port = Number(process.env.PORT ?? 3001);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;

const { db } = openDb(dbPath, dataDir);
const env = { db, dataDir, secret, baseUrl, clientOrigin };
const app = createApp(env);

const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
if (vapidPublic && vapidPrivate) {
  configurePush(vapidPublic, vapidPrivate, process.env.VAPID_SUBJECT ?? "mailto:dev@localhost");
  console.log("Web Push configured");
} else {
  console.log("VAPID keys not set — push notifications disabled");
}

console.log(`Face Consent API on ${baseUrl}`);
serve({ fetch: app.fetch, port });
