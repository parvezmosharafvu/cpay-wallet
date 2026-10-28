import type { CapacitorConfig } from "@capacitor/cli";

const freshInstall = process.env.CPAY_FRESH_INSTALL === "true";
const config: CapacitorConfig = {
  appId: freshInstall ? "technology.cpay.wallet.fresh" : "technology.cpay.wallet",
  appName: freshInstall ? "CPay 1.5" : "CPay",
  webDir: "dist-mobile",
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
