"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WidgetError } from "@/components/dashboard/WidgetStates";
import { useTimezone } from "@/app/context/TimezoneContext";
import { formatDateTime } from "@/lib/format-date";
import { useWidgetData } from "@/lib/use-widget-data";
import { apiUrl } from "@/lib/api";

interface AuditEntry {
  id: string;
  at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  target: string | null;
  ip: string | null;
}

// Human labels for the action keys recorded by the backend audit middleware
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "settings.update": "Updated settings",
  "user.create": "Added user",
  "user.delete": "Revoked user access",
  "report.generate": "Generated report",
  "report.delete": "Deleted report",
  "review.auto_on_view": "Reviewed source (opened details)",
  "review.single": "Changed attempt review status",
  "review.batch": "Reviewed attempts in bulk",
  "review.bulk_status": "Changed source review status",
  "logs.export": "Exported attempts",
};

export function AuditLogPanel() {
  const { timeZone } = useTimezone();
  const { response, isLoading, error, retry } = useWidgetData<{ data: AuditEntry[] }>(
    apiUrl("/api/audit-log?limit=200")
  );
  const entries = response?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Audit log</h2>
          <p className="text-sm text-muted-foreground">
            Administrative actions with their time and actor. Kept in backend memory for now, so the list resets when the
            backend restarts.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={retry}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Refresh
        </Button>
      </div>

      {error ? (
        <WidgetError message={error} onRetry={retry} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table containerClassName="max-h-[60vh]">
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}><Skeleton className="h-5 w-full bg-muted" /></TableCell>
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-sm text-muted-foreground">
                    No administrative actions recorded since the backend started.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-muted-foreground">{formatDateTime(entry.at, timeZone)}</TableCell>
                    <TableCell>
                      <span className="block text-foreground">{entry.actor_name ?? entry.actor_email ?? "Unknown"}</span>
                      {entry.actor_name && entry.actor_email && (
                        <span className="block text-xs text-muted-foreground">{entry.actor_email}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground">{ACTION_LABELS[entry.action] ?? entry.action}</TableCell>
                    <TableCell className="max-w-[280px] truncate font-mono text-xs text-muted-foreground" title={entry.target ?? undefined}>
                      {entry.target ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{entry.ip ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
