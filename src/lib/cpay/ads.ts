import { consentAllowsAds, resolveAdsConfig } from "./ads-config";

let requestNumber = 0;
let initialized = false;

/** App IDs are native build configuration; only the banner unit is runtime-configurable. */
export async function startAds(show: boolean, unitId = "") {
  const request = ++requestNumber;
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const { AdMob, BannerAdPosition, BannerAdSize } = await import("@capacitor-community/admob");
  const config = resolveAdsConfig({
    production: import.meta.env.VITE_ADMOB_PRODUCTION === "true",
    platform: Capacitor.getPlatform(),
    unitId: unitId || import.meta.env.VITE_ADMOB_BANNER_UNIT_ID,
  });
  if (!show || !config) {
    await AdMob.removeBanner().catch(() => undefined);
    return;
  }
  if (!initialized) {
    await AdMob.initialize({ initializeForTesting: config.isTesting });
    initialized = true;
  }
  let consent = await AdMob.requestConsentInfo();
  if (consent.status === "REQUIRED" && consent.isConsentFormAvailable) consent = await AdMob.showConsentForm();
  if (request !== requestNumber || !consentAllowsAds(consent.status, consent.canRequestAds)) return;
  await AdMob.showBanner({
    adId: config.adId,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 72,
    isTesting: config.isTesting,
  });
  if (request !== requestNumber) await AdMob.removeBanner().catch(() => undefined);
}

/** A persistent Settings entry lets users revisit the native UMP privacy choices. */
export async function showAdPrivacyOptions() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const { AdMob } = await import("@capacitor-community/admob");
  await AdMob.showPrivacyOptionsForm();
}
