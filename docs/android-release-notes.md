# CPay 1.5 Android release

This release packages the encrypted vault, backup/restore and auto-lock, live/practice separation, session-bound SDK connections, actual fee approval, recovery validation and the follow-up review fixes. Version name 1.5; Android version code 6; package technology.cpay.wallet.

The publication workflow requires the same signing certificate as CPay 1.4. It refuses unsigned or mismatched-signer APKs. Back up recovery words and the original network/account before updating. Never uninstall a wallet to work around a signature error.

Initial launch encrypts legacy local data with a new vault password. Keep a separate encrypted backup. Regtest is the default for new live wallets; mainnet requires a Breez API key in Settings or the public build configuration. No funded mainnet settlement, physical-device passkey behavior, store submission or native security certification is claimed by automated build tests.
