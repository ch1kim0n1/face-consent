import webpush from "web-push";
import type Database from "better-sqlite3";

export function configurePush(vapidPublic: string, vapidPrivate: string, subject: string) {
  webpush.setVapidDetails(subject, vapidPublic, vapidPrivate);
}

export function saveSubscription(
  db: Database.Database,
  userId: string,
  subscription: unknown,
) {
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, subscription_json) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET subscription_json = excluded.subscription_json`,
  ).run(userId, JSON.stringify(subscription));
}

export async function notifyOwner(
  db: Database.Database,
  ownerId: string,
  scannerName: string,
  requestId: string,
) {
  const row = db
    .prepare(`SELECT subscription_json FROM push_subscriptions WHERE user_id = ?`)
    .get(ownerId) as { subscription_json: string } | undefined;
  if (!row) return;
  const sub = JSON.parse(row.subscription_json);
  const payload = JSON.stringify({
    requestId,
    title: `${scannerName} wants to view your profile`,
    body: "Tap to respond",
  });
  try {
    await webpush.sendNotification(sub, payload);
  } catch (err) {
    console.warn("Push failed:", err);
  }
}
