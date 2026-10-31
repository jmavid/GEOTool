import { describe, expect, it } from "vitest";
import { canonicalWebsiteUrl, isPublicIp, validatePublicUrl } from "@/lib/security/url";

describe("validatePublicUrl", () => {
  it("accepts normal domains and adds https", () => {
    expect(validatePublicUrl("example.com").toString()).toBe("https://example.com/");
    expect(validatePublicUrl(" https://www.Example.co.uk/pricing?x=1#top ").toString()).toBe("https://www.example.co.uk/pricing?x=1");
    expect(validatePublicUrl("http://xn--bcher-kva.de").hostname).toBe("xn--bcher-kva.de");
  });

  it.each([
    "",
    "ftp://example.com",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "gopher://example.com",
    "https://user:pass@example.com",
    "https://example.com:8080",
    "localhost",
    "http://localhost:3000",
    "http://foo.localhost",
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f.0.0.1",
    "http://[::1]",
    "http://10.0.0.5",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://printer.local",
    "http://intranet",
    "https://exa mple.com",
  ])("rejects %s", (input) => {
    expect(() => validatePublicUrl(input)).toThrow();
  });

  it("builds a canonical key without www, trailing slash or query", () => {
    expect(canonicalWebsiteUrl(validatePublicUrl("https://www.acme.com/?utm=1"))).toBe("https://acme.com");
    expect(canonicalWebsiteUrl(validatePublicUrl("acme.com/es/"))).toBe("https://acme.com/es");
  });
});

describe("isPublicIp", () => {
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("%s is public", (ip) => expect(isPublicIp(ip)).toBe(true));
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.100.100.200",
    "0.0.0.0",
    "255.255.255.255",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fd00:ec2::254",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "not-an-ip",
  ])("%s is blocked", (ip) => expect(isPublicIp(ip)).toBe(false));
});
