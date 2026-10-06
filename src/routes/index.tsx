import { createFileRoute } from "@tanstack/react-router";
import { WalletApp } from "@/components/cpay/wallet-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <WalletApp />;
}
