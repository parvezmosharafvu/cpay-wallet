# Platform setup and release checks

CPay owns wallet keys on the device. A server account is not a wallet backup. The application does not upload recovery phrases to an authentication database. Export an encrypted vault backup and separately record the live wallet recovery phrase, network and account number. Clearing application/browser data without either backup loses access.

## Reproducible web and mobile bundles

Use Node 22 and npm 10 (`packageManager` pins npm 10.9.9). Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build:web` and `npm run build:mobile`. The Vite wrapper invokes the JavaScript entrypoint directly, including on Windows, and applies the same public app flags to web and mobile builds. `build:web` does not run database migrations; `npm run build` retains the existing deployment migration step.

`config.env.example` lists supported options. Real process environment values override optional local `.grok/app-env.json` flags. Standalone bundles default to `VITE_AUTH_ENABLED=false`. Configure `VITE_AUTH_ENABLED=true` and the existing server OAuth/database credentials only when server account features are wanted. Wallet vault unlock and passkey/seed recovery remain separate from that login.

Email/password accounts remain intentionally disabled. Adding them requires a complete verified-email, password reset and recovery-email delivery flow. An empty password-login UI would not improve wallet recovery and is not presented as a working feature.

## Android and iOS

The Capacitor CLI, core, Android and iOS packages share version 8.5.3, with AdMob 8.2.1. The Android SDK/Gradle variables and wrapper match the official Capacitor 8 template. The iOS project uses iOS 15 and the Capacitor 8.5 UIScene integration. The migration keeps application IDs, signing configuration and app-specific WebAuthn setup. A scoped `xcode → uuid@11` override removes a dev-tool advisory while preserving the xcode library’s v4 UUID API; automated tests parse the project and exercise native template extraction.

After `npm run build:mobile`, run `npm run native:sync`. Android needs Android Studio, JDK 21+, Android SDK 36 and Android Studio Otter or newer, a real signing keystore and physical-device testing before release. Android OS backup is disabled for wallet application data. Never commit signing files.

The `ios/` Xcode project is scaffolded with the same application ID `technology.cpay.wallet`. On macOS install the required Xcode 26+/CocoaPods tools, run `npm ci`, `npm run build:mobile`, `npx cap sync ios`, then open `ios/App/App.xcworkspace`. Select the real Apple development team and test secure storage, background locking, WebAuthn/passkey support, recovery, QR and network failures on an iPhone. Creating this project on Windows does not verify an iOS binary or App Store eligibility.

Native passkeys require the platform's associated-domain/RP configuration on the production HTTPS domain; a local WebView origin is not interchangeable with a hosted passkey origin. Seed-based recovery remains available when the platform cannot supply a compatible PRF passkey.

## AdMob

The default build uses Google's test banner IDs. Production requests require both `VITE_ADMOB_PRODUCTION=true` and a real banner unit, supplied by `VITE_ADMOB_BANNER_UNIT_ID` or the saved banner setting. Missing or test production IDs disable banners. `requestConsentInfo()` and, when required and available, Google's consent form run before a banner request; unknown/required consent blocks ads. Hiding/locking the wallet removes native banners.

The **app** ID is native configuration and cannot be changed by saving a browser setting. Before production replace Android `android/app/src/main/res/values/strings.xml`'s `admob_app_id` and iOS `ios/App/App/Info.plist`'s `GADApplicationIdentifier` with the matching real platform app IDs. Configure the consent/privacy messages in AdMob and complete platform privacy declarations before opting into production. No real ad revenue, consent form approval or store publishing is claimed by local bundle tests.

## Market price and removed scaffolding

The supplied analysis report's “no real price feed” entry was outdated: a CoinGecko request already existed. It now has timeout/cancellation, periodic/foreground refresh and stale-state handling. A USD display quote is not an exchange execution price.

Unused WebRTC/P2P scaffolding had no wallet caller and was removed. No unreviewed peer-to-peer wallet transport was added. Thirty-seven unused direct UI/chart/form dependencies were removed after import checks; platform packages, SDK, auth and validation dependencies remain.

## Validation still requiring external systems

CI checks all script and TypeScript tests and builds the web/mobile bundles on Ubuntu and Windows. Signed Android/iOS installation, real passkey enrollment/recovery, consent messages, production domain association, funded regtest/mainnet settlement and store submission need the respective devices/accounts/services. They must be recorded separately from build/test success.
