import "./globals.css";
import "./scrollbars.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "v2 reborn: constant-product AMM rebuilt from mainnet bytecode",
  description: "Clean-room rebuild of the Uniswap v2 AMM from mainnet bytecode, proven equal by differential tests. Simulator and live mainnet quote check.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

export const viewport = { themeColor: "#0b0e13" };

// Runs before first paint so the stored theme applies without a flash.
const boot = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t="dark";document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?"#e3e8ee":"#0b0e13")}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
