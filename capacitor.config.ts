import type { CapacitorConfig } from "@capacitor/cli";

const freshInstallValue = process.env.CPAY_FRESH_INSTALL ?? "false";
if (freshInstallValue !== "true" && freshInstallValue !== "false") {
  throw new Error("CPAY_FRESH_INSTALL must be explicitly true or false.");
}
const freshInstall = freshInstallValue === "true";
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
