import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import SessionMonitor from "@/app/components/SessionMonitor";
import { LiveUpdatesProvider } from "@/lib/live-updates";
import { t } from "@/lib/i18n";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ProtectedRoute>
      <SessionMonitor />
      <LiveUpdatesProvider>
      {/* First focusable element: lets keyboard users jump past the navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t("app.skipToContent")}
      </a>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden bg-muted/50">
          <Header />
          <main id="main-content" tabIndex={-1} className="relative flex-1 overflow-y-auto p-4 focus:outline-none sm:p-6 md:p-8">
            {children}
          </main>
        </div>
      </div>
      </LiveUpdatesProvider>
    </ProtectedRoute>
  );
}
