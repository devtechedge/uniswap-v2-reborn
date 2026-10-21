import { Simulator } from "../components/Simulator";
import { MainnetQuote } from "../components/MainnetQuote";
import { Results } from "../components/Results";
import { ThemeToggle } from "../components/ThemeToggle";

export default function Page() {
  return (
    <main>
      <header>
        <div className="topbar">
          <h1>uniswap-v2-reborn</h1>
          <ThemeToggle />
        </div>
        <p>The Uniswap v2 constant-product AMM, recovered from Ethereum mainnet bytecode with REA and rebuilt clean-room in TypeScript and Solidity. Everything below runs the TypeScript reference model in your browser; the differential suite proves it matches the original contracts op for op.</p>
        <p className="muted">Educational demo. Demo tokens only, no wallet, no real funds. <a href="https://github.com/devtechedge/uniswap-v2-reborn">Source on GitHub</a>.</p>
      </header>
      <Results />
      <MainnetQuote />
      <h2>Simulator</h2>
      <Simulator />
    </main>
  );
}
