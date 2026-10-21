"use client";

export function LineChart({ series, height = 160 }: { series: { label: string; color: string; points: { x: number; y: number }[] }[]; height?: number }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <p className="muted">Make a few trades and advance time to draw the chart.</p>;
  const W = 600;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y0 === y1) [y0, y1] = [y0 * 0.99, y1 * 1.01 + 1e-12];
  const sx = (x: number) => ((x - x0) / (x1 - x0 || 1)) * (W - 50) + 45;
  const sy = (y: number) => height - 20 - ((y - y0) / (y1 - y0)) * (height - 35);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="chart" role="img" aria-label="price chart">
      <text x={2} y={14} className="axis">{y1.toPrecision(5)}</text>
      <text x={2} y={height - 22} className="axis">{y0.toPrecision(5)}</text>
      {series.map((s) => (
        <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={2} points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} />
      ))}
      {series.map((s, i) => (
        <text key={s.label} x={60 + i * 140} y={height - 4} fill={s.color} className="axis">{s.label}</text>
      ))}
    </svg>
  );
}
