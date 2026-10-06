type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPrompt | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPrompt;
    window.dispatchEvent(new Event("cpay-install"));
  });
}

export function installReady() {
  return deferred !== null;
}

export function runningAsApp() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export async function promptInstall() {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  window.dispatchEvent(new Event("cpay-install"));
  return choice.outcome === "accepted";
}

export function listenInstall(onChange: () => void) {
  window.addEventListener("cpay-install", onChange);
  return () => window.removeEventListener("cpay-install", onChange);
}
