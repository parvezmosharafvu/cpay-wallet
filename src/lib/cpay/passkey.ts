import type { Seed } from "@breeztech/breez-sdk-spark/web";

function relyingParty(): string {
  if (typeof window === "undefined") return "localhost";
  const host = window.location.hostname.trim();
  return host || "localhost";
}

function wordsFromSeed(seed: Seed): string[] {
  if (seed.type !== "mnemonic") throw new Error("Passkey did not return a seed phrase.");
  const words = seed.mnemonic.trim().split(/\s+/);
  if (words.length < 12) throw new Error("Passkey seed is incomplete.");
  return words;
}

async function client(apiKey: string) {
  const web = await import("@breeztech/breez-sdk-spark/web");
  await web.default();
  const { PasskeyClient } = await import("@breeztech/breez-sdk-spark/passkey-prf-provider");
  return new PasskeyClient(apiKey.trim() || undefined, {
    defaultLabel: "CPay",
    providerOptions: {
      rpId: relyingParty(),
      rpName: "CPay",
      userName: "cpay",
      userDisplayName: "CPay",
    },
  });
}

export async function createPasskey(apiKey: string, label: string): Promise<string[]> {
  const passkey = await client(apiKey);
  const availability = await passkey.checkAvailability();
  if (availability.type === "notAssociated") {
    throw new Error(availability.reason);
  }
  if (availability.type !== "available") {
    throw new Error(availability.type === "prfUnsupported" ? "prf" : availability.type);
  }
  const name = label.trim() || "CPay";
  try {
    const created = await passkey.register({ label: name });
    return wordsFromSeed(created.wallet.seed);
  } catch (error) {
    const { PasskeyAlreadyExistsError } = await import("@breeztech/breez-sdk-spark/passkey-prf-provider");
    if (error instanceof PasskeyAlreadyExistsError) {
      const signed = await passkey.signIn({ label: name });
      return wordsFromSeed(signed.wallet.seed);
    }
    throw error;
  }
}

export async function signInPasskey(apiKey: string, label: string): Promise<string[]> {
  const passkey = await client(apiKey);
  const signed = await passkey.signIn({ label: label.trim() || "CPay" });
  return wordsFromSeed(signed.wallet.seed);
}

export function passkeyMessage(error: unknown): "passkeyCancel" | "passkeyMissing" | "passkeyUnsupported" | "passkeyFail" {
  const text = error instanceof Error ? error.message : String(error);
  if (text === "prf" || /prf|not supported|NotSupported/i.test(text)) return "passkeyUnsupported";
  if (/cancel|dismiss|abort/i.test(text)) return "passkeyCancel";
  if (/not found|no credential|Credential/i.test(text)) return "passkeyMissing";
  return "passkeyFail";
}
