const net = require("net");

/**
 * Classify an IP so the UI can label private ranges instead of pretending to geolocate them.
 * Private = RFC 1918 (IPv4) / RFC 4193 unique local (IPv6); loopback and link-local are reported separately.
 * @param {string} ip
 * @returns {{ type: "private" | "loopback" | "link-local" | "public" | "invalid", label: string }}
 */
const classifyIp = (ip) => {
  const version = net.isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return { type: "private", label: "Private network" };
    }
    if (a === 127) return { type: "loopback", label: "Loopback" };
    if (a === 169 && b === 254) return { type: "link-local", label: "Link-local" };
    return { type: "public", label: "Public" };
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return { type: "loopback", label: "Loopback" };
    if (/^f[cd]/.test(lower)) return { type: "private", label: "Private network" };
    if (/^fe[89ab]/.test(lower)) return { type: "link-local", label: "Link-local" };
    return { type: "public", label: "Public" };
  }
  return { type: "invalid", label: "Invalid address" };
};

/**
 * Geolocation / ASN enrichment.
 * TODO: back this with a local GeoLite2-City + GeoLite2-ASN database (or an enrichment API)
 * and cache results per IP. Until then every field is null and the UI shows "—".
 */
const lookupGeo = (_ip) => ({
  country_code: null,
  country_name: null,
  asn: null,
  as_org: null,
});

module.exports = { classifyIp, lookupGeo };
