import ipaddr from "ipaddr.js";

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValidationError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".home.arpa",
  ".localdomain",
  ".svc",
  ".cluster.local",
  ".test",
  ".invalid",
  ".example",
];

// Cloud metadata endpoints that are not covered by a generic range below.
const BLOCKED_IPS = new Set(["169.254.169.254", "169.254.170.2", "100.100.100.200", "192.0.0.192", "fd00:ec2::254"]);

const ALLOWED_PORTS = new Set(["", "80", "443"]);

/** True only for globally routable unicast addresses. */
export function isPublicIp(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let ip = ipaddr.parse(address);
  if (ip.kind() === "ipv6") {
    const v6 = ip as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) ip = v6.toIPv4Address();
  }
  if (BLOCKED_IPS.has(ip.toString())) return false;
  // ipaddr.js classifies private, loopback, linkLocal (169.254/16), carrierGradeNat,
  // uniqueLocal, multicast, reserved, 6to4/teredo, etc. Only "unicast" is public.
  return ip.range() === "unicast";
}

function isIpLiteral(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "");
  return ipaddr.isValid(h);
}

/**
 * Normalizes user input into a safe http(s) URL. Does not resolve DNS:
 * resolution is checked again at connect time by safeFetch (anti DNS-rebinding).
 */
export function validatePublicUrl(input: string): URL {
  const raw = (input ?? "").trim();
  if (!raw) throw new UrlValidationError("Enter a website URL.");
  if (raw.length > 2048) throw new UrlValidationError("URL is too long.");
  if (/[\s<>"`{}|\\^]/.test(raw)) throw new UrlValidationError("URL contains invalid characters.");

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UrlValidationError("That doesn't look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlValidationError("Only http and https URLs are allowed.");
  }
  if (url.username || url.password) throw new UrlValidationError("URLs with credentials are not allowed.");
  if (!ALLOWED_PORTS.has(url.port)) throw new UrlValidationError("Custom ports are not allowed.");

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname) throw new UrlValidationError("Missing hostname.");

  if (isIpLiteral(hostname)) {
    // WHATWG URL already turns 0x7f.1, 2130706433 etc. into dotted IPv4, so this catches those too.
    throw new UrlValidationError("Enter a domain name, not an IP address.");
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new UrlValidationError("That address is not allowed.");
  }
  if (!hostname.includes(".")) throw new UrlValidationError("Enter a full domain, like example.com.");
  if (!/^[a-z0-9.-]+$/.test(hostname)) throw new UrlValidationError("Invalid domain name.");
  const tld = hostname.split(".").pop()!;
  if (!/^(xn--[a-z0-9-]+|[a-z]{2,63})$/.test(tld)) throw new UrlValidationError("Invalid top-level domain.");

  url.hostname = hostname;
  url.hash = "";
  return url;
}

/** Canonical key used to dedupe websites: origin + path without trailing slash, no query. */
export function canonicalWebsiteUrl(url: URL): string {
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  return `https://${host}${path}`;
}

export function registrableLabel(hostname: string): string {
  const parts = hostname.replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts[0];
  // Handle common second-level TLDs: example.co.uk, example.com.br
  const sld = parts[parts.length - 2];
  if (["co", "com", "org", "net", "gov", "edu", "ac"].includes(sld) && parts[parts.length - 1].length === 2) {
    return parts[parts.length - 3];
  }
  return parts[parts.length - 2];
}
