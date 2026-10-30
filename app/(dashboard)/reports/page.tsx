"use client";
import { apiUrl, fetchApi } from "@/lib/api";

import { Suspense, useCallback, useEffect, useState } from "react";
import { ChevronDown, Download, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageLayout } from "@/components/layout/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Stat, StatStrip, StatStripSkeleton } from "@/components/dashboard/StatCard";
import AttackHeatmapCard from "@/components/dashboard/AttackHeatmapCard";
import { WidgetError } from "@/components/dashboard/WidgetStates";
import { useTimezone } from "@/app/context/TimezoneContext";
import { downloadWithAuth } from "@/lib/download";
import { formatDateTime } from "@/lib/format-date";
import { useTimeRange } from "@/lib/time-range";
import { useWidgetData } from "@/lib/use-widget-data";
import { t } from "@/lib/i18n";

interface Report {
  report_id: string;
  title: string;
  period: string;
  created_at: string;
  status: string;
  // Byte size of each stored file (null for reports whose files are built on first download)
  pdf_bytes: number | null;
  csv_bytes: number | null;
  json_bytes: number | null;
}

interface LogsStatsResponse {
  data: { averageVelocity: number };
}

// Every report can be downloaded in any of these formats (generated on demand by the backend)
const REPORT_FORMATS = [
  { value: "pdf", label: "PDF", description: "Analysis: summary, findings, charts, recommendations" },
  { value: "csv", label: "CSV", description: "Every attempt in the period, one row each" },
  { value: "json", label: "JSON", description: "Summary, findings and every attempt" },
] as const;
type ReportFormat = (typeof REPORT_FORMATS)[number]["value"];

const fileSize = (report: Report, format: ReportFormat) => report[`${format}_bytes`];

// "57.2 KB", "1.4 MB"
const formatBytes = (bytes: number | null) => {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("en-US", { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
};

const REPORT_PERIODS = ["Last 24 Hours", "Last 7 Days", "Last 30 Days"];

function Reports() {
  const { timeZone } = useTimezone();
  const [reports, setReports] = useState<Report[]>([]);
  const [isReportsLoading, setIsReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);

  // Generate dialog
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState("Last 7 Days");
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>("pdf");
  const [isGenerating, setIsGenerating] = useState(false);

  // Row actions
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [reportToDeleteId, setReportToDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Analysis widgets follow the global time range
  const { query, phrase } = useTimeRange();
  const velocity = useWidgetData<LogsStatsResponse>(apiUrl(`/api/logs/stats?${query}`), { live: true });

  // Reports history (not tied to the time range)
  const fetchReports = useCallback(async () => {
    setIsReportsLoading(true);
    setReportsError(null);
    try {
      const res = await fetchApi(apiUrl("/api/reports"));
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "The server returned an error");
      setReports(json.data);
    } catch (err) {
      console.error("Failed to fetch reports history", err);
      setReportsError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleDownload = async (report: Pick<Report, "report_id" | "title">, format: ReportFormat) => {
    setDownloadingId(report.report_id);
    try {
      await downloadWithAuth(
        apiUrl(`/api/reports/${report.report_id}/download?format=${format}`),
        `${report.title}.${format}`
      );
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Could not download the report. Check your connection or sign in again.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleConfirmGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetchApi(apiUrl("/api/reports/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: selectedPeriod })
      });
      const json = await res.json();

      if (json.ok) {
        setReports((prev) => [json.data, ...prev]);
        setIsModalOpen(false);
        toast.success(`Report ${json.data.title} generated.`);
        // Download the new report straight away in the chosen format
        await handleDownload(json.data, selectedFormat);
      } else {
        toast.error(json.message || "Failed to generate the report.");
      }
    } catch (err) {
      console.error("Failed to generate report", err);
      toast.error("Network error while generating the report.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!reportToDeleteId) return;
    setIsDeleting(true);
    try {
      const res = await fetchApi(apiUrl(`/api/reports/${reportToDeleteId}`), {
        method: "DELETE"
      });
      const json = await res.json();
      if (json.ok) {
        setReports(prev => prev.filter(r => r.report_id !== reportToDeleteId));
        setReportToDeleteId(null);
        toast.success("Report deleted.");
      } else {
        toast.error(json.message || "Failed to delete the report.");
      }
    } catch (err) {
      console.error("Failed to delete report", err);
      toast.error("Network error while deleting the report.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <PageLayout
      title={t("pages.reports.title")}
      description={t("pages.reports.description")}
      actions={
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          Generate Report
        </Button>
      }
    >
      {/* Available Reports */}
      <section className="space-y-4" aria-labelledby="available-reports-heading">
        <h2 id="available-reports-heading" className="text-base font-semibold text-foreground">Available reports</h2>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table containerClassName="max-h-[40vh]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>ID</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isReportsLoading && Array.from({ length: 3 }, (_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full bg-muted" />
                  </TableCell>
                </TableRow>
              ))}
              {!isReportsLoading && reportsError && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <WidgetError message={reportsError} onRetry={fetchReports} />
                  </TableCell>
                </TableRow>
              )}
              {!isReportsLoading && !reportsError && reports.map((report) => (
                <TableRow key={report.report_id} className="hover:bg-muted/50 transition-colors border-b-border">
                  <TableCell className="font-mono font-medium text-foreground">{report.title}</TableCell>
                  <TableCell className="text-foreground">{report.period}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{formatDateTime(report.created_at, timeZone)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {REPORT_FORMATS.map((f) => (
                        <span key={f.value} className="whitespace-nowrap rounded-md border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {f.label} <span className="text-foreground">{formatBytes(fileSize(report, f.value))}</span>
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="status" tone={report.status === "Ready" ? "ok" : "neutral"}>{report.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={downloadingId === report.report_id}
                            aria-label={`Download report ${report.title}`}
                          >
                            {downloadingId === report.report_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <Download className="h-4 w-4" aria-hidden />
                            )}
                            Download
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {REPORT_FORMATS.map((f) => (
                            <DropdownMenuItem key={f.value} onClick={() => handleDownload(report, f.value)} className="flex-col items-start gap-0">
                              <span className="font-medium">
                                {f.label} <span className="font-mono text-xs font-normal text-muted-foreground">{formatBytes(fileSize(report, f.value))}</span>
                              </span>
                              <span className="text-xs text-muted-foreground">{f.description}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-accent"
                        onClick={() => setReportToDeleteId(report.report_id)}
                        aria-label={`Delete report ${report.title}`}
                        title="Delete report"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!isReportsLoading && !reportsError && reports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-muted-foreground">
                    No reports generated yet. Use &ldquo;Generate Report&rdquo; to create one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Attack Analysis (follows the global time range in the header) */}
      <section className="space-y-4" aria-labelledby="attack-analysis-heading">
        <h2 id="attack-analysis-heading" className="text-base font-semibold text-foreground">Attack analysis</h2>
        {velocity.isLoading ? (
          <StatStripSkeleton count={1} />
        ) : velocity.error ? (
          <WidgetError message={velocity.error} onRetry={velocity.retry} />
        ) : (
          <StatStrip columns={1} className="sm:max-w-xs">
            <Stat
              label="Avg velocity (req/min)"
              value={(velocity.response?.data.averageVelocity ?? 0).toLocaleString("en-US")}
              footnote={`Latest attack session ${phrase}`}
            />
          </StatStrip>
        )}
        <AttackHeatmapCard />
      </section>

      {/* Generate Report */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate new report</DialogTitle>
            <DialogDescription>The report covers the chosen period up to now and downloads right away.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="report-period">Reporting period</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger id="report-period" className="w-full">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_PERIODS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label id="report-format-label">Format</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={selectedFormat}
                onValueChange={(value) => value && setSelectedFormat(value as ReportFormat)}
                aria-labelledby="report-format-label"
              >
                {REPORT_FORMATS.map((f) => (
                  <ToggleGroupItem key={f.value} value={f.value} className="px-4">{f.label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                {REPORT_FORMATS.find((f) => f.value === selectedFormat)?.description}. Other formats stay available from the table.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmGenerate} disabled={isGenerating} className="gap-2">
              {isGenerating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {isGenerating ? "Generating..." : "Generate & download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!reportToDeleteId} onOpenChange={(open) => !open && !isDeleting && setReportToDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              The report and its file will be permanently removed from the server. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="gap-2 bg-destructive text-background hover:bg-destructive/90"
              onClick={(e) => {
                // Keep the dialog open until the request finishes
                e.preventDefault();
                handleDeleteConfirm();
              }}
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {isDeleting ? "Deleting..." : "Delete report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}

// useSearchParams (global time range) requires a Suspense boundary for static prerendering
export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <Reports />
    </Suspense>
  );
}
