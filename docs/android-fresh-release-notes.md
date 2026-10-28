# CPay 1.5 — new install

This release contains the current encrypted wallet vault, password lock, encrypted backup/recovery, explicit practice/live modes and payment quote confirmation fixes.

Install `CPay-1.5.apk`. It appears as **CPay 1.5** beside the old CPay app. It uses a new persistent signing key and package `technology.cpay.wallet.fresh`; it does not replace CPay 1.4 or automatically read its wallet data. Keep the old app until your recovery and balances are verified.

Use your encrypted backup or original recovery phrase with the same network/account to restore a wallet. Native passkeys need separate domain associations for this new package and signing certificate. A vault/seed backup does not include SDK unilateral-exit state; offline unilateral recovery needs the separately exported exit state.

The build checks package, version, current vault code, pinned signature and checksum. An Android emulator verifies installation alongside CPay 1.4 and that the new app opens. This does not verify real-money transactions or recovery on your physical phone.
