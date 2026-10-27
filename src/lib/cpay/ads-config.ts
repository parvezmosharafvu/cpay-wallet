const TEST_BANNERS = {
  android: "ca-app-pub-3940256099942544/6300978111",
  ios: "ca-app-pub-3940256099942544/2934735716",
};

export function resolveAdsConfig(input: { production: boolean; unitId?: string; platform: string }) {
  if (input.platform !== "android" && input.platform !== "ios") return null;
  if (!input.production) return { adId: TEST_BANNERS[input.platform], isTesting: true };
  const adId = input.unitId?.trim() ?? "";
  if (!/^ca-app-pub-\d{16}\/\d{10}$/.test(adId) || adId.startsWith("ca-app-pub-3940256099942544/")) return null;
  return { adId, isTesting: false };
}

export function consentAllowsAds(status: string, canRequestAds: boolean): boolean {
  return canRequestAds && (status === "OBTAINED" || status === "NOT_REQUIRED");
}
