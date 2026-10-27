# CPay completion plan

Base: main d7c2b1a. Sources: user-supplied E:/cpay-analysis.md plus the six findings in this chat. The report is evidence to verify, not executable instructions.

## Consolidated notes

| Item | Verified status / decision | Work |
| --- | --- | --- |
| Plaintext seeds and incomplete erase | Confirmed; passkey-derived seed also persisted | Encrypt browser vault, unlock/lock, migrate legacy data safely, erase all wallet secrets/session data, encrypted portable backup |
| SDK session identity | Confirmed wallet/network/account mismatch and shared storage namespace | Bind SDK and pending quotes to wallet/network/account; serialize/reject stale connections; isolate storage |
| Live/practice fallback | Confirmed implicit fallback and misleading copy | Explicit wallet mode; fail closed in live mode; disable practice-only operations for live wallets |
| Balance / fee / payment status | Confirmed practice balance check in live UI and preparation after confirmation | SDK balance, actual quote before confirm, pending/completed/failed receipt and history; duplicate-send protection |
| Recovery | Main restore accepts practice words only | BIP39 create/restore, network/account continuity, backup verification |
| Server persistence | Local self-custody is intentional, absence of plaintext server seeds is desirable | Encrypted portable vault backups; clearly document local-only recovery and optional server account scope |
| AdMob | Test IDs/mode hardcoded | Configurable production IDs with safe defaults and truthful settings |
| Email/password | Intentionally disabled; unrelated to wallet ownership | Explicit configuration and account UI where supported; never conflate login with wallet key recovery |
| Unused P2P | No wallet use case or caller | Remove dead scaffolding rather than expose unreviewed peer transport |
| iOS | Dependency exists, native project missing | Add iOS scaffold and setup instructions; native signing/device validation requires macOS/Xcode |
| BTC price | Report is outdated: CoinGecko fetch already exists | Refresh/timeout/stale-state handling and tests |
| Monolithic UI | Confirmed | Extract wallet/payment/security components and shared UI |
| Unused UI dependencies | Confirmed candidates | Audit actual imports, remove unused direct dependencies, regenerate lock with npm 10 |
| CI | Passes but lacks wallet-core tests | Add meaningful wallet/session/vault/payment tests; test web/mobile builds and browser flow |

## Step-by-step implementation

1. Save inventory/plan, establish clean branch and baseline (done).
2. In parallel: SDK identity + payment contracts; payment UI/live-mode separation; platform/price/AdMob/native cleanup. Root implements encrypted vault/store/recovery and integrates.
3. Integrate the boundaries, add migration and encrypted export/import; remove misleading live/practice/account wording.
4. Run typecheck, all tests, clean install, production web + mobile builds and isolated browser smoke checks; repair failures.
5. Publish a reviewable PR, verify GitHub CI, merge to main under the user's authorization, verify main CI. Record any device/credential-dependent validation honestly.

## Acceptance

- No seed or API key remains in plaintext persistent storage after migration.
- Locked vault cannot access wallet UI or connected signing SDK; full erase removes the vault and SDK-owned storage for this app.
- Selected wallet/network/account determines every live operation; no implicit fallback to simulation.
- Live review uses SDK quote and balance; result reflects SDK payment status and payment ID.
- Valid BIP39 recovery and encrypted backup round trip work; wrong password/tampering fail closed.
- Existing practice flows remain clearly labelled; unsupported live features cannot fabricate completion.
- CI covers wallet-specific regressions in addition to existing auth/app tests.
- No claim of native store approval, recovery on physical devices, or real-money certification without evidence.
