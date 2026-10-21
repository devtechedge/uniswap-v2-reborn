import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "v2 reborn: constant-product AMM rebuilt from mainnet bytecode",
  description: "Clean-room rebuild of the Uniswap v2 AMM from mainnet bytecode, proven equal by differential tests. Simulator and live mainnet quote check.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
