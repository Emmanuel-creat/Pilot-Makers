import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { encryptPayload, generateVapidKeys, vapidAuthorization } from "@/lib/web-push";
import { listPushDevices, notifyOrg, pushJobHandler, PUSH_JOB, subscribePush, testPush, vapidKeys } from "@/lib/services/push";
import { runJobs } from "@/lib/services/task-queue";
import { freshDb, signUp } from "./helpers";

/** Appareil simulé : ses clés, et le déchiffrement côté navigateur (RFC 8291). */
function device() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    sub: { endpoint: "https://push.exemple.fr/abc", p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    decrypt(body: Buffer) {
      const salt = body.subarray(0, 16);
      const idlen = body[20];
      const asPublic = body.subarray(21, 21 + idlen);
      const data = body.subarray(21 + idlen);
      const shared = ecdh.computeSecret(asPublic);
      const ikm = Buffer.from(hkdfSync("sha256", shared, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), asPublic]), 32));
      const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
      const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
      const d = createDecipheriv("aes-128-gcm", cek, nonce);
      d.setAuthTag(data.subarray(-16));
      const plain = Buffer.concat([d.update(data.subarray(0, -16)), d.final()]);
      expect(plain[plain.length - 1]).toBe(2);
      return plain.subarray(0, -1).toString("utf8");
    },
  };
}

describe("Web Push", () => {
  it("chiffre le message pour le seul appareil abonné", () => {
    const d = device();
    const body = encryptPayload(d.sub, '{"title":"Devis accepté"}');
    expect(body.readUInt32BE(16)).toBe(4096);
    expect(d.decrypt(body)).toBe('{"title":"Devis accepté"}');
    expect(() => device().decrypt(body)).toThrow();
  });

  it("signe le jeton VAPID pour le service de notifications visé", () => {
    const keys = generateVapidKeys();
    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/xyz", keys, "mailto:a@b.fr", 1_000_000);
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(keys.publicKey);
    const [h, c, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ aud: "https://fcm.googleapis.com", exp: 1000 + 43200, sub: "mailto:a@b.fr" });
    const pub = Buffer.from(keys.publicKey, "base64url");
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") }, format: "jwk" });
    expect(verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
  });
});

describe("notifications de l'entreprise", () => {
  it("garde les mêmes clés, envoie par la file de tâches et oublie un appareil désabonné", async () => {
    const db = await freshDb();
    const ctx = await signUp(db, "push@exemple.fr");
    const k1 = await vapidKeys(db);
    expect(await vapidKeys(db)).toEqual(k1);

    const d = device();
    await subscribePush(ctx, { endpoint: d.sub.endpoint, keys: { p256dh: d.sub.p256dh, auth: d.sub.auth } }, "Chrome sur Android");
    await expect(subscribePush(ctx, { endpoint: "http://non-chiffre.fr/x", keys: { p256dh: d.sub.p256dh, auth: d.sub.auth } })).rejects.toMatchObject({ status: 400 });
    expect(await notifyOrg(db, ctx.orgId, { title: "Devis D-1 accepté", body: "Mme Dubois a accepté le devis en ligne.", url: "/app/devis/1" })).toBe(1);

    const received: unknown[] = [];
    const ok = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      received.push(JSON.parse(d.decrypt(Buffer.from(init!.body as Uint8Array))));
      return new Response(null, { status: 201 });
    });
    expect(await runJobs(db, { [PUSH_JOB]: pushJobHandler(ok as typeof fetch) })).toMatchObject({ done: 1 });
    expect(received).toEqual([{ title: "Devis D-1 accepté", body: "Mme Dubois a accepté le devis en ligne.", url: "/app/devis/1" }]);
    expect((await listPushDevices(ctx))[0].lastSuccessAt).not.toBeNull();

    await testPush(ctx);
    const gone = vi.fn(async () => new Response(null, { status: 410 }));
    await runJobs(db, { [PUSH_JOB]: pushJobHandler(gone as typeof fetch) });
    expect(await listPushDevices(ctx)).toHaveLength(0);
  });
});
