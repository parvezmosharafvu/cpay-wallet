const TEST_BANNER = "ca-app-pub-3940256099942544/6300978111";

export async function startAds(show: boolean) {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const { AdMob, BannerAdPosition, BannerAdSize } = await import("@capacitor-community/admob");
  if (!show) {
    await AdMob.hideBanner().catch(() => undefined);
    return;
  }
  await AdMob.initialize({ initializeForTesting: true });
  await AdMob.showBanner({
    adId: TEST_BANNER,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 72,
    isTesting: true,
  });
}
