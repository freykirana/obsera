"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "@/components/dashboard/WidgetStates";
import { useTimezone } from "@/app/context/TimezoneContext";
import { timezoneLabelFromOffset } from "@/lib/format-date";
import { useTimeRange } from "@/lib/time-range";
import { useWidgetData } from "@/lib/use-widget-data";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api";

type HeatmapCell = { day: number; hour: number; attempts: number };

// ISO day numbers from the backend: 1 = Monday ... 7 = Sunday
const DAYS = [
  { iso: 1, short: "Mon", long: "Monday" },
  { iso: 2, short: "Tue", long: "Tuesday" },
  { iso: 3, short: "Wed", long: "Wednesday" },
  { iso: 4, short: "Thu", long: "Thursday" },
  { iso: 5, short: "Fri", long: "Friday" },
  { iso: 6, short: "Sat", long: "Saturday" },
  { iso: 7, short: "Sun", long: "Sunday" },
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const pad = (h: number) => String(h).padStart(2, "0");

// Sequential blue scale (chart-1 mixed into the card) in four steps by share of the busiest
// cell; the busiest cell is full chart-1 with a ring. Orange (signal) only marks the hovered cell.
const STEP_MIX = [0, 20, 40, 65, 90];
const stepFor = (attempts: number, max: number) => (attempts <= 0 || max <= 0 ? 0 : Math.max(1, Math.ceil((attempts / max) * 4)));
const fillFor = (step: number) =>
  step === 0 ? "var(--color-muted)" : `color-mix(in oklch, var(--color-chart-1) ${STEP_MIX[step]}%, var(--color-card))`;
const PEAK_FILL = "var(--color-chart-1)";

export default function AttackHeatmapCard() {
  const { query } = useTimeRange();
  const { timezoneOffset } = useTimezone();
  const tzLabel = timezoneLabelFromOffset(timezoneOffset);
  const { response, isLoading, error, retry } = useWidgetData<{ data: HeatmapCell[] }>(
    apiUrl(`/api/attack-logs/heatmap?${query}`),
    { live: true }
  );

  const cells = response?.data ?? [];
  const grid = new Map(cells.map((c) => [`${c.day}-${c.hour}`, c.attempts]));
  const valueAt = (day: number, hour: number) => grid.get(`${day}-${hour}`) ?? 0;
  const max = cells.reduce((m, c) => Math.max(m, c.attempts), 0);
  const peak = cells.reduce<HeatmapCell | null>((best, c) => (!best || c.attempts > best.attempts ? c : best), null);
  const peakDay = peak ? DAYS.find((d) => d.iso === peak.day) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Attacks by Day and Hour</CardTitle>
        <CardDescription>
          {peak && peakDay
            ? `Busiest slot: ${peakDay.long} ${pad(peak.hour)}:00–${pad(peak.hour)}:59 ${tzLabel} (${peak.attempts.toLocaleString("en-US")} attempts)`
            : `Login attempts by weekday and local hour (${tzLabel})`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <WidgetSkeleton className="h-64" label="Loading attack heatmap" />
        ) : error ? (
          <WidgetError message={error} onRetry={retry} />
        ) : max === 0 ? (
          <WidgetEmpty message="No login attempts" />
        ) : (
          <div className="relative space-y-3">
            <div className="overflow-x-auto">
              <div
                className="grid min-w-[560px] gap-[2px]"
                style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))" }}
                role="img"
                aria-label={`Heatmap of login attempts by weekday and hour in ${tzLabel}. A data table follows.`}
              >
                <span aria-hidden />
                {HOURS.map((h) => (
                  <span key={h} className="font-mono text-xs text-muted-foreground" aria-hidden>
                    {h % 3 === 0 ? pad(h) : ""}
                  </span>
                ))}
                {DAYS.map((day) => (
                  <div key={day.iso} className="contents">
                    <span className="flex items-center font-mono text-xs text-muted-foreground" aria-hidden>{day.short}</span>
                    {HOURS.map((hour) => {
                      const attempts = valueAt(day.iso, hour);
                      const isPeak = !!peak && peak.day === day.iso && peak.hour === hour;
                      return (
                        <span
                          key={hour}
                          className={cn(
                            "aspect-square rounded-sm hover:outline-2 hover:outline-signal",
                            isPeak && "ring-1 ring-inset ring-foreground"
                          )}
                          style={{ backgroundColor: isPeak ? PEAK_FILL : fillFor(stepFor(attempts, max)) }}
                          title={`${day.long} ${pad(hour)}:00–${pad(hour)}:59 · ${attempts.toLocaleString("en-US")} ${attempts === 1 ? "attempt" : "attempts"}`}
                          aria-hidden
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>Fewer</span>
              {[0, 1, 2, 3, 4].map((step) => (
                <span key={step} className="h-3 w-3 rounded-sm" style={{ backgroundColor: fillFor(step) }} aria-hidden />
              ))}
              <span>More</span>
              <span className="ml-3 h-3 w-3 rounded-sm ring-1 ring-inset ring-foreground" style={{ backgroundColor: PEAK_FILL }} aria-hidden />
              <span>Busiest (<span className="font-mono">{max.toLocaleString("en-US")}</span>)</span>
            </div>

            {/* Screen-reader table with the same numbers */}
            <table className="sr-only">
              <caption>Login attempts by weekday (rows) and hour of day in {tzLabel} (columns); empty cells are zero</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  {HOURS.map((h) => <th key={h} scope="col">{pad(h)}:00</th>)}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day.iso}>
                    <th scope="row">{day.long}</th>
                    {HOURS.map((hour) => <td key={hour}>{valueAt(day.iso, hour) || ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
