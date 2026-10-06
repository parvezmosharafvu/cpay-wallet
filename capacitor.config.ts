import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "technology.cpay.wallet",
  appName: "CPay",
  webDir: "dist-mobile",
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
