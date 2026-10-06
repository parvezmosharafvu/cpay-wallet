import { useEffect, useState } from "react";
import { t } from "@/lib/cpay/i18n";
import { installReady, listenInstall, promptInstall, runningAsApp } from "@/lib/cpay/install";
import { useCpay } from "@/lib/cpay/store";

export function InstallCard({ compact = false }: { compact?: boolean }) {
  const lang = useCpay((s) => s.lang);
  const [ready, setReady] = useState(false);
  const [app, setApp] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setApp(runningAsApp());
    setReady(installReady());
    return listenInstall(() => setReady(installReady()));
  }, []);

  if (app) return null;
  if (done) {
    return (
      <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-primary">{t(lang, "installDone")}</p>
    );
  }

  if (compact && !ready) {
    return <p className="text-center text-sm text-muted">{t(lang, "installHow")}</p>;
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-base font-semibold">{t(lang, "installH")}</h2>
      <p className="mt-1 text-sm text-muted">{t(lang, "installP")}</p>
      {ready ? (
        <button
          type="button"
          onClick={() => {
            void promptInstall().then((ok) => {
              if (ok) setDone(true);
            });
          }}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-primary px-4 text-base font-semibold text-primary-ink"
        >
          {t(lang, "installGo")}
        </button>
      ) : (
        <p className="mt-3 text-sm text-fg">{t(lang, "installHow")}</p>
      )}
    </section>
  );
}
