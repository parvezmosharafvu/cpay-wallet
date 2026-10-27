# CPay completion and verification

Inputs: six findings from this chat and E:/cpay-analysis.md. Base d7c2b1a; implementation branch feat/wallet-readiness.

## Implemented

- AES-GCM encrypted vault, password setup/unlock/rotation, auto/manual/background/cross-tab lock, safe legacy migration, seed reauthentication, encrypted portable backup and full local erase.
- Strict nested backup validation before replacing data; BIP39 create/restore with network/account metadata and backup verification; practice recovery remains separate.
- Session-bound SDK connections and storage, stale-connect rejection, generic-cache encryption, quote expiry/edit invalidation and duplicate-send protection.
- SDK balance, actual fees before confirmation, live payment IDs/history/pending/completed/failed states; no silent simulation fallback.
- Live/practice separation in UI and store; onboarding/live/shared UI extracted; configurable consent-aware AdMob, stale-aware price refresh, iOS scaffold and aligned Capacitor 8 native projects.
- Removed unused P2P and 37 unused dependencies, patched audited dependencies, cross-platform build/test runners, reproducible deployment install and third-party generator scripts disabled by default.
- CI checks Ubuntu and Windows; Ubuntu also runs isolated Chromium wallet regression flows. Template tests now use isolated brand fixtures; assertions against missing ignored generator prompt documents were retired while executable tests remain.

## Verified locally

Node 22.23.3 and npm 10.9.9, Windows:

| Check | Result |
| --- | --- |
| Clean npm ci | Passed; 444 packages |
| TypeScript | Passed |
| All script and TypeScript tests | 288 passed; 0 failed; 0 skipped |
| Isolated browser flows | 15 passed; no page errors; mobile viewport without overflow |
| Production web build without migration | Passed |
| Mobile web bundle | Passed |
| Android/iOS Capacitor sync | Passed generation/sync; no native binary compilation |
| npm audit | 0 known vulnerabilities at verification time |

Browser scenarios cover vault creation, invalid/valid BIP39, backup verification, wrong passwords, reload lock/unlock, encrypted backup restore on a fresh profile, erase, failed SDK without simulation fallback, actual SDK quote approval, edited quote invalidation, duplicate-click protection, pending/failed receipts and seed reauthentication. These tests use synthetic data/mocked SDK and block external wallet calls; they do not prove settlement.

## Report corrections and intentional choices

A CoinGecko request already existed; its error/refresh/staleness behavior was improved. Client self-custody is intentional: keys are not copied into the auth database. Encrypted backups provide portability. Unused P2P was removed instead of adding an unreviewed transport. Password accounts stay disabled without verified-email and password-reset delivery. Existing exchange/Cash App simulations remain clearly labelled; no live provider contract was invented.

## External release validation

Physical Android/iOS devices, signed binaries, passkey RP/domain association, funded settlement/recovery tests, real Breez/AdMob credentials and consent configuration, store submissions and an independent security audit require those devices/accounts/services. None is claimed from CI. No real-money payment was made.

Security references: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt and https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html. Encryption at rest does not protect an unlocked wallet against hostile same-origin scripts or device compromise.
