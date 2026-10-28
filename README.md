# CPay

Self-custody Bitcoin wallet with separate live Breez/Spark and practice wallets, English/Bengali interfaces, PWA, Android and iOS projects.

## Android APK

[Download CPay 1.5](https://github.com/parvezmosharafvu/cpay-wallet/releases/download/v1.5.0-android-fresh/CPay-1.5.apk) or open the [release notes](https://github.com/parvezmosharafvu/cpay-wallet/releases/tag/v1.5.0-android-fresh).

This signed app appears as **CPay 1.5** beside the old CPay app. It uses a separate package and signing key, so it does not replace CPay 1.4 or automatically import its wallet data. Keep the old app until recovery is verified. See [Android build and release instructions](docs/android-release.md).

## Run and verify

Use Node 22 and npm 10.9.9.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build:web
npm run build:mobile
```

Open http://127.0.0.1:8080/. Install Playwright Chromium with `npx playwright install chromium`, then run `npm run test:browser`. Tests use synthetic wallets and mock payments; they never send funds.

## Security and recovery

Create a vault password of at least 12 characters. Legacy local data is encrypted before its plaintext copy is removed. AES-256-GCM and PBKDF2-HMAC-SHA256 (600,000 iterations) protect the stored snapshot. The password is never saved. Auto-lock activates after five minutes inactive or thirty seconds in the background. Another tab changing the vault also locks this tab.

Keep BIP39 recovery words, network and account number offline. Download an encrypted backup in Settings, or copy/paste encrypted backup text in mobile WebViews. Verify recovery in a separate browser/device before erasing data. Vault password, account login and recovery words are different; CPay cannot reset a lost vault password or recover lost keys.

Full erase requires password and backup acknowledgement. It removes local vault, API keys and SDK databases, but does not cancel payments, delete external backups or remove authenticator passkeys. Encryption cannot protect an unlocked app from hostile scripts or a compromised device.

Legacy BIP39 candidates are protected from accidental practice deletion. Confirm the original network/account when restoring an older wallet: the old mixed-mode app did not record ownership metadata consistently. Recovery phrases and vault plaintext are never uploaded to the server.

## Wallet modes

Practice balances, conversions, tokens and Cash App handoffs are simulations and never broadcast. Live wallets use the selected seed/network/account and SDK balance, display an SDK fee quote before approval, and show pending/completed/failed statuses and SDK IDs. Connection failures never switch to simulation.

Regtest is the default and has no monetary value. Mainnet needs a Breez application key through Settings or VITE_BREEZ_API_KEY. Mainnet spends real bitcoin. The primary send interface supports bitcoin rails; token/cross-chain/exit actions remain explicitly advanced SDK tools.

## Platforms and services

See [platform setup](docs/platform-setup.md), [completion inventory](docs/completion-plan.md) and [verification report](docs/verification-report.md). Start from config.env.example. Encrypted backups provide portability without uploading wallet keys. Optional server OAuth is separate from wallet ownership; password accounts remain disabled until verified-email and recovery delivery are implemented. Practice exchange/Cash App flows are not advertised as working live provider integrations.
