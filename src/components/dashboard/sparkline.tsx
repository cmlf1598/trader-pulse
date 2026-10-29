"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

import type { PriceHistory } from "@/lib/api/schemas";

export function Sparkline({ history }: { history: PriceHistory }) {
  const points = history.points;
  const up = points.length > 1 && points.at(-1)!.close >= points[0].close;

  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="close"
            stroke={up ? "var(--bull)" : "var(--bear)"}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
