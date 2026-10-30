"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "@/components/dashboard/WidgetStates";
import { RiskBadge } from "@/components/dashboard/RiskBadge";
import { SourceNetwork } from "@/components/dashboard/SourceNetwork";
import { useTimezone } from "@/app/context/TimezoneContext";
import { formatDateTime } from "@/lib/format-date";
import { useTimeRange } from "@/lib/time-range";
import { useWidgetData } from "@/lib/use-widget-data";
import { ipDetailHref, type GeoInfo, type NetworkClass, type RiskAssessment } from "@/lib/attack-types";
import { apiUrl } from "@/lib/api";

interface TopSource {
  attacker_id: string;
  ip: string;
  attempts: number;
  first_seen: string;
  last_seen: string;
  network: NetworkClass;
  geo: GeoInfo;
  risk: RiskAssessment;
}

export default function TopAttackingIpsCard() {
  const { query } = useTimeRange();
  const { timeZone } = useTimezone();
  const { response, isLoading, error, retry } = useWidgetData<{ data: TopSource[] }>(
    apiUrl(`/api/attack-logs/top-sources?${query}&limit=10`),
    { live: true }
  );
  const sources = response?.data ?? [];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Top Attacking IPs</CardTitle>
        <CardDescription>By login attempts; seen times are within the range</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <WidgetSkeleton className="h-56" label="Loading top attacking IPs" />
        ) : error ? (
          <WidgetError message={error} onRetry={retry} />
        ) : sources.length === 0 ? (
          <WidgetEmpty message="No attacking IPs" />
        ) : (
          <Table containerClassName="max-h-[320px]">
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Last / first seen</TableHead>
                <TableHead>Risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.attacker_id}>
                  <TableCell>
                    <Link
                      href={ipDetailHref(source.ip)}
                      className="font-mono font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
                    >
                      {source.ip}
                    </Link>
                    <SourceNetwork network={source.network} geo={source.geo} compact />
                  </TableCell>
                  <TableCell className="text-right font-mono">{source.attempts.toLocaleString("en-US")}</TableCell>
                  <TableCell className="font-mono">
                    <span className="block text-foreground">{formatDateTime(source.last_seen, timeZone)}</span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(source.first_seen, timeZone)}</span>
                  </TableCell>
                  <TableCell>
                    <RiskBadge risk={source.risk} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
