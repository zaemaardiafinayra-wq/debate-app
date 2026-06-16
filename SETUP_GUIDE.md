# OODA Debate — Android Build & Publish Guide

This package contains everything needed to turn the chat-debate app into a
real Android app. The heavy lifting (code) is done. The steps below are
things only YOU can do (accounts, keys, builds, store submission).

---

## What's in this folder

```
debate-app/
├── App.js              ← the React Native app (the chat UI)
├── app.json             ← Expo config (app name, package id, icon paths)
├── package.json
├── vercel.json
└── api/
    └── debate.js         ← backend function that calls Anthropic API
```

The app NEVER contains your Anthropic API key. It calls your backend
(`api/debate.js`), which holds the key as a secret environment variable.

---

## Step 1 — Get an Anthropic API key

1. Go to https://console.anthropic.com
2. Sign up / log in
3. Add billing — minimum prepaid credit is usually $5
4. Go to "API Keys" → Create Key → copy it (starts with `sk-ant-...`)
5. Keep this somewhere safe. Never put it in App.js or commit it to GitHub.

Estimated cost: with Haiku 4.5 (~$1/$5 per million tokens), a 5-round,
2-persona debate costs roughly $0.005–0.01. 1,000 debates ≈ $5–10.

---

## Step 2 — Deploy the backend to Vercel (free)

1. Create a free account at https://vercel.com (sign in with GitHub)
2. Create a new GitHub repo, push this `debate-app` folder to it
   ```bash
   cd debate-app
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/YOUR-USERNAME/debate-app.git
   git push -u origin main
   ```
3. In Vercel: "Add New Project" → import your GitHub repo
4. Before deploying, go to Project Settings → Environment Variables:
   - Name: `ANTHROPIC_API_KEY`
   - Value: (paste your key from Step 1)
5. Deploy. Vercel will give you a URL like:
   `https://debate-app-xyz.vercel.app`
6. Your backend endpoint is:
   `https://debate-app-xyz.vercel.app/api/debate`

Test it (replace the URL):
```bash
curl -X POST https://debate-app-xyz.vercel.app/api/debate \
  -H "Content-Type: application/json" \
  -d '{"system":"You are a pirate","prompt":"Say hi in one sentence"}'
```
You should get back `{"text": "..."}`.

---

## Step 2b — Set up the daily free-limit tracker (Upstash Redis, free)

This enforces the 3 free debates/day limit (~30 messages/day).

1. Go to https://upstash.com and sign up (free tier is enough)
2. Create a new Redis database (pick a region close to your Vercel region)
3. On the database page, copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. In Vercel → your project → Settings → Environment Variables, add both
5. Redeploy the project for the env vars to take effect

If you skip this, the backend has NO daily limit — fine for testing, not
for launch.

---

## Step 3 — Point the app at your backend

Open `app.json`, find:
```json
"extra": {
  "backendUrl": "https://YOUR-BACKEND.vercel.app/api/debate"
}
```
Replace with your real Vercel URL from Step 2.

---

## Step 4 — Run it locally to test (Expo Go)

1. Install Node.js (https://nodejs.org) if you don't have it
2. Install Expo CLI: `npm install -g expo-cli` (or use `npx expo`)
3. In the project folder:
   ```bash
   npm install
   npx expo start
   ```
4. Install "Expo Go" app on your Android phone (Play Store)
5. Scan the QR code shown in the terminal — the app opens on your phone

Test the debate flow end-to-end before building the final app.

---

## Step 5 — Add app icons

Replace these placeholder paths in `app.json` with real images:
- `./assets/icon.png` — 1024x1024px square icon
- `./assets/splash.png` — splash screen image
- `./assets/adaptive-icon.png` — 1024x1024px, used for Android adaptive icon

You can generate these for free at https://icon.kitchen or design your own.
Put them in an `assets/` folder in the project root.

---

## Step 6 — Build the Android app (AAB for Play Store)

1. Create a free Expo account: https://expo.dev/signup
2. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   eas login
   ```
3. Configure the build:
   ```bash
   eas build:configure
   ```
   (choose Android when asked)
4. Build:
   ```bash
   eas build --platform android
   ```
   This runs on Expo's servers (free tier available) and gives you a
   download link for an `.aab` file when done (~15-20 min).

---

## Step 7 — Google Play Console setup

1. Go to https://play.google.com/console
2. Pay the one-time $25 registration fee
3. Create a new app:
   - App name: "OODA Debate" (or your own name)
   - Default language, app/game type, free/paid
4. Fill in required info:
   - **Privacy policy URL** — required even for simple apps. You can
     generate a free one at https://www.privacypolicygenerator.info
     (mention that the app sends user-entered text to Anthropic's API
     for processing)
   - **App content** questionnaire (data safety, target audience, ads — say no to ads)
   - **Store listing**: short description, full description, screenshots
     (take these from Expo Go while testing, or from an emulator)
5. Go to "Production" → "Create new release"
6. Upload the `.aab` file from Step 6
7. Submit for review

Review typically takes a few hours to a few days for new developer accounts.

---

## Costs summary

| Item | Cost |
|---|---|
| Anthropic API | usage-based, ~$5-10 per 1,000 debates (Haiku) |
| Vercel hosting | free tier is sufficient |
| Expo/EAS build | free tier available |
| Google Play Developer account | $25 one-time |

---

## Notes / things to watch

- If many people use the app and you don't add any usage limits, your
  Anthropic bill scales with usage — consider adding a simple rate limit
  in `api/debate.js` (e.g. cap requests per IP per day) before launching
  widely.
- The current persona response is capped at ~15 words / 60 tokens to keep
  costs low and the chat feel snappy.
- If you want to switch models later, change `model: "claude-haiku-4-5-20251001"`
  in `api/debate.js` to `claude-sonnet-4-6` for higher quality at ~3x cost.

---

## Freemium status (Stage 1 vs Stage 2)

**Stage 1 (done in this build):**
- Free users get 30 debate messages/day (~3 full debates), tracked by an
  anonymous device ID via Upstash Redis
- When the limit hits, a paywall screen appears with a "Subscribe" button
- The Subscribe button is currently a PLACEHOLDER — tapping it does nothing yet

**Stage 2 (not yet built — let me know when you're ready):**
- Real Google Play Billing subscription purchase flow in the app
- Backend verification of the purchase receipt via Google Play Developer API
  (requires a Google Cloud service account + linking your Play Console)
- Once verified, `isSubscribed` is set to true and the daily limit is skipped

Stage 2 requires the app to already be uploaded to Play Console (at least
as an internal test track) since subscription products are created there.
When you've gotten through Steps 6-7 and have a draft listing, come back
and we'll wire up real payments.

