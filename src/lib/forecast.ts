import type { AnalysisRecord } from "@/lib/storage";

export interface ForecastPoint {
  year: number;
  month: number;
  spend: number;
}

export interface ForecastResult {
  predictions: ForecastPoint[];
  slope: number; // $/month trend (positive = growing)
  r2: number; // R² coefficient 0-1
  dataPoints: number;
}

function linearRegression(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
} {
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function forecast(
  record: AnalysisRecord,
  numMonths = 3
): ForecastResult | null {
  const entries = Object.entries(record.months)
    .filter(([, md]) => md.report.spend > 0)
    .map(([key, md]) => {
      const [y, m] = key.split("-").map(Number);
      return { key, year: y, month: m, spend: md.report.spend };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  if (entries.length < 3) return null;

  const pts = entries.map((e, i) => ({ x: i, y: e.spend }));
  const { slope, intercept } = linearRegression(pts);

  const meanY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const ssTot = pts.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = pts.reduce(
    (s, p) => s + (p.y - (slope * p.x + intercept)) ** 2,
    0
  );
  const r2 = Math.max(0, Math.min(1, ssTot > 0 ? 1 - ssRes / ssTot : 0));

  const last = entries[entries.length - 1];
  const predictions: ForecastPoint[] = [];

  for (let i = 0; i < numMonths; i++) {
    const x = pts.length + i;
    const spend = Math.max(0, slope * x + intercept);
    let month = last.month + 1 + i;
    let year = last.year;
    while (month > 11) {
      month -= 12;
      year++;
    }
    predictions.push({ year, month, spend });
  }

  return { predictions, slope, r2, dataPoints: entries.length };
}
