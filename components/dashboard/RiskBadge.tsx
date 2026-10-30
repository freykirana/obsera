"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { RiskAssessment, RiskLevel } from "@/lib/attack-types";

const LEVEL_TONE: Record<RiskLevel, "critical" | "warning" | "neutral"> = {
  High: "critical",
  Medium: "warning",
  Low: "neutral",
};

/** Risk as a status dot + label; the tooltip explains which factors produced the level */
export function RiskBadge({ risk }: { risk: RiskAssessment }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Risk ${risk.level}. Show scoring factors`}
          >
            <Badge variant="status" tone={LEVEL_TONE[risk.level]} className="underline decoration-dotted decoration-muted-foreground underline-offset-4">
              {risk.level}
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs px-3 py-2 text-left">
          <p className="mb-1.5 font-semibold">Why {risk.level}?</p>
          <ul className="space-y-1.5">
            {risk.factors.map((factor) => (
              <li key={factor.label}>
                <span className="font-medium">{factor.label}:</span> <span className="font-mono">{factor.value}</span>
                {factor.decisive && <span className="opacity-80"> (sets the level)</span>}
                <span className="block opacity-80">{factor.note}</span>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
