import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path d="M16.4 6.2 10 16.2h4.6l-1.5 9.6 8.4-11.6h-4.8l-0.3-8Z" className="fill-primary-ink" />
    </svg>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  tone = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-primary text-primary-ink"
      : tone === "danger"
        ? "bg-danger text-fg"
        : "border border-line bg-surface text-fg";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 w-full items-center justify-center rounded-2xl px-4 text-base font-semibold disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "text" | "decimal" | "numeric";
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode ?? "text"}
        className={`h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-fg outline-none placeholder:text-muted focus:border-primary ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center px-4">
      <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-fg">{msg}</p>
    </div>
  );
}

export function Frame({ children, dock }: { children: ReactNode; dock?: boolean }) {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div
        className={`mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 ${dock ? "dock-pad" : "pb-10"}`}
      >
        {children}
      </div>
    </div>
  );
}

export function BackTitle({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex h-14 items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-surface"
        aria-label="Back"
      >
        <ArrowLeft className="size-5" />
      </button>
      <h1 className="text-lg font-semibold">{title}</h1>
    </header>
  );
}

export async function readQr(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("scan");
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { default: jsQR } = await import("jsqr");
  const code = jsQR(image.data, image.width, image.height);
  bitmap.close();
  if (!code?.data) throw new Error("scan");
  return code.data;
}

export function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <span className="text-sm text-muted">{k}</span>
      <span className="max-w-[60%] break-all text-right font-mono text-sm">{v}</span>
    </div>
  );
}

export function Qr({ value }: { value: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import("qrcode")
      .then((mod) => {
        const qr = mod.default;
        return qr.toDataURL(value, {
          margin: 1,
          width: 280,
          color: { dark: "#07110C", light: "#F4F4F5" },
        });
      })
      .then((next) => {
        if (live) setUrl(next);
      })
      .catch(() => {
        if (live) setUrl(null);
      });
    return () => {
      live = false;
    };
  }, [value]);
  if (!url) return <div className="h-52 w-52 rounded-2xl bg-fg" />;
  return <img src={url} alt="Payment request QR code" className="h-52 w-52 rounded-2xl" />;
}
