# CPay

Non-custodial Lightning, Spark, and dollar wallet. One codebase for every device.

## Devices

| Device | How to open |
| --- | --- |
| Android phone | Chrome → menu → Install app. Home-screen icon, full screen. |
| iPhone | Safari → Share → Add to Home Screen. |
| Tablet and desktop | Same site in the browser. Layout fits the screen. |

Play Store and App Store binaries are not in this repo. The installed home-screen app is the build you can use now.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:8080/

```bash
npm run typecheck
npm run build
```

## Wallet

1. Create the practice wallet. Those balances are fake.
2. Settings → save your Breez API key. It stays in the browser only.
3. More → Breez live → New seed. Write the 12 words down. Do not reuse the practice seed.
4. Stay on regtest until a real balance shows. Mainnet moves real bitcoin.

The seed never leaves the device. Do not commit it.
