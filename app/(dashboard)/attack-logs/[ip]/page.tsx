"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  Search,
  Tag,
  X,
} from "lucide-react";

import { apiUrl, fetchApi } from "@/lib/api";
import { useTimezone } from "@/app/context/TimezoneContext";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, StatStrip, StatStripSkeleton } from "@/components/dashboard/StatCard";
import { RiskBadge } from "@/components/dashboard/RiskBadge";
import { SourceNetwork } from "@/components/dashboard/SourceNetwork";
import { TimelineChart, type TimelineBucket, type TimelinePoint } from "@/components/dashboard/TimelineChart";
import { RankedCredentialTable, type CredentialCount } from "@/components/dashboard/CredentialAnalysisCard";
import { WidgetError, WidgetSkeleton } from "@/components/dashboard/WidgetStates";
import { useAnalystNotes } from "@/lib/analyst-notes";
import { downloadWithAuth } from "@/lib/download";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format-date";
import { useWidgetData } from "@/lib/use-widget-data";
import type { GeoInfo, NetworkClass, RiskAssessment } from "@/lib/attack-types";

const API = apiUrl("/api/logs/ip");
const EMPTY = "—";

interface IpSummary {
  attacker_id: string;
  ip: string;
  network: NetworkClass;
  geo: GeoInfo;
  attempts: number;
  reviewed_count: number;
  first_seen: string;
  last_seen: string;
  unique_usernames: number;
  unique_passwords: number;
  attempts_per_minute: number;
  risk: RiskAssessment;
  top_usernames: CredentialCount[];
  top_passwords: CredentialCount[];
  timeline: { window: { timeZone: string; bucket: TimelineBucket }; points: TimelinePoint[] };
}

interface AttemptRow {
  log_id: string;
  access_time: string;
  username_attempt: string | null;
  password_attempt: string | null;
  status: string | null;
  // Not captured yet (null until the agent ingests Cowrie session events)
  login_result: "success" | "failed" | null;
  ssh_client_version: string | null;
  session_duration_seconds: number | null;
  commands_executed: string[] | null;
}

interface AttemptsResponse {
  data: AttemptRow[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

const NOT_CAPTURED = "Not captured yet: the agent does not ingest Cowrie session events";

// ---------------------------------------------------------------------------
// Enrichment links
// ---------------------------------------------------------------------------

function EnrichmentLinks({ ip, network }: { ip: string; network: NetworkClass }) {
  const links = [
    { name: "AbuseIPDB", href: `https://www.abuseipdb.com/check/${encodeURIComponent(ip)}` },
    { name: "VirusTotal", href: `https://www.virustotal.com/gui/ip-address/${encodeURIComponent(ip)}` },
  ];
  const isPublic = network.type === "public";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Threat intelligence</CardTitle>
        <CardDescription>
          {isPublic
            ? "Look up this address in external reputation services (opens a new tab)."
            : `${network.label} address: external reputation services have no data for it.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {links.map((link) =>
          isPublic ? (
            <Button key={link.name} variant="outline" size="sm" asChild>
              <a href={link.href} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                {link.name}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          ) : (
            <Button key={link.name} variant="outline" size="sm" disabled>
              {link.name}
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Analyst notes & tags (browser-local until the backend endpoint exists)
// ---------------------------------------------------------------------------

function AnalystPanel({ ip }: { ip: string }) {
  const { timeZone } = useTimezone();
  const stored = useAnalystNotes(ip);
  const [draft, setDraft] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  const notes = draft ?? stored.notes;
  const isDirty = draft !== null && draft !== stored.notes;

  const saveNotes = () => {
    if (stored.save({ notes, tags: stored.tags })) {
      setDraft(null);
      toast.success("Note saved in this browser.");
    } else {
      toast.error("Could not save the note (browser storage unavailable).");
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase().slice(0, 32);
    if (!tag || stored.tags.includes(tag)) {
      setTagInput("");
      return;
    }
    stored.save({ notes: stored.notes, tags: [...stored.tags, tag] });
    setTagInput("");
  };

  const removeTag = (tag: string) => stored.save({ notes: stored.notes, tags: stored.tags.filter((t) => t !== tag) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Analyst notes</CardTitle>
        <CardDescription>
          Saved in this browser only for now; shared notes need a backend endpoint.
          {stored.updatedAt && (
            <>
              {" "}Last saved <span className="font-mono">{formatDateTime(stored.updatedAt, timeZone)}</span>.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="analyst-tags">Tags</Label>
          <div className="flex flex-wrap items-center gap-2">
            {stored.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-mono text-xs text-foreground">
                <Tag className="h-3 w-3" aria-hidden />
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addTag();
              }}
            >
              <Input
                id="analyst-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="e.g. lab-test, scanner"
                className="h-8 w-44"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!tagInput.trim()}>Add</Button>
            </form>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="analyst-notes">Notes</Label>
          <textarea
            id="analyst-notes"
            value={notes}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Findings, decisions, follow-ups…"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <Button size="sm" onClick={saveNotes} disabled={!isDirty}>Save note</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Attempts table (server-side pagination + search)
// ---------------------------------------------------------------------------

function AttemptsTable({ ip, reloadKey }: { ip: string; reloadKey: number }) {
  const { timeZone } = useTimezone();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [localReload, setLocalReload] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Debounce the credential search
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const params = new URLSearchParams({ page: String(page), limit: String(limit), sortOrder });
  if (search) params.set("search", search);
  params.set("v", `${reloadKey}-${localReload}`);
  const { response, isLoading, error, retry } = useWidgetData<AttemptsResponse>(
    `${API}/${encodeURIComponent(ip)}/attempts?${params.toString()}`
  );
  const rows = response?.data ?? [];
  const pagination = response?.pagination;

  const markUnreviewed = async (logId: string) => {
    setTogglingId(logId);
    try {
      const res = await fetchApi(apiUrl(`/api/logs/${logId}/review`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Unreviewed" }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message);
      setLocalReload((n) => n + 1);
    } catch {
      toast.error("Could not mark the attempt as unreviewed.");
    } finally {
      setTogglingId(null);
    }
  };

  const firstRow = pagination ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const lastRow = pagination ? Math.min(pagination.page * pagination.limit, pagination.total) : 0;

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-base font-semibold">Login attempts</CardTitle>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search usernames or passwords…"
              aria-label="Search attempts by username or password"
              className="pl-9"
            />
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {pagination ? `${pagination.total.toLocaleString("en-US")} attempts${search ? " match" : ""}` : " "}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <WidgetError message={error} onRetry={retry} />
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <Table containerClassName="max-h-[60vh]">
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => {
                        setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
                        setPage(1);
                      }}
                      className="inline-flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring uppercase tracking-wide hover:text-foreground"
                      aria-label={`Sort by time, currently ${sortOrder === "desc" ? "newest first" : "oldest first"}`}
                    >
                      Time {sortOrder === "desc" ? "↓" : "↑"}
                    </button>
                  </TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Login result</TableHead>
                  <TableHead>SSH client</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Commands</TableHead>
                  <TableHead>Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}><Skeleton className="h-5 w-full bg-muted" /></TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-sm text-muted-foreground">
                      No attempts match &ldquo;{search}&rdquo;.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.log_id}>
                      <TableCell className="font-mono text-muted-foreground">{formatDateTime(row.access_time, timeZone)}</TableCell>
                      <TableCell className="font-mono">{row.username_attempt ?? EMPTY}</TableCell>
                      <TableCell className="font-mono">{row.password_attempt ?? EMPTY}</TableCell>
                      <TableCell className="text-sm text-muted-foreground" title={row.login_result ? undefined : NOT_CAPTURED}>
                        {row.login_result ? (row.login_result === "success" ? "Success" : "Failed") : EMPTY}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground" title={row.ssh_client_version ? undefined : NOT_CAPTURED}>
                        {row.ssh_client_version ?? EMPTY}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" title={row.session_duration_seconds !== null ? undefined : NOT_CAPTURED}>
                        {row.session_duration_seconds !== null ? formatDuration(row.session_duration_seconds * 1000) : EMPTY}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" title={row.commands_executed ? row.commands_executed.join("\n") : NOT_CAPTURED}>
                        {row.commands_executed ? row.commands_executed.length.toLocaleString("en-US") : EMPTY}
                      </TableCell>
                      <TableCell>
                        {row.status === "Reviewed" ? (
                          <button
                            type="button"
                            className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                            title="Mark as unreviewed"
                            disabled={togglingId === row.log_id}
                            onClick={() => markUnreviewed(row.log_id)}
                          >
                            <Badge variant="status" tone="ok">
                              {togglingId === row.log_id && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                              Reviewed
                            </Badge>
                          </button>
                        ) : (
                          <Badge variant="status" tone="neutral" className="text-muted-foreground">Unreviewed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {pagination && pagination.total > 0 && (
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground">
              Showing {firstRow.toLocaleString("en-US")}–{lastRow.toLocaleString("en-US")} of {pagination.total.toLocaleString("en-US")}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="attempts-page-size" className="text-muted-foreground">Rows</Label>
                <Select
                  value={String(limit)}
                  onValueChange={(value) => {
                    setLimit(Number(value));
                    setPage(1);
                  }}
                >
                  <SelectTrigger id="attempts-page-size" size="sm" className="w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagination.page <= 1} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <span className="text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={pagination.page >= pagination.totalPages} aria-label="Next page">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IpDetailPage() {
  const params = useParams<{ ip: string }>();
  const ip = decodeURIComponent(params.ip ?? "");
  const { timeZone } = useTimezone();
  // Bumped after auto-review so the attempts table shows the new review status
  const [reloadKey, setReloadKey] = useState(0);
  const [autoReviewed, setAutoReviewed] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const autoReviewedRef = useRef<string | null>(null);

  const { response, isLoading, error, retry } = useWidgetData<{ data: IpSummary }>(
    `${API}/${encodeURIComponent(ip)}?tz=${encodeURIComponent(timeZone)}`
  );
  const summary = response?.data;

  // Opening the detail page counts as reviewing this source (advisor decision): mark everything
  // up to the newest attempt shown, once per page visit
  useEffect(() => {
    if (!summary || autoReviewedRef.current === summary.attacker_id) return;
    autoReviewedRef.current = summary.attacker_id;
    if (summary.reviewed_count >= summary.attempts) return;

    fetchApi(apiUrl(`/api/logs/${summary.attacker_id}/mark-viewed`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upTo: summary.last_seen }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) {
          setAutoReviewed(true);
          setReloadKey((n) => n + 1);
        }
      })
      .catch((err) => console.error("Auto-review failed", err));
  }, [summary]);

  const handleExport = async (format: "csv" | "json") => {
    setExporting(format);
    try {
      await downloadWithAuth(`${API}/${encodeURIComponent(ip)}/export?format=${format}`, `obsera-attempts-${ip}.${format}`);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  };

  const backLink = (
    <Link href="/attack-logs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Attack Logs
    </Link>
  );

  if (error) {
    return (
      <PageLayout title={ip} titleClassName="font-mono" description={backLink}>
        <WidgetError message={error.includes("404") ? "No attacks have been recorded from this IP." : error} onRetry={retry} />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={ip}
      titleClassName="font-mono"
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {backLink}
          {summary && (
            <>
              <span aria-hidden>·</span>
              <span>First seen <span className="font-mono">{formatDateTime(summary.first_seen, timeZone)}</span></span>
              <span aria-hidden>·</span>
              <span>Last seen <span className="font-mono">{formatDateTime(summary.last_seen, timeZone)}</span> ({formatRelative(summary.last_seen)})</span>
            </>
          )}
        </span>
      }
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleExport("csv")} disabled={!!exporting || !summary}>
            {exporting === "csv" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            Export CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleExport("json")} disabled={!!exporting || !summary}>
            {exporting === "json" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            Export JSON
          </Button>
        </>
      }
    >
      {/* Summary */}
      {isLoading || !summary ? (
        <StatStripSkeleton />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Risk</span>
              <RiskBadge risk={summary.risk} />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Network</span>
              <SourceNetwork network={summary.network} geo={summary.geo} />
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Reviewed </span>
              <span className="font-mono text-foreground">
                {(autoReviewed ? summary.attempts : summary.reviewed_count).toLocaleString("en-US")} / {summary.attempts.toLocaleString("en-US")}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Active for </span>
              <span className="font-mono text-foreground">
                {formatDuration(new Date(summary.last_seen).getTime() - new Date(summary.first_seen).getTime())}
              </span>
            </div>
          </div>

          <StatStrip>
            <Stat label="Login attempts" value={summary.attempts.toLocaleString("en-US")} footnote="All time from this IP" />
            <Stat label="Attack rate" value={`${summary.attempts_per_minute.toLocaleString("en-US")}/min`} footnote="First to last attempt" />
            <Stat label="Usernames tried" value={summary.unique_usernames.toLocaleString("en-US")} footnote="Distinct values" />
            <Stat label="Passwords tried" value={summary.unique_passwords.toLocaleString("en-US")} footnote="Distinct values" />
          </StatStrip>
        </>
      )}

      {/* Timeline for this source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Activity timeline</CardTitle>
          <CardDescription>Attempts from this IP between its first and last appearance</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {isLoading || !summary ? (
            <WidgetSkeleton label="Loading activity timeline" />
          ) : (
            <TimelineChart
              points={summary.timeline.points}
              bucket={summary.timeline.window.bucket}
              timeZone={summary.timeline.window.timeZone}
            />
          )}
        </CardContent>
      </Card>

      {/* Credentials + enrichment + notes */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Credentials tried</CardTitle>
            <CardDescription>Most frequent values from this IP</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {isLoading || !summary ? (
              <WidgetSkeleton className="h-48" label="Loading credentials" />
            ) : (
              <>
                <RankedCredentialTable rows={summary.top_usernames} totalAttempts={summary.attempts} uniqueCount={summary.unique_usernames} noun="username" />
                <RankedCredentialTable rows={summary.top_passwords} totalAttempts={summary.attempts} uniqueCount={summary.unique_passwords} noun="password" />
              </>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          {summary && <EnrichmentLinks ip={summary.ip} network={summary.network} />}
          <AnalystPanel ip={ip} />
        </div>
      </div>

      <AttemptsTable ip={ip} reloadKey={reloadKey} />
    </PageLayout>
  );
}
