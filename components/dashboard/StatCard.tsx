import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Key numbers in one bordered strip, divided by hairlines (no icons, no colored tiles).
 * The delta only shows an arrow against a real previous value: a rise is a signal (orange),
 * a fall stays muted. Trends live in the timeline below, so there are no sparklines here.
 */

interface StatProps {
  label: string;
  value: string;
  // Previous, equally long period (for "vs previous period")
  previousValue?: number;
  currentValue?: number;
  footnote?: string;
  // Long text values (passwords, usernames) shrink to fit instead of using the 28px number style
  valueKind?: "number" | "text";
}

type Delta = { direction: "up" | "down" | "flat" | "none"; text: string };

function formatDelta(current: number, previous: number): Delta {
  // Nothing to compare against: no arrow and no percentage
  if (previous === 0) return { direction: "none", text: "No prior data" };
  const change = ((current - previous) / previous) * 100;
  if (change === 0) return { direction: "flat", text: "0%" };
  const rounded = Math.abs(change) < 10 ? Math.abs(change).toFixed(1) : Math.round(Math.abs(change)).toString();
  return { direction: change > 0 ? "up" : "down", text: `${rounded}%` };
}

const DELTA_STYLES: Record<Delta["direction"], { arrow: string; className: string; label: string }> = {
  up: { arrow: "▲ ", className: "text-signal-text", label: "Up" },
  down: { arrow: "▼ ", className: "text-muted-foreground", label: "Down" },
  flat: { arrow: "", className: "text-muted-foreground", label: "No change," },
  none: { arrow: "", className: "text-muted-foreground", label: "" },
};

export function Stat({
  label,
  value,
  previousValue,
  currentValue,
  footnote,
  valueKind = "number",
}: StatProps) {
  const delta =
    previousValue !== undefined && currentValue !== undefined ? formatDelta(currentValue, previousValue) : null;
  const deltaStyle = delta ? DELTA_STYLES[delta.direction] : null;
  const hasComparison = delta && delta.direction !== "none";

  return (
    <div className="min-w-0 px-4 py-3">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground" title={label}>{label}</p>
      <p
        className={cn(
          "mt-1 truncate font-mono font-medium text-foreground",
          valueKind === "number" ? "text-[28px] leading-8" : "text-xl leading-8"
        )}
        title={value}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground" title={footnote}>
        {delta && deltaStyle && (
          <span
            className={cn("mr-1.5", hasComparison && "font-mono", deltaStyle.className)}
            aria-label={hasComparison ? `${deltaStyle.label} ${delta.text} versus previous period` : "No data for the previous period"}
          >
            {deltaStyle.arrow}
            {delta.text}
          </span>
        )}
        {hasComparison ? "vs prev. period" : delta ? null : footnote}
        {delta && footnote && <span className="block truncate">{footnote}</span>}
      </p>
    </div>
  );
}

/** Bordered strip; children are <Stat /> cells separated by hairlines */
export function StatStrip({ children, columns = 4, className }: { children: React.ReactNode; columns?: 1 | 2 | 3 | 4; className?: string }) {
  const cols = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4" }[columns];
  return (
    <div
      className={cn(
        "grid divide-y divide-border rounded-lg border border-border bg-card sm:divide-y-0",
        // Vertical hairlines between cells; with 2x2 wrapping a row rule is added via border-t on the 3rd/4th cell
        "sm:[&>*:not(:first-child)]:border-l sm:[&>*]:border-border",
        columns === 4 && "max-xl:sm:[&>*:nth-child(3)]:border-l-0 max-xl:sm:[&>*:nth-child(n+3)]:border-t",
        cols,
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatStripSkeleton({ count = 4 }: { count?: 1 | 2 | 3 | 4 }) {
  return (
    <StatStrip columns={count}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} role="status" aria-label="Loading metric" className="space-y-2 px-4 py-3">
          <Skeleton className="h-3 w-24 bg-muted" />
          <Skeleton className="h-7 w-20 bg-muted" />
          <Skeleton className="h-3 w-32 bg-muted" />
        </div>
      ))}
    </StatStrip>
  );
}
