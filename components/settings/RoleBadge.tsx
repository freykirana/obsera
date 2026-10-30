import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const ROLES = [
  { value: "Admin", description: "Full access, including users and settings" },
  { value: "Analyst", description: "Review attacks, add notes, generate reports" },
  { value: "Viewer", description: "Read-only access to dashboards and reports" },
] as const;

export type Role = (typeof ROLES)[number]["value"];

// Roles are identity, not status: neutral outlines that differ only in emphasis (no brand or status color)
const ROLE_CLASSES: Record<Role, string> = {
  Admin: "border-foreground/60 text-foreground font-semibold",
  Analyst: "border-border text-foreground",
  Viewer: "border-dashed border-border text-muted-foreground",
};

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant="outline" className={cn("font-medium", ROLE_CLASSES[role])}>{role}</Badge>;
}
