import { describe, expect, it } from "vitest";
import { MemoryCache, notModified } from "@/lib/cache";

const bytes = (n: number) => new Uint8Array(n);

describe("cache en mémoire", () => {
  it("retire les plus anciens au-delà du nombre ou du poids", () => {
    const c = new MemoryCache<Uint8Array>({ maxEntries: 2, maxBytes: 100, ttlMs: 1000, sizeOf: (b) => b.byteLength });
    c.set("a", bytes(10));
    c.set("b", bytes(10));
    c.get("a");
    c.set("c", bytes(10));
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBeDefined();
    c.set("lourd", bytes(95));
    expect(c.size).toEqual({ entries: 1, bytes: 95 });
    c.set("trop", bytes(101));
    expect(c.get("trop")).toBeUndefined();
  });

  it("oublie une entrée expirée et ne calcule qu'une fois", async () => {
    let now = 0;
    const c = new MemoryCache<string>({ maxEntries: 10, maxBytes: 1000, ttlMs: 50, sizeOf: (s) => s.length }, () => now);
    let calls = 0;
    const compute = async () => `v${++calls}`;
    expect(await c.remember("k", compute)).toBe("v1");
    expect(await c.remember("k", compute)).toBe("v1");
    now = 60;
    expect(await c.remember("k", compute)).toBe("v2");
    expect(c.hits).toBe(1);
    expect(c.size.bytes).toBe(2);
  });

  it("répond 304 quand le navigateur a déjà le fichier", () => {
    const req = (h?: string) => new Request("http://x/", { headers: h ? { "if-none-match": h } : {} });
    expect(notModified(req(), '"abc"', {})).toBeNull();
    expect(notModified(req('"autre"'), '"abc"', {})).toBeNull();
    const r = notModified(req('W/"abc", "x"'), '"abc"', { "cache-control": "private, no-cache" });
    expect(r?.status).toBe(304);
    expect(r?.headers.get("etag")).toBe('"abc"');
  });
});
