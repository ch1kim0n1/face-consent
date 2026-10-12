# Face Consent — Design

Working title: Face Consent. Date: 2026-10-12.

A face is an identifier the owner controls. Scanning it asks permission. The profile appears only after the owner accepts.

## MVP

Two phones, one installable website. One person enrolls. The other scans. Accept reveals a profile card. Reject, or 60 seconds of silence, tells the scanner no.

In scope:

- Email magic-link signup and a display name
- Face enrollment by selfie or uploaded photo
- A portrait QR (high error correction, face in the center) and live face match, both opening the same consent request
- Web push to the owner, plus an in-app prompt when their site is open
- Discord-style card on accept: banner, avatar, name, links
- Scanner stays blind until accept

Out of scope:

- A public essay or landing page about face copyright
- A directory of users
- Native iOS or Android apps
- A QR whose every module is painted into a portrait
- Matching anyone who has not enrolled

## System

One progressive web app. The same account can enroll and scan. A small API stores accounts, profiles, face vectors, push subscriptions, and consent requests. The phone runs the camera. It computes the face vector locally and uploads the vector. The server does not receive camera frames.

Stack:

- Client: Vite, React, TypeScript, a service worker for install and web push
- Face: browser face-api recognition model, 128-number descriptor
- QR: generated at error-correction level H with the avatar drawn in the center; scanned with BarcodeDetector, falling back to jsQR
- Server: Node, TypeScript, Hono, SQLite
- Push: Web Push (VAPID)
- Mail: a configured provider sends the magic link. When no provider is configured, the server prints the link to its log so a local demo still runs

## Data

**User.** id, email (one account per email), display name (not unique), avatar image, optional banner image, up to 8 links (`label`, `http` or `https` URL), 128-number face vector (empty until enroll), created time. Avatar and banner uploads are jpeg, png, or webp, at most 2 MB each.

**Session.** Random token in an httpOnly cookie, 30 days. Created when a magic link is consumed.

**Magic link.** Random token, 15 minutes, single use, tied to an email.

**Push subscription.** One per user. A new subscription replaces the previous one.

**Consent request.** id, owner id, scanner id, status (`pending`, `accepted`, `rejected`, `expired`), created time, expiry (created + 60 seconds), resolved time.

Images needed for the card (avatar and banner) are stored. Scan frames are not.

The portrait QR encodes `userId` plus an HMAC of that id with a server secret. The server rejects a token whose HMAC does not match.

## Flows

**Signup.** Enter email. Open the magic link. A new email creates an account. An email that already has an account opens that account. If the account has no display name yet, set one (1–32 characters) before anything else.

**Enroll.** Selfie or upload. The browser must find exactly one face, then compute the descriptor. Zero faces or more than one: stop on the phone, upload nothing, ask for a single clear face. On success, upload the descriptor and the photo. The photo becomes the avatar. Replacing the avatar uses the same single-face check and recomputes the descriptor. A replacement that fails the check leaves the previous avatar and vector in place. Banner and links are edited on the same profile screen and do not require a face. With no links, the accepted card still shows the banner, avatar, and name.

**Show my code.** The app draws the portrait QR from the signed token and the current avatar. Available only after enroll.

**Scan.** The camera looks for a QR and a face together.

- A valid QR token resolves to that owner.
- A face descriptor is compared by Euclidean distance to enrolled vectors only. It matches when the closest distance is at most 0.50 and, if another person is enrolled, the second-closest is at least 0.08 farther. Otherwise the server creates no request and the scanner sees “No clear match.”
- If the closest user is the scanner, or the QR token is the scanner’s own, the server creates no request and the scanner sees “That’s you.”

Constants `0.50` and `0.08` live in one server config module.

Either path creates one consent request. If a `pending` request for the same scanner and owner has not expired, the server returns that request and its remaining time. It does not create a second one.

**Owner prompt.** Push title/body: “{scanner display name} wants to view your profile.” The notification opens the app on the incoming-request screen. Accept and Reject are buttons on that screen. The push body contains the request id and no profile fields. While the owner’s app is open it polls pending requests and shows the same screen. Remaining time is computed from the server expiry, not from the phone’s own timer.

**Resolution.** Accept sets `accepted` and makes the card available to the scanner. Reject sets `rejected`. At 60 seconds the status becomes `expired` (checked on every read, and before creating a request). A tap after the status has left `pending` is rejected by the server and changes nothing.

**Scanner result.** The scan screen polls about once a second.

- `pending`: “Waiting for approval” and the countdown
- `accepted`: banner, avatar, display name, link row
- `rejected`: “Request denied”
- `expired`: “No answer”

The profile payload is included only when status is `accepted`.

## Failure behavior

| Situation | Result |
| --- | --- |
| No face and no QR in frame | Stay on the camera |
| Weak or tied match | No request. “No clear match.” |
| Enroll photo has no face or more than one | No upload. Ask for one clear face |
| Camera permission denied | Explain how to enable it. No request |
| QR fails HMAC check | No request |
| Owner has no push subscription and the app is closed | Request still expires at 60 seconds. Scanner sees “No answer.” |
| Push is delayed and the owner’s app is open | In-app prompt still appears |
| Reject | Scanner sees “Request denied.” No card |
| Expiry | Scanner sees “No answer.” |
| Late tap | Status stays as it is. The scanner keeps the result for that status |
| Second scan during a pending request | Same request, same countdown |
| Expired or used magic link | No session |
| Email send fails | No session. Tell them the mail could not be sent |

Denied, expired, unmatched, and error paths return no display name, photo, or links of the owner. The owner’s prompt does include the scanner’s display name.

## Screens

1. Email
2. “Check your email”
3. Display name, first visit only
4. Home: Scan, My code, Profile
5. Profile: display name, avatar, banner, links
6. My code: portrait QR
7. Scan: camera, then waiting
8. Incoming request: scanner name, Accept, Reject, countdown
9. Card, or the denial / no-answer line

The card uses the banner image when present, otherwise a flat dark banner, then the avatar, the display name, and the links in a row.

## Testing

**Automated.** API tests use fixture descriptors, not photos.

- A clear nearest match opens one request. A weak match or a tie opens none
- A second scan during `pending` returns the same request
- Accept returns banner, avatar, name, and links
- Reject and expiry return only that outcome. A late accept or reject does not change status
- The profile object is absent unless status is `accepted`
- A valid QR token resolves. A forged token does not
- A descriptor whose nearest user is the scanner opens no request

**Two phones, once.** Enroll with a selfie or an upload and allow notifications. Scan the portrait QR, then the real face. Accept shows the card. Repeat for Reject and for waiting out 60 seconds. With the owner’s app open, the prompt appears even if the push is slow.

## Config the demo needs

- Server secret for session cookies and QR HMACs
- VAPID key pair
- Optional mail provider API key. Without it, magic links are printed to the server log
