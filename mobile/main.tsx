import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WalletApp } from "@/components/cpay/wallet-app";
import "@/styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <WalletApp />
    </StrictMode>,
  );
}
