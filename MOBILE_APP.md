# BlockVotes Mobile App

The website is now wired up as a Capacitor mobile app inside [artifacts/blockvotes](E:/Project/Block-Chain/Block-Chain/artifacts/blockvotes).

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

If you want to point the mobile app at your hosted API, build with:

```powershell
$env:VITE_API_BASE_URL = "https://your-render-api.onrender.com"
pnpm --filter @workspace/blockvotes run build:mobile
```

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
- API requests still use `VITE_API_BASE_URL`, so production mobile builds should point to your hosted backend
- Native launcher icons and splash screens are generated from `artifacts/blockvotes/resources/icon.png` and `artifacts/blockvotes/resources/splash.png`
- If you change the app branding, rerun `pnpm --filter @workspace/blockvotes run cap:assets`
- If you update the web app, rerun `pnpm --filter @workspace/blockvotes run build:mobile` before opening Android Studio or Xcode
