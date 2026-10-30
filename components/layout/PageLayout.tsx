import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageLayoutProps {
  title: string;
  description?: ReactNode;
  // Page-level buttons rendered on the right of the header (e.g. "Generate Report")
  actions?: ReactNode;
  className?: string;
  // e.g. "font-mono" when the title is technical data such as an IP address
  titleClassName?: string;
  children: ReactNode;
}

/** Shared page frame: one max width, one header style, consistent vertical rhythm */
export function PageLayout({ title, description, actions, className, titleClassName, children }: PageLayoutProps) {
  return (
    <div className={cn("mx-auto w-full max-w-[1440px] space-y-5", className)}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className={cn("text-xl font-semibold leading-7 text-foreground", titleClassName)}>{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
