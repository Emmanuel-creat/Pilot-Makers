import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { addVaultFile, deleteVaultFile, listVaultFiles, vaultCipher } from "@/lib/services/vault";
import { envelopeIssue, openFile, openName, passphraseIssue, sealFile } from "@/lib/vault";
import { freshDb, signUp } from "./helpers";

const PASS = "le chantier de la rue des Lilas";
const secret = new TextEncoder().encode("Contrat de travail de Paul, salaire 2 400 euros");

describe("coffre chiffré : chiffrement dans le navigateur", () => {
  it("chiffre contenu et nom, et ne rouvre qu'avec la bonne phrase", async () => {
    const { envelope, cipher } = await sealFile(PASS, { name: "contrat-paul.pdf", type: "application/pdf", bytes: secret });
    expect(envelopeIssue(envelope)).toBeNull();
    expect(new TextDecoder().decode(cipher)).not.toContain("salaire");
    expect(JSON.stringify(envelope)).not.toContain("contrat");
    expect(await openName(PASS, envelope)).toEqual({ name: "contrat-paul.pdf", type: "application/pdf" });
    expect(new TextDecoder().decode((await openFile(PASS, envelope, cipher))!)).toBe(new TextDecoder().decode(secret));
    expect(await openName("une autre phrase secrète", envelope)).toBeNull();
    expect(await openFile("une autre phrase secrète", envelope, cipher)).toBeNull();
    const tampered = cipher.slice();
    tampered[0] ^= 1;
    expect(await openFile(PASS, envelope, tampered)).toBeNull();
  }, 20_000);

  it("refuse les phrases faibles et les enveloppes mal formées", () => {
    expect(passphraseIssue("court")).toContain("trop courte");
    expect(passphraseIssue("aaaaaaaaaaaaaa")).toContain("trop simple");
    expect(passphraseIssue(PASS)).toBeNull();
    expect(envelopeIssue(null)).toBe("Enveloppe manquante");
    expect(envelopeIssue({ salt: "AAAA", iv: "", nameIv: "", name: "" })).toBe("Sel invalide");
  });
});

describe("coffre chiffré : rangement côté serveur", () => {
  let db: Database;
  let alice: Ctx;
  let bob: Ctx;
  beforeAll(async () => {
    db = await freshDb();
    alice = await signUp(db, "alice-coffre@exemple.fr");
    bob = await signUp(db, "bob-coffre@exemple.fr", "Plomberie Bob");
  });

  it("range le contenu chiffré tel quel, sans jamais le lire", async () => {
    const { envelope, cipher } = await sealFile(PASS, { name: "carte-identite.jpg", type: "image/jpeg", bytes: secret });
    await expect(addVaultFile(alice, { ...envelope, salt: "x" }, cipher)).rejects.toMatchObject({ status: 400 });
    await expect(addVaultFile(alice, envelope, new Uint8Array(4))).rejects.toMatchObject({ status: 400 });
    const id = await addVaultFile(alice, envelope, cipher);
    const [stored] = await db.query<{ data: Uint8Array }>("SELECT data FROM stored_files");
    expect(Buffer.from(stored.data).toString("utf8")).not.toContain("salaire");
    const list = await listVaultFiles(alice);
    expect(list).toHaveLength(1);
    expect(list[0].envelope).toEqual(envelope);
    const back = await vaultCipher(alice, id);
    expect(await openFile(PASS, list[0].envelope, back)).toEqual(secret);

    expect(await listVaultFiles(bob)).toEqual([]);
    await expect(vaultCipher(bob, id)).rejects.toMatchObject({ status: 404 });
    await expect(deleteVaultFile(bob, id)).rejects.toMatchObject({ status: 404 });

    await deleteVaultFile(alice, id);
    expect(await listVaultFiles(alice)).toEqual([]);
    expect(await db.query("SELECT 1 FROM stored_files")).toHaveLength(0);
  }, 20_000);
});
