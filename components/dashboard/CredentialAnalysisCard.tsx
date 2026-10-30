"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "@/components/dashboard/WidgetStates";
import { Stat, StatStrip } from "@/components/dashboard/StatCard";

const TOP_N = 10;

export type CredentialCount = { value: string; count: number };

export type CredentialSummary = {
  unique_passwords: number;
  unique_usernames: number;
  unique_pairs: number;
};

interface CredentialAnalysisCardProps {
  passwords: CredentialCount[];
  usernames: CredentialCount[];
  totalAttempts: number;
  summary: CredentialSummary | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

const formatShare = (count: number, total: number) => {
  if (total <= 0) return "0%";
  const share = (count / total) * 100;
  return `${share < 10 ? share.toFixed(1) : Math.round(share)}%`;
};

export function RankedCredentialTable({
  rows,
  totalAttempts,
  uniqueCount,
  noun,
}: {
  rows: CredentialCount[];
  totalAttempts: number;
  uniqueCount: number | undefined;
  noun: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-6 text-sm text-muted-foreground">
        <p>No {noun}s captured yet.</p>
      </div>
    );
  }

  const shown = rows.slice(0, TOP_N);
  const maxCount = shown[0].count;

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>{noun}</TableHead>
            <TableHead className="w-20 text-right">Attempts</TableHead>
            <TableHead className="w-[38%]">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => {
            // Competition ranking: equal counts share a rank (1, 2, 2, 2, ...)
            const rank = 1 + shown.filter((other) => other.count > row.count).length;
            const isTop = rank === 1;
            return (
              <TableRow key={row.value}>
                <TableCell className="font-mono text-muted-foreground">{rank}</TableCell>
                <TableCell className={`font-mono ${isTop ? "font-semibold text-foreground" : "text-foreground"}`}>
                  {row.value}
                </TableCell>
                <TableCell className="text-right font-mono text-foreground">
                  {row.count.toLocaleString("en-US")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-muted">
                      <div
                        className={`h-full rounded-sm ${isTop ? "bg-chart-1" : "bg-chart-4"}`}
                        style={{ width: `${(row.count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-xs text-muted-foreground">
                      {formatShare(row.count, totalAttempts)}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {uniqueCount !== undefined && uniqueCount > shown.length && (
        <p className="text-xs text-muted-foreground">
          Showing top {shown.length} of {uniqueCount.toLocaleString("en-US")} unique {noun}s. Rows with equal counts share a rank.
        </p>
      )}
    </div>
  );
}

export default function CredentialAnalysisCard({
  passwords,
  usernames,
  totalAttempts,
  summary,
  isLoading,
  error,
  onRetry,
}: CredentialAnalysisCardProps) {
  const summaryItems = summary
    ? [
        { label: "Unique passwords", value: summary.unique_passwords },
        { label: "Unique usernames", value: summary.unique_usernames },
        { label: "Unique user:pass pairs", value: summary.unique_pairs },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Credential Analysis</CardTitle>
        <CardDescription>Which passwords and usernames attackers tried most often</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <WidgetSkeleton className="h-64" label="Loading credential analysis" />
        ) : error ? (
          <WidgetError message={error} onRetry={onRetry} />
        ) : totalAttempts === 0 ? (
          <WidgetEmpty message="No credentials captured" />
        ) : (
        <>
        {summaryItems.length > 0 && (
          <StatStrip columns={3}>
            {summaryItems.map((item) => (
              <Stat key={item.label} label={item.label} value={item.value.toLocaleString("en-US")} />
            ))}
          </StatStrip>
        )}

        <Tabs defaultValue="passwords">
          <TabsList>
            <TabsTrigger value="passwords">Passwords</TabsTrigger>
            <TabsTrigger value="usernames">Usernames</TabsTrigger>
          </TabsList>
          <TabsContent value="passwords">
            <RankedCredentialTable
              rows={passwords}
              totalAttempts={totalAttempts}
              uniqueCount={summary?.unique_passwords}
              noun="password"
            />
          </TabsContent>
          <TabsContent value="usernames">
            <RankedCredentialTable
              rows={usernames}
              totalAttempts={totalAttempts}
              uniqueCount={summary?.unique_usernames}
              noun="username"
            />
          </TabsContent>
        </Tabs>
        </>
        )}
      </CardContent>
    </Card>
  );
}
