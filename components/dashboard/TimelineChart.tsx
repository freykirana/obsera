"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { AXIS_DATE_PATTERN, AXIS_TIME_PATTERN, formatDate, formatDateTime, formatInZone } from "@/lib/format-date";

export type TimelinePoint = { bucket: string; attempts: number };
export type TimelineBucket = "minute" | "hour" | "day";

interface TimelineChartProps {
  points: TimelinePoint[];
  bucket: TimelineBucket;
  // Timezone the backend used to build the buckets
  timeZone: string;
}

/**
 * Zero-filled attempts-over-time bar chart (presentational; the parent fetches the data).
 * Bars, not a line: a line interpolates between buckets and turns a single spike into a ramp.
 * Zero buckets draw nothing; the hovered bar switches to the signal color.
 */
export function TimelineChart({ points, bucket, timeZone }: TimelineChartProps) {
  const isDaily = bucket === "day";
  const spansDays = points.length > 0 && points[0].bucket.slice(0, 10) !== points[points.length - 1].bucket.slice(0, 10);

  // Axis ticks stay compact; the tooltip uses the app-wide date format
  const formatTick = (value: string) =>
    formatInZone(
      value,
      timeZone,
      isDaily ? AXIS_DATE_PATTERN : spansDays && bucket === "hour" ? `${AXIS_DATE_PATTERN} ${AXIS_TIME_PATTERN}` : AXIS_TIME_PATTERN
    );

  const formatTooltipTime = (value: string) => (isDaily ? formatDate(value, timeZone) : formatDateTime(value, timeZone));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis
          dataKey="bucket"
          stroke="var(--color-muted-foreground)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          dy={10}
          minTickGap={24}
          tickFormatter={formatTick}
        />
        <YAxis
          stroke="var(--color-muted-foreground)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          dx={-10}
          allowDecimals={false}
          tickFormatter={(value: number) => value.toLocaleString("en-US")}
        />
        <Tooltip
          cursor={{ fill: "var(--color-muted)", opacity: 0.6 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as TimelinePoint;
            return (
              <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
                <span className="font-mono text-muted-foreground">{formatTooltipTime(point.bucket)}</span>
                <span className="text-muted-foreground"> · </span>
                <span className="font-mono font-semibold text-foreground">
                  {point.attempts.toLocaleString("en-US")} {point.attempts === 1 ? "attempt" : "attempts"}
                </span>
              </div>
            );
          }}
        />
        <Bar
          dataKey="attempts"
          fill="var(--color-chart-1)"
          activeBar={{ fill: "var(--color-chart-2)" }}
          radius={[2, 2, 0, 0]}
          maxBarSize={32}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
