import { describe, expect, it } from "vitest";
import { presignUrl, signRequest, uriEncode, type S3Config } from "@/lib/storage/sigv4";

// Exemples officiels de la documentation AWS (Signature Version 4 pour S3) : clés publiques, inutilisables.
const AWS: S3Config = {
  host: "s3.amazonaws.com",
  region: "us-east-1",
  bucket: "examplebucket",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE", // secret-factice : clé d'exemple publique de la documentation AWS
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};
const NOW = new Date("2013-05-24T00:00:00Z");

describe("stockage objet compatible S3 : signature AWS v4", () => {
  it("lien signé identique à l'exemple de la documentation", () => {
    const url = presignUrl(AWS, "test.txt", { expiresSec: 86400, now: NOW });
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404", // secret-factice : clé d'exemple publique de la documentation AWS
    );
  });

  it("en-tête d'autorisation identique à l'exemple de lecture partielle", () => {
    const r = signRequest(AWS, "GET", "test.txt", { headers: { Range: "bytes=0-9" }, now: NOW });
    expect(r.url).toBe("https://examplebucket.s3.amazonaws.com/test.txt");
    expect(r.headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41", // secret-factice : clé d'exemple publique de la documentation AWS
    );
    expect(r.headers["x-amz-date"]).toBe("20130524T000000Z");
  });

  it("encode les clés et gère les adresses de la forme hôte/bucket", () => {
    expect(uriEncode("org/photo été.jpg", true)).toBe("org/photo%20%C3%A9t%C3%A9.jpg");
    const url = presignUrl({ ...AWS, host: "localhost:9000", pathStyle: true, protocol: "http" }, "a/b.pdf", { expiresSec: 9_999_999, now: NOW });
    expect(url.startsWith("http://localhost:9000/examplebucket/a/b.pdf?")).toBe(true);
    expect(url).toContain("X-Amz-Expires=604800");
  });
});

describe("stockage des fichiers", () => {
  it("range en base et lit par un lien signé à durée limitée", async () => {
    const { freshDb } = await import("./helpers");
    const { dbStore, verifyFileLink } = await import("@/lib/storage");
    const db = await freshDb();
    const store = dbStore(db);
    await store.put("org1/logo.png", new Uint8Array([1, 2, 3]), "image/png");
    expect(await store.get("org1/logo.png")).toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" });
    const now = new Date("2026-10-15T10:00:00Z");
    const u = new URL(store.signedUrl("org1/logo.png", 600, now));
    expect(u.pathname).toBe("/api/fichiers/org1/logo.png");
    const exp = u.searchParams.get("exp");
    const sig = u.searchParams.get("sig");
    expect(verifyFileLink("org1/logo.png", exp, sig, now)).toBe(true);
    expect(verifyFileLink("org1/logo.png", exp, sig, new Date(now.getTime() + 601_000))).toBe(false);
    expect(verifyFileLink("org2/logo.png", exp, sig, now)).toBe(false);
    expect(verifyFileLink("org1/logo.png", String(Number(exp) + 3600), sig, now)).toBe(false);
    await store.remove("org1/logo.png");
    expect(await store.get("org1/logo.png")).toBeNull();
    await expect(store.put("../secret", new Uint8Array(), "text/plain")).rejects.toMatchObject({ status: 400 });
    await expect(store.get("a//b")).rejects.toMatchObject({ status: 400 });
  });

  it("envoie au stockage objet des requêtes signées", async () => {
    const { s3Store, s3ConfigFromEnv } = await import("@/lib/storage");
    const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, method: String(init.method), headers: init.headers as Record<string, string> });
      return init.method === "GET"
        ? new Response(new Uint8Array([9]), { headers: { "content-type": "application/pdf" } })
        : new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const store = s3Store(AWS, fake);
    await store.put("org1/devis.pdf", new Uint8Array([9]), "application/pdf");
    expect((await store.get("org1/devis.pdf"))?.contentType).toBe("application/pdf");
    await store.remove("org1/devis.pdf");
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["PUT", "https://examplebucket.s3.amazonaws.com/org1/devis.pdf"],
      ["GET", "https://examplebucket.s3.amazonaws.com/org1/devis.pdf"],
      ["DELETE", "https://examplebucket.s3.amazonaws.com/org1/devis.pdf"],
    ]);
    expect(calls[0].headers.authorization).toMatch(/SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/);
    expect(store.signedUrl("org1/devis.pdf", 300)).toContain("X-Amz-Expires=300");
    expect(s3ConfigFromEnv({})).toBeNull();
    expect(() => s3ConfigFromEnv({ STORAGE_DRIVER: "s3", S3_HOST: "s3.fr-par.scw.cloud" })).toThrow(/S3_REGION/);
  });
});
