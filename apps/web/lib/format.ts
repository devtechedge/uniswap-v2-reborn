import { formatUnits, parseUnits } from "viem";

export const fmt = (v: bigint, decimals = 18, digits = 6): string => {
  const s = formatUnits(v, decimals);
  const [i, f = ""] = s.split(".");
  const trimmed = f.slice(0, digits).replace(/0+$/, "");
  return `${Number(i).toLocaleString("en-US")}${trimmed ? "." + trimmed : ""}`;
};

export const parse = (s: string, decimals = 18): bigint | null => {
  try {
    if (!s.trim()) return null;
    return parseUnits(s.trim(), decimals);
  } catch {
    return null;
  }
};
