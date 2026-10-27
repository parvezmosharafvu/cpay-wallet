import { WalletVault } from "./vault.ts";
let vault: WalletVault | null = null;
let state: "loading" | "new" | "locked" | "unlocked" = "loading";
let error = "";
const listeners = new Set<() => void>();
function emit() {
  for (const listener of listeners) listener();
}
export function browserVault() {
  if (typeof localStorage === "undefined")
    throw new Error("Secure browser storage is unavailable.");
  return (vault ??= new WalletVault(localStorage));
}
export function refreshVaultState() {
  const v = browserVault();
  state = v.isUnlocked() ? "unlocked" : v.exists() ? "locked" : "new";
  emit();
}
export function beginVaultLock() {
  state = "locked";
  emit();
}
export function vaultState() {
  return state;
}
export function vaultServerState() {
  return "loading" as const;
}
export function vaultError() {
  return error;
}
export function setVaultError(value: string) {
  error = value;
  emit();
}
export function subscribeVault(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const encryptedWalletStorage = {
  getItem: async (_name: string) => browserVault().read(),
  setItem: async (_name: string, value: string) => {
    try {
      await browserVault().write(value);
      setVaultError("");
    } catch (e) {
      setVaultError(
        e instanceof Error ? e.message : "Wallet could not be saved. Keep this page open.",
      );
    }
  },
  removeItem: async (_name: string) => {
    browserVault().destroy();
    refreshVaultState();
  },
};
