"use client";

import { Suspense } from "react";

import { PageLayout } from "@/components/layout/PageLayout";
import { Stat, StatStrip, StatStripSkeleton } from "@/components/dashboard/StatCard";
import AttackTimelineCard from "@/components/dashboard/AttackTimelineCard";
import TopAttackingIpsCard from "@/components/dashboard/TopAttackingIpsCard";
import CredentialAnalysisCard, { type CredentialCount, type CredentialSummary } from "@/components/dashboard/CredentialAnalysisCard";
import { WidgetError } from "@/components/dashboard/WidgetStates";
import { useTimeRange } from "@/lib/time-range";
import { useWidgetData } from "@/lib/use-widget-data";
import { t } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";

// Shape of GET /api/attack-logs/stats
interface StatsResponse {
  data: {
    total_attacks: number;
    unique_sources: number;
    top_password: { password: string; count: number };
    top_passwords_list: { password: string; count: number }[];
    top_username: { username: string; count: number };
    top_usernames_list: { username: string; count: number }[];
    credential_summary: CredentialSummary;
    previous: { total_attacks: number; unique_sources: number };
  };
}

const formatShare = (count: number, total: number) =>
  total > 0 ? `${((count / total) * 100).toFixed(1)}% of attempts` : "no attempts";

function Dashboard() {
  const { query, phrase } = useTimeRange();
  const { response, isLoading, error, retry } = useWidgetData<StatsResponse>(
    apiUrl(`/api/attack-logs/stats?${query}`),
    { live: true }
  );

  const stats = response?.data;
  const passwords: CredentialCount[] = (stats?.top_passwords_list ?? []).map((row) => ({ value: row.password, count: row.count }));
  const usernames: CredentialCount[] = (stats?.top_usernames_list ?? []).map((row) => ({ value: row.username, count: row.count }));

  return (
    <PageLayout
      title={t("pages.dashboard.title")}
      description={t("pages.dashboard.description")}
    >
      {/* Key numbers */}
      {error ? (
        <WidgetError message={error} onRetry={retry} />
      ) : isLoading || !stats ? (
        <StatStripSkeleton />
      ) : (
        <StatStrip>
          <Stat
            label="Total attacks"
            value={stats.total_attacks.toLocaleString("en-US")}
            currentValue={stats.total_attacks}
            previousValue={stats.previous.total_attacks}
            footnote={`Login attempts ${phrase}`}
          />
          <Stat
            label="Unique sources"
            value={stats.unique_sources.toLocaleString("en-US")}
            currentValue={stats.unique_sources}
            previousValue={stats.previous.unique_sources}
            footnote={`Distinct attacking IPs ${phrase}`}
          />
          <Stat
            label="Top password"
            value={stats.top_password.password}
            valueKind="text"
            footnote={`${stats.top_password.count.toLocaleString("en-US")} tries · ${formatShare(stats.top_password.count, stats.total_attacks)}`}
          />
          <Stat
            label="Top username"
            value={stats.top_username.username}
            valueKind="text"
            footnote={`${stats.top_username.count.toLocaleString("en-US")} tries · ${formatShare(stats.top_username.count, stats.total_attacks)}`}
          />
        </StatStrip>
      )}

      {/* Activity and its sources side by side on wide screens */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <AttackTimelineCard />
        </div>
        <div className="min-w-0">
          <TopAttackingIpsCard />
        </div>
      </div>

      <CredentialAnalysisCard
        passwords={passwords}
        usernames={usernames}
        totalAttempts={stats?.total_attacks ?? 0}
        summary={stats?.credential_summary ?? null}
        isLoading={isLoading}
        error={error}
        onRetry={retry}
      />
    </PageLayout>
  );
}

// useSearchParams (global time range) requires a Suspense boundary for static prerendering
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
