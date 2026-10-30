import ReactCountryFlag from "react-country-flag";
import type { GeoInfo, NetworkClass } from "@/lib/attack-types";

/**
 * Country + ASN for a source. Private / loopback ranges are labelled as such
 * (they cannot be geolocated); public IPs show "—" until geo enrichment exists.
 * `compact` renders one muted line for use under an IP in dense tables.
 */
export function SourceNetwork({ network, geo, compact = false }: { network: NetworkClass; geo: GeoInfo; compact?: boolean }) {
  if (network.type !== "public") {
    return <span className={compact ? "block text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>{network.label}</span>;
  }

  const country = geo.country_code ? (
    <>
      <ReactCountryFlag countryCode={geo.country_code} svg aria-hidden style={{ width: "1.1em", height: "1.1em" }} />
      {geo.country_name ?? geo.country_code}
    </>
  ) : (
    <span title="Geolocation not available yet">{"—"}</span>
  );
  const asn = geo.asn ? `AS${geo.asn}${geo.as_org ? ` · ${geo.as_org}` : ""}` : "ASN —";

  if (compact) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {country}
        <span aria-hidden>·</span>
        <span className="font-mono">{asn}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col text-sm">
      <span className="flex items-center gap-1.5 text-foreground">{country}</span>
      <span className="font-mono text-xs text-muted-foreground">{asn}</span>
    </div>
  );
}
