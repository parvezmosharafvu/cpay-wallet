# Android APK build and publication

Merging source does not rebuild existing GitHub release assets. Run the **Android APK** workflow to produce an actual native APK from the selected commit. The workflow builds mobile assets, syncs Capacitor, compiles with JDK 21 / SDK 36, checks package/version, inspects bundled vault code and uploads the APK plus checksum/provenance metadata.

Without signing secrets the result is **CPay-1.5-unsigned.apk**: a build artifact only, not installable and never published as a stable release. Do not rename an unsigned file to CPay.apk or ask users to uninstall their existing wallet.

For a compatible signed update, configure these repository Actions secrets from the ORIGINAL CPay release keystore:

- ANDROID_KEYSTORE_BASE64: base64-encoded original keystore bytes.
- ANDROID_STORE_PASSWORD: original keystore password.
- ANDROID_KEY_ALIAS: original signing alias.
- ANDROID_KEY_PASSWORD: original private-key password.
- VITE_BREEZ_API_KEY: optional public mobile build key; users may instead configure a key in Settings.

Secret values must never be committed or placed in issue/comment/chat text. Retain an offline backup of the original keystore and credentials. Creating a new key cannot update the already-installed application.

Expected signer SHA-256, verified against the public CPay 1.4 APK:

79BB30EFCD41E2035FD09E3E84E3B21A1DBCD63A3B4DC08C2541CD15F223AE3C

After secrets are configured, dispatch Android APK on main with publish=false to verify the signed artifact first. Dispatch with publish=true only when the matching-signer build is ready to release. Publishing is main-only, starts as a draft, checks the APK checksum/provenance, uploads CPay.apk and metadata, then marks v1.5.0-android latest. An existing release is never overwritten automatically.
