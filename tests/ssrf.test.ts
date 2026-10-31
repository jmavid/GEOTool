import { afterEach, describe, expect, it, vi } from "vitest";
import { assertResolvesPublic, safeFetch } from "@/lib/security/safe-fetch";

const resolver = (map: Record<string, string[]>) => async (host: string) => map[host] ?? [];

afterEach(() => vi.unstubAllGlobals());

describe("DNS-level SSRF protection", () => {
  it("allows hosts that resolve only to public IPs", async () => {
    await expect(assertResolvesPublic("good.com", resolver({ "good.com": ["93.184.216.34"] }))).resolves.toBeUndefined();
  });

  it("blocks hosts that resolve to private, loopback or metadata IPs (DNS rebinding style)", async () => {
    for (const ip of ["127.0.0.1", "10.0.0.8", "169.254.169.254", "::1", "::ffff:192.168.1.1"]) {
      await expect(assertResolvesPublic("evil.com", resolver({ "evil.com": ["93.184.216.34", ip] }))).rejects.toThrow(/private/);
    }
  });

  it("blocks hosts that don't resolve", async () => {
    await expect(assertResolvesPublic("nx.com", resolver({}))).rejects.toThrow();
  });

  it("re-validates every redirect hop and refuses redirects to internal addresses", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetch("https://good.com", {}, resolver({ "good.com": ["93.184.216.34"] }))).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses redirects to hosts that resolve privately", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 301, headers: { location: "https://rebind.com/" } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = resolver({ "good.com": ["93.184.216.34"], "rebind.com": ["10.0.0.1"] });
    await expect(safeFetch("https://good.com", {}, res)).rejects.toThrow(/private/);
  });

  it("caps the downloaded size", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(5000), { status: 200, headers: { "content-type": "text/html" } })));
    const r = await safeFetch("https://good.com", { maxBytes: 1000 }, resolver({ "good.com": ["93.184.216.34"] }));
    expect(r.body.length).toBe(1000);
    expect(r.truncated).toBe(true);
  });
});
