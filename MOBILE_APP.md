# BlockVotes Mobile App

The website is now wired up as a Capacitor mobile app inside [artifacts/blockvotes](E:/Project/Block-Chain/Block-Chain/artifacts/blockvotes).

This setup currently uses an ngrok backend tunnel:

`https://screen-uniformly-scoured.ngrok-free.dev`

## What This Gives You

- A real Android app project in `artifacts/blockvotes/android`
- Capacitor config for iOS so the same web app can be opened in Xcode on a Mac
- Mobile-safe metadata, safe-area padding, and installable web manifest support

## Main Commands

From the repo root:

```powershell
pnpm --filter @workspace/blockvotes run cap:assets
pnpm --filter @workspace/blockvotes run build:mobile
pnpm --filter @workspace/blockvotes run mobile:android
```

If your ngrok URL changes, build the mobile app with the new backend URL:

```powershell
$env:VITE_API_BASE_URL = "https://screen-uniformly-scoured.ngrok-free.dev"
pnpm --filter @workspace/blockvotes run build:mobile
```

At the moment, the frontend default already points to:

`https://screen-uniformly-scoured.ngrok-free.dev`

so you only need the command above when ngrok gives you a different URL.

## Backend Setup

Before opening the mobile app, make sure:

- Your API server is running locally on port `3000`
- Your ngrok tunnel is running and forwarding to `http://localhost:3000`
- The ngrok terminal stays open while you test the app

For the mobile app to talk to the backend, your API CORS config must allow both Capacitor origins:

```env
CORS_ORIGIN=https://blockvotes.vercel.app,http://localhost,capacitor://localhost
PUBLIC_WEB_URL=https://blockvotes.vercel.app
APP_URL=https://blockvotes.vercel.app
SESSION_COOKIE_SAME_SITE=none
SESSION_COOKIE_SECURE=true
```

`http://localhost` is used by the Android Capacitor WebView.

`capacitor://localhost` is used by the iOS Capacitor WebView.

## Android

1. Install Android Studio
2. Run:

```powershell
pnpm --filter @workspace/blockvotes run mobile:android
```

3. Android Studio will open the native project
4. Connect a phone or start an emulator
5. Press Run

## iPhone

The iOS app uses the same Capacitor config, but you need macOS and Xcode to build it.

On a Mac:

```bash
pnpm --filter @workspace/blockvotes run build:mobile
pnpm --filter @workspace/blockvotes run cap:open:ios
```

## Notes

- The app bundles the same Vite frontend you already have
- API requests use `VITE_API_BASE_URL`, and the current default backend is the ngrok URL above
- Native launcher icons and splash screens are generated from `artifacts/blockvotes/resources/icon.png` and `artifacts/blockvotes/resources/splash.png`
- If you change the app branding, rerun `pnpm --filter @workspace/blockvotes run cap:assets`
- If ngrok assigns a new public URL, rebuild the mobile app with the new `VITE_API_BASE_URL` and update `artifacts/api-server/.env` if your frontend origin list also changes
- If you update the web app, rerun `pnpm --filter @workspace/blockvotes run build:mobile` before opening Android Studio or Xcode
