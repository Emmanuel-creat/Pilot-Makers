import { createServer, type Server } from "node:net";
import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it } from "vitest";
import { builtInScan, clamdScan, scanFile } from "@/lib/file-scan";
import { createItem } from "@/lib/services/catalog";
import { addCatalogDocument } from "@/lib/services/datasheets";
import { freshDb, signUp } from "./helpers";
import { grayPng } from "./png";

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const enc = (s: string) => new TextEncoder().encode(s);

async function pdf(js = false) {
  const d = await PDFDocument.create();
  d.addPage().drawText("Fiche technique", { x: 50, y: 700 });
  if (js) d.addJavaScript("ouverture", "app.alert('bonjour');");
  return d.save();
}

let server: Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

/** Faux ClamAV : lit le flux INSTREAM et répond selon son contenu. */
function fakeClamd(): Promise<number> {
  return new Promise((resolve) => {
    server = createServer((sock) => {
      let data = Buffer.alloc(0);
      sock.on("data", (d) => {
        data = Buffer.concat([data, d]);
        if (data.subarray(-4).equals(Buffer.alloc(4))) {
          sock.end(data.includes("VIRUS-DE-TEST") ? "stream: Test.Signature FOUND\0" : "stream: OK\0");
        }
      });
    }).listen(0, "127.0.0.1", () => resolve((server!.address() as { port: number }).port));
  });
}

describe("analyse des fichiers déposés", () => {
  it("repère le fichier de test, les PDF actifs et les images qui cachent du code", async () => {
    expect(builtInScan(enc(`%PDF-1.4 ${EICAR}`))).toMatchObject({ clean: false, threat: expect.stringContaining("EICAR") });
    expect(builtInScan(await pdf())).toMatchObject({ clean: true });
    // Le JavaScript est rangé dans un flux d'objets compressé : il est trouvé après décompression.
    expect(builtInScan(await pdf(true))).toMatchObject({ clean: false, threat: "PDF contenant du JavaScript" });
    expect(builtInScan(enc("%PDF-1.7\n1 0 obj << /S /Launch /F (calc.exe) >> endobj"))).toMatchObject({ clean: false });
    expect(builtInScan(enc("%PDF-1.7\n<< /EmbeddedFiles 3 0 R >> (programme.exe)"))).toMatchObject({ clean: false });
    expect(builtInScan(enc("%PDF-1.7\n<< /EmbeddedFiles 3 0 R >> (factur-x.xml)"))).toMatchObject({ clean: true });
    const png = grayPng();
    expect(builtInScan(png)).toMatchObject({ clean: true });
    expect(builtInScan(Buffer.concat([png, Buffer.from("<?php system($_GET['c']); ?>")]))).toMatchObject({ clean: false, threat: "image contenant du code" });
  });

  it("interroge ClamAV quand il est configuré", async () => {
    const port = await fakeClamd();
    expect(await clamdScan(enc("contenu sain"), "127.0.0.1", port)).toEqual({ clean: true, engine: "ClamAV" });
    expect(await scanFile(enc("VIRUS-DE-TEST"), { CLAMD_HOST: "127.0.0.1", CLAMD_PORT: String(port) })).toEqual({
      clean: false,
      engine: "ClamAV",
      threat: "Test.Signature",
    });
  });

  it("accepte sans ClamAV joignable, sauf si son analyse est exigée", async () => {
    const env = { CLAMD_HOST: "127.0.0.1", CLAMD_PORT: "1" };
    expect(await scanFile(enc("x"), env)).toMatchObject({ clean: true, engine: "contrôles intégrés" });
    await expect(scanFile(enc("x"), { ...env, CLAMD_REQUIRED: "1" })).rejects.toMatchObject({ status: 503 });
  });

  it("refuse le dépôt et le note au journal", async () => {
    const db = await freshDb();
    const ctx = await signUp(db, "analyse@exemple.fr");
    const item = await createItem(ctx, { name: "Isolant", category: "materiau", vat_percent: "20", unit: "m²", unit_price: "10" });
    await expect(addCatalogDocument(ctx, item, { kind: "fiche_technique", title: "Fiche" }, await pdf(true))).rejects.toThrow("analyse de sécurité");
    const log = await db.query<{ action: string }>("SELECT action FROM audit_logs WHERE action='file.rejected'");
    expect(log).toHaveLength(1);
  });
});
