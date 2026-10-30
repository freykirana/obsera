/** Shapes shared by the backend's per-source endpoints (top sources, IP detail) */
import { RISK_THRESHOLDS, assessRisk } from "@/shared/risk-rules";

export type RiskLevel = "High" | "Medium" | "Low";

export interface RiskFactor {
  label: string;
  value: string;
  note: string;
  // The factor that decides the level (attempt volume)
  decisive: boolean;
}

export interface RiskAssessment {
  level: RiskLevel;
  factors: RiskFactor[];
  // Short phrases for tables ("> 500 attempts, high rate")
  reasons?: string[];
}

export interface NetworkClass {
  type: "private" | "loopback" | "link-local" | "public" | "invalid";
  label: string;
}

// Geo/ASN enrichment is not wired up yet on the backend (all null)
export interface GeoInfo {
  country_code: string | null;
  country_name: string | null;
  asn: number | null;
  as_org: string | null;
}

// Same rules as the backend (shared/risk-rules.js), for tables that only have the attempt count
export { RISK_THRESHOLDS };

export function volumeRisk(attempts: number): RiskAssessment {
  return assessRisk({ attempts }) as RiskAssessment;
}

/** Detail page route for an IP (IPv6 colons are encoded) */
export const ipDetailHref = (ip: string) => `/attack-logs/${encodeURIComponent(ip)}`;
