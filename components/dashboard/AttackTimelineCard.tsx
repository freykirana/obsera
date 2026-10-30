"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTimeRange } from "@/lib/time-range";
import { useWidgetData } from "@/lib/use-widget-data";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "@/components/dashboard/WidgetStates";
import { TimelineChart, type TimelineBucket, type TimelinePoint } from "@/components/dashboard/TimelineChart";
import { apiUrl } from "@/lib/api";

interface TimelineResponse {
  bucket: TimelineBucket;
  window: { timeZone: string };
  data: TimelinePoint[];
}

export default function AttackTimelineCard() {
  const { query } = useTimeRange();
  const { response, isLoading, error, retry } = useWidgetData<TimelineResponse>(
    apiUrl(`/api/attack-logs/timeline?${query}`),
    { live: true }
  );

  const points = response?.data ?? [];
  const hasAttempts = points.some((p) => p.attempts > 0);
  const showChart = !isLoading && !error && hasAttempts;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold">SSH Attack Timeline</CardTitle>
        <CardDescription>Login attempts captured by the honeypot per {response?.bucket ?? "interval"}</CardDescription>
      </CardHeader>
      <CardContent className={showChart || isLoading ? "h-64" : undefined}>
        {isLoading ? (
          <WidgetSkeleton label="Loading attack timeline" />
        ) : error ? (
          <WidgetError message={error} onRetry={retry} />
        ) : !hasAttempts || !response ? (
          <WidgetEmpty message="No login attempts" />
        ) : (
          <TimelineChart points={points} bucket={response.bucket} timeZone={response.window.timeZone} />
        )}
      </CardContent>
    </Card>
  );
}
