export function appBreezKey() {
  const baked = import.meta.env.VITE_BREEZ_API_KEY;
  return typeof baked === "string" ? baked.trim() : "";
}
