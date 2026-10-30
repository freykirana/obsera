"use client";
import { apiUrl, fetchApi } from "@/lib/api";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format-date";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageLayout } from "@/components/layout/PageLayout";
import { RiskBadge } from "@/components/dashboard/RiskBadge";
import { RISK_THRESHOLDS, ipDetailHref, volumeRisk } from "@/lib/attack-types";

// Icons
import {
  Eye,
  Copy,
  MoreHorizontal,
  Loader2,
  Search,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { t } from "@/lib/i18n";

// --- Types ---
type RiskLevel = "High" | "Medium" | "Low";
type Status = "Reviewed" | "Unreviewed";

interface AttackLog {
  attacker_id: string;
  source_ip: string;
  total_attempts: number;
  reviewed_count: number;
  first_seen: string | null;
  latest_time: string | null;
  last_username: string | null;
  last_password: string | null;
  riskLevel: RiskLevel;
  status: Status;
}

// Row shape returned by GET /api/logs (aggregated per attacker)
interface AttackLogApiRow {
  attacker_id: string;
  source_ip: string;
  total_attempts?: number;
  reviewed_count?: number;
  first_seen?: string | null;
  latest_time?: string | null;
  last_username?: string | null;
  last_password?: string | null;
  riskLevel?: RiskLevel;
  status?: Status;
}

// Keyboard-operable sort control; aria-sort tells assistive tech which column orders the rows
function SortableHead({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  column: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (column: string) => void;
}) {
  const active = sortBy === column;
  const Icon = !active ? ArrowUpDown : sortOrder === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring uppercase tracking-wide"
        title={t("table.sortBy", { column: label })}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "text-foreground" : "text-muted-foreground"}`} aria-hidden />
      </button>
    </TableHead>
  );
}

const formatCredential = (username: string | null, password: string | null) =>
  username === null && password === null ? "—" : `${username ?? ""}:${password ?? ""}`;

import { useTimezone } from "@/app/context/TimezoneContext";

export default function AttackLogsPage() {
  const { timezoneOffset, timeZone } = useTimezone();
  const [logs, setLogs] = useState<AttackLog[]>([]);
  // Reference time for "x ago" labels, refreshed whenever the table reloads
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  
  // Pagination & Sorting State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState("access_time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRisks, setSelectedRisks] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  
  // UI State
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append("page", page.toString());
      queryParams.append("limit", limit.toString());
      queryParams.append("sortBy", sortBy);
      queryParams.append("sortOrder", sortOrder);
      queryParams.append("timezoneOffset", timezoneOffset.toString());

      if (searchQuery) queryParams.append("search", searchQuery);
      if (selectedStatuses.length > 0) queryParams.append("status", selectedStatuses.join(","));
      if (selectedRisks.length > 0) queryParams.append("riskLevel", selectedRisks.join(","));
      
      // Cache-buster to prevent browser from reusing stale 304 Not Modified responses
      queryParams.append("t", Date.now().toString());
      
      const res = await fetchApi(apiUrl(`/api/logs?${queryParams.toString()}`));
      
      if (res.status === 401 || res.status === 403) {
        setErrorMsg(`Authentication Error (${res.status}): Please log in again.`);
        setLogs([]);
        return;
      }
      
      const result = await res.json();
      
      if (result.ok && result.data) {
        const mappedLogs: AttackLog[] = result.data.map((log: AttackLogApiRow) => ({
          attacker_id: log.attacker_id,
          source_ip: log.source_ip,
          total_attempts: log.total_attempts || 1,
          reviewed_count: log.reviewed_count || 0,
          first_seen: log.first_seen ?? null,
          latest_time: log.latest_time ?? null,
          last_username: log.last_username ?? null,
          last_password: log.last_password ?? null,
          riskLevel: log.riskLevel || "Low",
          status: log.status || "Unreviewed",
        }));

        setLogs(mappedLogs);
        setNow(Date.now());
        if (result.pagination?.totalPages) {
          setTotalPages(result.pagination.totalPages);
        }
      } else {
        setErrorMsg(result.message || "Failed to load logs.");
        setLogs([]);
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
      setErrorMsg(error instanceof Error ? error.message : "Network error while fetching logs.");
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, sortBy, sortOrder, searchQuery, selectedStatuses, selectedRisks, timezoneOffset]);

  useEffect(() => {
    const timeoutId = setTimeout(fetchLogs, 300);
    return () => clearTimeout(timeoutId);
  }, [fetchLogs]);

  const hasActiveFilters = !!searchQuery || selectedRisks.length > 0 || selectedStatuses.length > 0;

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const toggleRisk = (risk: string) => {
    setSelectedRisks(prev => 
      prev.includes(risk) ? prev.filter(r => r !== risk) : [...prev, risk]
    );
    setPage(1);
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedRisks([]);
    setSelectedStatuses([]);
    setPage(1);
    setSortBy("access_time");
    setSortOrder("desc");
    setSelectedRows([]);
  };

  const handleBulkStatusUpdate = async (status: Status) => {
    if (selectedRows.length === 0) return;
    setIsUpdatingStatus(true);
    try {
      const res = await fetchApi(apiUrl(`/api/logs/update-status`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attackerIds: selectedRows,
          status,
        }),
      });
      const result = await res.json();
      if (result.ok) {
        setSelectedRows([]);
        fetchLogs();
      } else {
        console.error(result.message);
      }
    } catch (error) {
      console.error("Error updating status", error);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Reviewing only happens by opening the detail view; manual actions can only revert to Unreviewed
  const handleMarkUnreviewed = async (id: string) => {
    try {
      const res = await fetchApi(apiUrl(`/api/logs/update-status`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attackerIds: [id], status: "Unreviewed" }),
      });
      const result = await res.json();
      if (result.ok) {
        fetchLogs();
      }
    } catch (error) {
      console.error("Error updating single status", error);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(logs.map(l => l.attacker_id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedRows(prev => [...prev, id]);
    } else {
      setSelectedRows(prev => prev.filter(rowId => rowId !== id));
    }
  };

  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
  };

  return (
    <PageLayout title={t("pages.attackLogs.title")} description={t("pages.attackLogs.description")}>
      {/* Top Controls: Search & Filter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              type="text"
              placeholder="Search by IP Address or Username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <span>Filter</span>
                  {(selectedRisks.length > 0 || selectedStatuses.length > 0) && (
                    <Badge variant="outline" className="ml-1 h-5 px-1.5 font-mono">
                      {selectedRisks.length + selectedStatuses.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risk Level (per IP)</div>
                <DropdownMenuCheckboxItem checked={selectedRisks.includes("High")} onCheckedChange={() => toggleRisk("High")}>
                  High (&gt; {RISK_THRESHOLDS.high} attempts)
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={selectedRisks.includes("Medium")} onCheckedChange={() => toggleRisk("Medium")}>
                  Medium ({RISK_THRESHOLDS.medium + 1}–{RISK_THRESHOLDS.high})
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={selectedRisks.includes("Low")} onCheckedChange={() => toggleRisk("Low")}>
                  Low (≤ {RISK_THRESHOLDS.medium})
                </DropdownMenuCheckboxItem>
                <div className="h-px bg-muted my-1 mx-2"></div>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</div>
                <DropdownMenuCheckboxItem checked={selectedStatuses.includes("Reviewed")} onCheckedChange={() => toggleStatus("Reviewed")}>
                  Reviewed
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={selectedStatuses.includes("Unreviewed")} onCheckedChange={() => toggleStatus("Unreviewed")}>
                  Unreviewed
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button 
              variant="outline" 
              onClick={handleResetFilters} 
              className="gap-2"
              title="Reset Filters"
            >
              <RotateCcw className="w-4 h-4 text-muted-foreground" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          </div>
        </div>
        
        {/* Bulk Actions */}
        {selectedRows.length > 0 && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
            <span className="text-sm font-medium text-muted-foreground mr-2">{selectedRows.length} selected</span>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatusUpdate("Unreviewed")} disabled={isUpdatingStatus}>
              Mark Unreviewed
            </Button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-foreground">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-critical" aria-hidden />
            {errorMsg}
          </span>
          <Button size="sm" variant="outline" onClick={fetchLogs}>Retry</Button>
        </div>
      )}

      {/* Data Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table containerClassName="max-h-[calc(100vh-18rem)]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[40px] px-3">
                <Checkbox 
                  checked={logs.length > 0 && selectedRows.length === logs.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              {/* Only columns the API can order by are sortable (attempts, first seen, last seen) */}
              <TableHead>Source IP</TableHead>
              <SortableHead label="Attempts" column="attempt_number" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <TableHead>Last credential</TableHead>
              <SortableHead label="First seen" column="first_seen" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHead label="Last seen" column="access_time" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <TableHead>Risk</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-6">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    <span className="text-sm">Loading attack logs…</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-6 whitespace-normal text-muted-foreground">
                  <div className="flex flex-col items-start gap-1.5">
                    {hasActiveFilters ? (
                      <>
                        <p className="font-medium text-foreground">No attacking IPs match these filters</p>
                        <p className="text-sm">
                          {[
                            searchQuery && `search "${searchQuery}"`,
                            selectedRisks.length > 0 && `risk ${selectedRisks.join(" or ")}`,
                            selectedStatuses.length > 0 && `status ${selectedStatuses.join(" or ")}`,
                          ].filter(Boolean).join(", ")}
                        </p>
                        {selectedRisks.length > 0 && (
                          <p className="max-w-md text-xs">
                            Risk is rated per IP from its total attempts: Low ≤ {RISK_THRESHOLDS.medium}, Medium {RISK_THRESHOLDS.medium + 1}–{RISK_THRESHOLDS.high}, High &gt; {RISK_THRESHOLDS.high}.
                          </p>
                        )}
                        <Button variant="outline" size="sm" className="mt-1" onClick={handleResetFilters}>Clear filters</Button>
                      </>
                    ) : (
                      <p>No attacks have been recorded yet.</p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const isSelected = selectedRows.includes(log.attacker_id);
                const credential = formatCredential(log.last_username, log.last_password);
                const activeSpanMs = log.first_seen && log.latest_time
                  ? new Date(log.latest_time).getTime() - new Date(log.first_seen).getTime()
                  : NaN;
                
                return (
                  <TableRow key={log.attacker_id} className={`transition-colors ${isSelected ? "bg-muted/60" : "hover:bg-muted/50"}`}>
                    <TableCell className="px-3">
                      <Checkbox  
                        checked={isSelected}
                        onCheckedChange={(checked) => handleSelectRow(log.attacker_id, checked as boolean)}
                        aria-label="Select row"
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={ipDetailHref(log.source_ip)}
                        className="font-mono font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
                      >
                        {log.source_ip}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono">
                      <span className="block text-foreground">{log.total_attempts.toLocaleString("en-US")}</span>
                      <span className="block text-xs text-muted-foreground">
                        {log.reviewed_count.toLocaleString("en-US")}/{log.total_attempts.toLocaleString("en-US")} reviewed
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[250px] text-foreground">
                      <span className="block truncate font-mono" title={credential}>{credential}</span>
                    </TableCell>
                    <TableCell className="font-mono">
                      <span className="block text-foreground">{formatDateTime(log.first_seen, timeZone)}</span>
                      <span className="block text-xs text-muted-foreground">active {formatDuration(activeSpanMs)}</span>
                    </TableCell>
                    <TableCell className="font-mono">
                      <span className="block text-foreground">{formatDateTime(log.latest_time, timeZone)}</span>
                      <span className="block text-xs text-muted-foreground">{formatRelative(log.latest_time, now)}</span>
                    </TableCell>
                    <TableCell>
                      <RiskBadge risk={volumeRisk(log.total_attempts)} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="status" tone={log.status === "Reviewed" ? "ok" : "neutral"}>
                        {log.status === "Reviewed" ? "Reviewed" : "Unreviewed"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                            <span className="sr-only">Actions for {log.source_ip}</span>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem asChild className="cursor-pointer flex items-center gap-2">
                            <Link href={ipDetailHref(log.source_ip)}>
                              <Eye className="w-4 h-4 text-muted-foreground" />
                              <span>View details</span>
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="cursor-pointer flex items-center gap-2"
                            onClick={() => handleCopyIp(log.source_ip)}
                          >
                            <Copy className="w-4 h-4 text-muted-foreground" />
                            <span>Copy IP Address</span>
                          </DropdownMenuItem>
                          {log.reviewed_count > 0 && (
                            <DropdownMenuItem
                              className="cursor-pointer flex items-center gap-2"
                              onClick={() => handleMarkUnreviewed(log.attacker_id)}
                            >
                              <RotateCcw className="w-4 h-4 text-muted-foreground" />
                              <span>Mark Unreviewed</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Showing <span className="font-mono">{logs.length > 0 ? (page - 1) * limit + 1 : 0}</span>–<span className="font-mono">{Math.min(page * limit, logs.length + (page - 1) * limit)}</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <label htmlFor="rows-per-page">Rows per page:</label>
            <select
              id="rows-per-page"
              className="border border-border rounded-md text-sm p-1 bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setPage(1)} disabled={page === 1} aria-label={t("table.firstPage")}>
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} aria-label={t("table.previousPage")}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium mx-2 text-foreground">Page {page} of {totalPages || 1}</span>
            <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} aria-label={t("table.nextPage")}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setPage(totalPages)} disabled={page === totalPages || totalPages === 0} aria-label={t("table.lastPage")}>
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      
    </PageLayout>
  );
}
