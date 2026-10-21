import { getAddress, type Address, type Hex } from "viem";
import { Revert, require } from "./errors.js";
import { MAX_UINT256, MAX_UINT112, MAX_UINT32, MINIMUM_LIQUIDITY, add, div, min, mul, sqrt, sub, uqdiv, wrap256 } from "./math.js";
import { ZERO_ADDRESS, pairFor, sortTokens } from "./address.js";
import { getAmountIn, getAmountOut, quote } from "./library.js";

export type EventArg = bigint | Address;
export interface ModelEvent {
  address: Address;
  name: string;
  args: EventArg[];
}

export interface TokenState {
  kind: "erc20" | "weth";
  balances: Map<Address, bigint>;
  allowances: Map<string, bigint>;
  totalSupply: bigint;
}

export interface PairState {
  address: Address;
  token0: Address;
  token1: Address;
  reserve0: bigint;
  reserve1: bigint;
  blockTimestampLast: bigint;
  price0CumulativeLast: bigint;
  price1CumulativeLast: bigint;
  kLast: bigint;
  totalSupply: bigint;
  balances: Map<Address, bigint>;
  allowances: Map<string, bigint>;
  unlocked: boolean;
}

export interface WorldConfig {
  factory: Address;
  router: Address;
  weth: Address;
  initCodeHash: Hex;
  feeToSetter: Address;
}

/** What a flash-swap receiver does inside uniswapV2Call. */
export interface FlashAction {
  /** Token to pay back and how much (sent from the receiver to the pair). */
  repayToken: Address;
  repayAmount: bigint;
  /** If true the receiver tries to re-enter the pair via sync(), which must hit LOCKED. */
  reenter?: boolean;
}

const k2 = (a: Address, b: Address) => `${a}|${b}`;
const A = (a: string) => getAddress(a);

/**
 * Whole-system model: ERC-20 test tokens, WETH9, factory, pairs and Router02.
 * Every external entry point is atomic: on Revert the state is rolled back.
 */
export class World {
  readonly cfg: WorldConfig;
  timestamp = 1_700_000_000n;
  eth = new Map<Address, bigint>();
  tokens = new Map<Address, TokenState>();
  pairs = new Map<Address, PairState>();
  feeTo: Address = ZERO_ADDRESS;
  feeToSetter: Address;
  getPairMap = new Map<string, Address>();
  allPairs: Address[] = [];
  events: ModelEvent[] = [];

  constructor(cfg: WorldConfig) {
    this.cfg = { ...cfg, factory: A(cfg.factory), router: A(cfg.router), weth: A(cfg.weth), feeToSetter: A(cfg.feeToSetter) };
    this.feeToSetter = this.cfg.feeToSetter;
    this.tokens.set(this.cfg.weth, { kind: "weth", balances: new Map(), allowances: new Map(), totalSupply: 0n });
  }

  // ---------- snapshots ----------
  private snapshot() {
    return structuredClone({
      eth: this.eth, tokens: this.tokens, pairs: this.pairs, feeTo: this.feeTo, feeToSetter: this.feeToSetter,
      getPairMap: this.getPairMap, allPairs: this.allPairs, events: this.events,
    });
  }
  private restore(s: ReturnType<World["snapshot"]>) {
    Object.assign(this, s);
  }
  /** Runs `fn` atomically. Returns the value, or rolls back and rethrows the Revert. */
  atomic<T>(fn: () => T): T {
    const snap = this.snapshot();
    try {
      return fn();
    } catch (e) {
      this.restore(snap);
      throw e;
    }
  }
  /** Low-level call semantics: returns false instead of throwing, state rolled back. */
  private tryCall(fn: () => void): boolean {
    try {
      this.atomic(fn);
      return true;
    } catch (e) {
      if (e instanceof Revert) return false;
      throw e;
    }
  }
  /** Executes a top-level transaction and returns its events, or the revert reason. */
  tx<T>(fn: () => T): { ok: true; value: T; events: ModelEvent[] } | { ok: false; reason: string } {
    const before = this.events.length;
    try {
      const value = this.atomic(fn);
      return { ok: true, value, events: this.events.slice(before) };
    } catch (e) {
      if (e instanceof Revert) return { ok: false, reason: e.reason };
      throw e;
    }
  }
  private emit(address: Address, name: string, ...args: EventArg[]) {
    this.events.push({ address, name, args });
  }

  // ---------- ETH ----------
  ethBalance(a: Address) {
    return this.eth.get(A(a)) ?? 0n;
  }
  private moveEth(from: Address, to: Address, v: bigint) {
    const fb = this.ethBalance(from);
    require(fb >= v, "");
    this.eth.set(A(from), fb - v);
    this.eth.set(A(to), this.ethBalance(to) + v);
  }
  dealEth(a: Address, v: bigint) {
    this.eth.set(A(a), this.ethBalance(a) + v);
  }

  // ---------- tokens ----------
  addToken(address: Address) {
    this.tokens.set(A(address), { kind: "erc20", balances: new Map(), allowances: new Map(), totalSupply: 0n });
  }
  private tok(t: Address): TokenState {
    const s = this.tokens.get(A(t));
    require(s !== undefined, "");
    return s;
  }
  balanceOf(token: Address, who: Address): bigint {
    const p = this.pairs.get(A(token));
    if (p) return p.balances.get(A(who)) ?? 0n;
    return this.tok(token).balances.get(A(who)) ?? 0n;
  }
  /** Test-token mint (MockToken.mint), emits Transfer from zero. */
  mintToken(token: Address, to: Address, v: bigint) {
    const s = this.tok(token);
    s.totalSupply += v;
    s.balances.set(A(to), (s.balances.get(A(to)) ?? 0n) + v);
    this.emit(A(token), "Transfer", ZERO_ADDRESS, A(to), v);
  }
  tokenApprove(token: Address, owner: Address, spender: Address, v: bigint) {
    const p = this.pairs.get(A(token));
    const allowances = p ? p.allowances : this.tok(token).allowances;
    allowances.set(k2(A(owner), A(spender)), v);
    this.emit(A(token), "Approval", A(owner), A(spender), v);
  }
  /** transfer called by `sender` on a test token or WETH9. */
  tokenTransfer(token: Address, sender: Address, to: Address, v: bigint) {
    const s = this.tok(token);
    if (s.kind === "weth") return this.wethTransferFrom(sender, sender, to, v);
    const fb = s.balances.get(A(sender)) ?? 0n;
    require(fb >= v, "MockToken: BALANCE");
    s.balances.set(A(sender), fb - v);
    s.balances.set(A(to), (s.balances.get(A(to)) ?? 0n) + v);
    this.emit(A(token), "Transfer", A(sender), A(to), v);
  }
  tokenTransferFrom(token: Address, spender: Address, from: Address, to: Address, v: bigint) {
    const s = this.tok(token);
    if (s.kind === "weth") return this.wethTransferFrom(spender, from, to, v);
    const key = k2(A(from), A(spender));
    const al = s.allowances.get(key) ?? 0n;
    if (al !== MAX_UINT256) {
      require(al >= v, "MockToken: ALLOWANCE");
      s.allowances.set(key, al - v);
    }
    const fb = s.balances.get(A(from)) ?? 0n;
    require(fb >= v, "MockToken: BALANCE");
    s.balances.set(A(from), fb - v);
    s.balances.set(A(to), (s.balances.get(A(to)) ?? 0n) + v);
    this.emit(A(token), "Transfer", A(from), A(to), v);
  }
  // WETH9 semantics
  private wethTransferFrom(sender: Address, src: Address, dst: Address, wad: bigint) {
    const s = this.tok(this.cfg.weth);
    const sb = s.balances.get(A(src)) ?? 0n;
    require(sb >= wad, "");
    if (A(src) !== A(sender)) {
      const key = k2(A(src), A(sender));
      const al = s.allowances.get(key) ?? 0n;
      if (al !== MAX_UINT256) {
        require(al >= wad, "");
        s.allowances.set(key, al - wad);
      }
    }
    s.balances.set(A(src), sb - wad);
    s.balances.set(A(dst), (s.balances.get(A(dst)) ?? 0n) + wad);
    this.emit(this.cfg.weth, "Transfer", A(src), A(dst), wad);
  }
  wethDeposit(sender: Address, value: bigint) {
    const s = this.tok(this.cfg.weth);
    this.moveEth(sender, this.cfg.weth, value);
    s.balances.set(A(sender), (s.balances.get(A(sender)) ?? 0n) + value);
    this.emit(this.cfg.weth, "Deposit", A(sender), value);
  }
  wethWithdraw(sender: Address, wad: bigint) {
    const s = this.tok(this.cfg.weth);
    const b = s.balances.get(A(sender)) ?? 0n;
    require(b >= wad, "");
    s.balances.set(A(sender), b - wad);
    this.moveEth(this.cfg.weth, sender, wad);
    this.emit(this.cfg.weth, "Withdrawal", A(sender), wad);
  }

  // ---------- factory ----------
  setFeeTo(sender: Address, to: Address) {
    require(A(sender) === this.feeToSetter, "UniswapV2: FORBIDDEN");
    this.feeTo = A(to);
  }
  setFeeToSetter(sender: Address, to: Address) {
    require(A(sender) === this.feeToSetter, "UniswapV2: FORBIDDEN");
    this.feeToSetter = A(to);
  }
  getPair(a: Address, b: Address): Address {
    return this.getPairMap.get(k2(A(a), A(b))) ?? ZERO_ADDRESS;
  }
  createPair(a: Address, b: Address): Address {
    const [t0, t1] = sortTokens(A(a), A(b), "UniswapV2: ");
    require(this.getPair(t0, t1) === ZERO_ADDRESS, "UniswapV2: PAIR_EXISTS");
    const address = pairFor(this.cfg.factory, t0, t1, this.cfg.initCodeHash);
    this.pairs.set(address, {
      address, token0: t0, token1: t1, reserve0: 0n, reserve1: 0n, blockTimestampLast: 0n,
      price0CumulativeLast: 0n, price1CumulativeLast: 0n, kLast: 0n, totalSupply: 0n,
      balances: new Map(), allowances: new Map(), unlocked: true,
    });
    this.getPairMap.set(k2(t0, t1), address);
    this.getPairMap.set(k2(t1, t0), address);
    this.allPairs.push(address);
    this.emit(this.cfg.factory, "PairCreated", t0, t1, address, BigInt(this.allPairs.length));
    return address;
  }

  // ---------- pair ----------
  pair(address: Address): PairState {
    const p = this.pairs.get(A(address));
    require(p !== undefined, "");
    return p;
  }
  private lock<T>(p: PairState, fn: () => T): T {
    require(p.unlocked, "UniswapV2: LOCKED");
    p.unlocked = false;
    try {
      return fn();
    } finally {
      p.unlocked = true;
    }
  }
  private lpMint(p: PairState, to: Address, v: bigint) {
    p.totalSupply = add(p.totalSupply, v);
    p.balances.set(A(to), add(p.balances.get(A(to)) ?? 0n, v));
    this.emit(p.address, "Transfer", ZERO_ADDRESS, A(to), v);
  }
  private lpBurn(p: PairState, from: Address, v: bigint) {
    p.balances.set(A(from), sub(p.balances.get(A(from)) ?? 0n, v));
    p.totalSupply = sub(p.totalSupply, v);
    this.emit(p.address, "Transfer", A(from), ZERO_ADDRESS, v);
  }
  lpTransfer(pairAddr: Address, sender: Address, to: Address, v: bigint) {
    const p = this.pair(pairAddr);
    p.balances.set(A(sender), sub(p.balances.get(A(sender)) ?? 0n, v));
    p.balances.set(A(to), add(p.balances.get(A(to)) ?? 0n, v));
    this.emit(p.address, "Transfer", A(sender), A(to), v);
  }
  lpTransferFrom(pairAddr: Address, spender: Address, from: Address, to: Address, v: bigint) {
    const p = this.pair(pairAddr);
    const key = k2(A(from), A(spender));
    const al = p.allowances.get(key) ?? 0n;
    if (al !== MAX_UINT256) p.allowances.set(key, sub(al, v));
    this.lpTransfer(pairAddr, from, to, v);
  }
  private safeTransfer(p: PairState, token: Address, to: Address, v: bigint) {
    require(this.tryCall(() => this.tokenTransfer(token, p.address, to, v)), "UniswapV2: TRANSFER_FAILED");
  }
  private update(p: PairState, balance0: bigint, balance1: bigint, r0: bigint, r1: bigint) {
    require(balance0 <= MAX_UINT112 && balance1 <= MAX_UINT112, "UniswapV2: OVERFLOW");
    const ts = this.timestamp & MAX_UINT32;
    const elapsed = (ts - p.blockTimestampLast) & MAX_UINT32;
    if (elapsed > 0n && r0 !== 0n && r1 !== 0n) {
      p.price0CumulativeLast = wrap256(p.price0CumulativeLast + wrap256(uqdiv(r1, r0) * elapsed));
      p.price1CumulativeLast = wrap256(p.price1CumulativeLast + wrap256(uqdiv(r0, r1) * elapsed));
    }
    p.reserve0 = balance0;
    p.reserve1 = balance1;
    p.blockTimestampLast = ts;
    this.emit(p.address, "Sync", balance0, balance1);
  }
  private mintFee(p: PairState, r0: bigint, r1: bigint): boolean {
    const feeOn = this.feeTo !== ZERO_ADDRESS;
    if (feeOn) {
      if (p.kLast !== 0n) {
        const rootK = sqrt(mul(r0, r1));
        const rootKLast = sqrt(p.kLast);
        if (rootK > rootKLast) {
          const numerator = mul(p.totalSupply, sub(rootK, rootKLast));
          const denominator = add(mul(rootK, 5n), rootKLast);
          const liquidity = numerator / denominator;
          if (liquidity > 0n) this.lpMint(p, this.feeTo, liquidity);
        }
      }
    } else if (p.kLast !== 0n) {
      p.kLast = 0n;
    }
    return feeOn;
  }
  pairMint(sender: Address, pairAddr: Address, to: Address): bigint {
    const p = this.pair(pairAddr);
    return this.lock(p, () => {
      const { reserve0: r0, reserve1: r1 } = p;
      const balance0 = this.balanceOf(p.token0, p.address);
      const balance1 = this.balanceOf(p.token1, p.address);
      const amount0 = sub(balance0, r0);
      const amount1 = sub(balance1, r1);
      const feeOn = this.mintFee(p, r0, r1);
      const ts = p.totalSupply;
      let liquidity: bigint;
      if (ts === 0n) {
        liquidity = sub(sqrt(mul(amount0, amount1)), MINIMUM_LIQUIDITY);
        this.lpMint(p, ZERO_ADDRESS, MINIMUM_LIQUIDITY);
      } else {
        liquidity = min(div(mul(amount0, ts), r0), div(mul(amount1, ts), r1));
      }
      require(liquidity > 0n, "UniswapV2: INSUFFICIENT_LIQUIDITY_MINTED");
      this.lpMint(p, to, liquidity);
      this.update(p, balance0, balance1, r0, r1);
      if (feeOn) p.kLast = mul(p.reserve0, p.reserve1);
      this.emit(p.address, "Mint", A(sender), amount0, amount1);
      return liquidity;
    });
  }
  pairBurn(sender: Address, pairAddr: Address, to: Address): [bigint, bigint] {
    const p = this.pair(pairAddr);
    return this.lock(p, () => {
      const { reserve0: r0, reserve1: r1, token0, token1 } = p;
      let balance0 = this.balanceOf(token0, p.address);
      let balance1 = this.balanceOf(token1, p.address);
      const liquidity = p.balances.get(p.address) ?? 0n;
      const feeOn = this.mintFee(p, r0, r1);
      const ts = p.totalSupply;
      const amount0 = div(mul(liquidity, balance0), ts);
      const amount1 = div(mul(liquidity, balance1), ts);
      require(amount0 > 0n && amount1 > 0n, "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED");
      this.lpBurn(p, p.address, liquidity);
      this.safeTransfer(p, token0, to, amount0);
      this.safeTransfer(p, token1, to, amount1);
      balance0 = this.balanceOf(token0, p.address);
      balance1 = this.balanceOf(token1, p.address);
      this.update(p, balance0, balance1, r0, r1);
      if (feeOn) p.kLast = mul(p.reserve0, p.reserve1);
      this.emit(p.address, "Burn", A(sender), amount0, amount1, A(to));
      return [amount0, amount1];
    });
  }
  pairSwap(sender: Address, pairAddr: Address, amount0Out: bigint, amount1Out: bigint, to: Address, flash?: FlashAction) {
    const p = this.pair(pairAddr);
    this.lock(p, () => {
      require(amount0Out > 0n || amount1Out > 0n, "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT");
      const { reserve0: r0, reserve1: r1, token0, token1 } = p;
      require(amount0Out < r0 && amount1Out < r1, "UniswapV2: INSUFFICIENT_LIQUIDITY");
      require(A(to) !== token0 && A(to) !== token1, "UniswapV2: INVALID_TO");
      if (amount0Out > 0n) this.safeTransfer(p, token0, to, amount0Out);
      if (amount1Out > 0n) this.safeTransfer(p, token1, to, amount1Out);
      if (flash) {
        if (flash.reenter) {
          // re-entry is attempted while the lock is held, so it must fail with LOCKED
          this.pairSync(A(to), p.address);
        }
        if (flash.repayAmount > 0n) this.tokenTransfer(flash.repayToken, to, p.address, flash.repayAmount);
      }
      const balance0 = this.balanceOf(token0, p.address);
      const balance1 = this.balanceOf(token1, p.address);
      const amount0In = balance0 > r0 - amount0Out ? balance0 - (r0 - amount0Out) : 0n;
      const amount1In = balance1 > r1 - amount1Out ? balance1 - (r1 - amount1Out) : 0n;
      require(amount0In > 0n || amount1In > 0n, "UniswapV2: INSUFFICIENT_INPUT_AMOUNT");
      const b0a = sub(mul(balance0, 1000n), mul(amount0In, 3n));
      const b1a = sub(mul(balance1, 1000n), mul(amount1In, 3n));
      require(mul(b0a, b1a) >= mul(mul(r0, r1), 1000n ** 2n), "UniswapV2: K");
      this.update(p, balance0, balance1, r0, r1);
      this.emit(p.address, "Swap", A(sender), amount0In, amount1In, amount0Out, amount1Out, A(to));
    });
  }
  pairSkim(_sender: Address, pairAddr: Address, to: Address) {
    const p = this.pair(pairAddr);
    this.lock(p, () => {
      this.safeTransfer(p, p.token0, to, sub(this.balanceOf(p.token0, p.address), p.reserve0));
      this.safeTransfer(p, p.token1, to, sub(this.balanceOf(p.token1, p.address), p.reserve1));
    });
  }
  pairSync(_sender: Address, pairAddr: Address) {
    const p = this.pair(pairAddr);
    this.lock(p, () => {
      this.update(p, this.balanceOf(p.token0, p.address), this.balanceOf(p.token1, p.address), p.reserve0, p.reserve1);
    });
  }

  // ---------- router ----------
  private ensure(deadline: bigint) {
    require(deadline >= this.timestamp, "UniswapV2Router: EXPIRED");
  }
  private pairAddr(a: Address, b: Address) {
    return pairFor(this.cfg.factory, A(a), A(b), this.cfg.initCodeHash);
  }
  getReserves(a: Address, b: Address): [bigint, bigint] {
    const [t0] = sortTokens(A(a), A(b));
    const p = this.pair(this.pairAddr(a, b));
    return A(a) === t0 ? [p.reserve0, p.reserve1] : [p.reserve1, p.reserve0];
  }
  getAmountsOut(amountIn: bigint, path: Address[]): bigint[] {
    require(path.length >= 2, "UniswapV2Library: INVALID_PATH");
    const amounts = [amountIn];
    for (let i = 0; i < path.length - 1; i++) {
      const [rIn, rOut] = this.getReserves(path[i]!, path[i + 1]!);
      amounts.push(getAmountOut(amounts[i]!, rIn, rOut));
    }
    return amounts;
  }
  getAmountsIn(amountOut: bigint, path: Address[]): bigint[] {
    require(path.length >= 2, "UniswapV2Library: INVALID_PATH");
    const amounts = new Array<bigint>(path.length);
    amounts[path.length - 1] = amountOut;
    for (let i = path.length - 1; i > 0; i--) {
      const [rIn, rOut] = this.getReserves(path[i - 1]!, path[i]!);
      amounts[i - 1] = getAmountIn(amounts[i]!, rIn, rOut);
    }
    return amounts;
  }
  private routerTransferFrom(token: Address, from: Address, to: Address, v: bigint) {
    const R = this.cfg.router;
    const ok = this.tryCall(() => (this.pairs.has(A(token)) ? this.lpTransferFrom(token, R, from, to, v) : this.tokenTransferFrom(token, R, from, to, v)));
    require(ok, "TransferHelper: TRANSFER_FROM_FAILED");
  }
  private routerTransfer(token: Address, to: Address, v: bigint) {
    require(this.tryCall(() => this.tokenTransfer(token, this.cfg.router, to, v)), "TransferHelper: TRANSFER_FAILED");
  }
  private routerSendEth(to: Address, v: bigint) {
    require(this.tryCall(() => this.moveEth(this.cfg.router, to, v)), "TransferHelper: ETH_TRANSFER_FAILED");
  }
  private addLiquidityAmounts(tokenA: Address, tokenB: Address, aDesired: bigint, bDesired: bigint, aMin: bigint, bMin: bigint): [bigint, bigint] {
    if (this.getPair(tokenA, tokenB) === ZERO_ADDRESS) this.createPair(tokenA, tokenB);
    const [rA, rB] = this.getReserves(tokenA, tokenB);
    if (rA === 0n && rB === 0n) return [aDesired, bDesired];
    const bOptimal = quote(aDesired, rA, rB);
    if (bOptimal <= bDesired) {
      require(bOptimal >= bMin, "UniswapV2Router: INSUFFICIENT_B_AMOUNT");
      return [aDesired, bOptimal];
    }
    const aOptimal = quote(bDesired, rB, rA);
    require(aOptimal <= aDesired, "");
    require(aOptimal >= aMin, "UniswapV2Router: INSUFFICIENT_A_AMOUNT");
    return [aOptimal, bDesired];
  }
  addLiquidity(sender: Address, tokenA: Address, tokenB: Address, aDesired: bigint, bDesired: bigint, aMin: bigint, bMin: bigint, to: Address, deadline: bigint) {
    this.ensure(deadline);
    const [amountA, amountB] = this.addLiquidityAmounts(tokenA, tokenB, aDesired, bDesired, aMin, bMin);
    const pair = this.pairAddr(tokenA, tokenB);
    this.routerTransferFrom(tokenA, sender, pair, amountA);
    this.routerTransferFrom(tokenB, sender, pair, amountB);
    const liquidity = this.pairMint(this.cfg.router, pair, to);
    return [amountA, amountB, liquidity] as const;
  }
  addLiquidityETH(sender: Address, value: bigint, token: Address, tDesired: bigint, tMin: bigint, ethMin: bigint, to: Address, deadline: bigint) {
    this.moveEth(sender, this.cfg.router, value);
    this.ensure(deadline);
    const W = this.cfg.weth;
    const [amountToken, amountETH] = this.addLiquidityAmounts(token, W, tDesired, value, tMin, ethMin);
    const pair = this.pairAddr(token, W);
    this.routerTransferFrom(token, sender, pair, amountToken);
    this.wethDeposit(this.cfg.router, amountETH);
    this.tokenTransfer(W, this.cfg.router, pair, amountETH);
    const liquidity = this.pairMint(this.cfg.router, pair, to);
    if (value > amountETH) this.routerSendEth(sender, value - amountETH);
    return [amountToken, amountETH, liquidity] as const;
  }
  removeLiquidity(sender: Address, tokenA: Address, tokenB: Address, liquidity: bigint, aMin: bigint, bMin: bigint, to: Address, deadline: bigint): [bigint, bigint] {
    this.ensure(deadline);
    const pair = this.pairAddr(tokenA, tokenB);
    this.lpTransferFrom(pair, this.cfg.router, sender, pair, liquidity);
    const [amount0, amount1] = this.pairBurn(this.cfg.router, pair, to);
    const [t0] = sortTokens(A(tokenA), A(tokenB));
    const [amountA, amountB] = A(tokenA) === t0 ? [amount0, amount1] : [amount1, amount0];
    require(amountA >= aMin, "UniswapV2Router: INSUFFICIENT_A_AMOUNT");
    require(amountB >= bMin, "UniswapV2Router: INSUFFICIENT_B_AMOUNT");
    return [amountA, amountB];
  }
  removeLiquidityETH(sender: Address, token: Address, liquidity: bigint, tMin: bigint, ethMin: bigint, to: Address, deadline: bigint): [bigint, bigint] {
    // the router passes deadline to removeLiquidity, which runs ensure itself
    this.ensure(deadline);
    const R = this.cfg.router;
    const [amountToken, amountETH] = this.removeLiquidity(sender, token, this.cfg.weth, liquidity, tMin, ethMin, R, deadline);
    this.routerTransfer(token, to, amountToken);
    this.wethWithdraw(R, amountETH);
    this.routerSendEth(to, amountETH);
    return [amountToken, amountETH];
  }
  private swapHops(amounts: bigint[], path: Address[], to: Address) {
    for (let i = 0; i < path.length - 1; i++) {
      const input = A(path[i]!);
      const output = A(path[i + 1]!);
      const [t0] = sortTokens(input, output);
      const out = amounts[i + 1]!;
      const [o0, o1] = input === t0 ? [0n, out] : [out, 0n];
      const dest = i < path.length - 2 ? this.pairAddr(output, path[i + 2]!) : A(to);
      this.pairSwap(this.cfg.router, this.pairAddr(input, output), o0, o1, dest);
    }
  }
  swapExactTokensForTokens(sender: Address, amountIn: bigint, amountOutMin: bigint, path: Address[], to: Address, deadline: bigint) {
    this.ensure(deadline);
    const amounts = this.getAmountsOut(amountIn, path);
    require(amounts[amounts.length - 1]! >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
    this.routerTransferFrom(path[0]!, sender, this.pairAddr(path[0]!, path[1]!), amounts[0]!);
    this.swapHops(amounts, path, to);
    return amounts;
  }
  swapTokensForExactTokens(sender: Address, amountOut: bigint, amountInMax: bigint, path: Address[], to: Address, deadline: bigint) {
    this.ensure(deadline);
    const amounts = this.getAmountsIn(amountOut, path);
    require(amounts[0]! <= amountInMax, "UniswapV2Router: EXCESSIVE_INPUT_AMOUNT");
    this.routerTransferFrom(path[0]!, sender, this.pairAddr(path[0]!, path[1]!), amounts[0]!);
    this.swapHops(amounts, path, to);
    return amounts;
  }
  swapExactETHForTokens(sender: Address, value: bigint, amountOutMin: bigint, path: Address[], to: Address, deadline: bigint) {
    this.moveEth(sender, this.cfg.router, value);
    this.ensure(deadline);
    require(A(path[0]!) === this.cfg.weth, "UniswapV2Router: INVALID_PATH");
    const amounts = this.getAmountsOut(value, path);
    require(amounts[amounts.length - 1]! >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
    this.wethDeposit(this.cfg.router, amounts[0]!);
    this.tokenTransfer(this.cfg.weth, this.cfg.router, this.pairAddr(path[0]!, path[1]!), amounts[0]!);
    this.swapHops(amounts, path, to);
    return amounts;
  }
  swapExactTokensForETH(sender: Address, amountIn: bigint, amountOutMin: bigint, path: Address[], to: Address, deadline: bigint) {
    this.ensure(deadline);
    require(A(path[path.length - 1]!) === this.cfg.weth, "UniswapV2Router: INVALID_PATH");
    const amounts = this.getAmountsOut(amountIn, path);
    const out = amounts[amounts.length - 1]!;
    require(out >= amountOutMin, "UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
    this.routerTransferFrom(path[0]!, sender, this.pairAddr(path[0]!, path[1]!), amounts[0]!);
    this.swapHops(amounts, path, this.cfg.router);
    this.wethWithdraw(this.cfg.router, out);
    this.routerSendEth(to, out);
    return amounts;
  }
}
