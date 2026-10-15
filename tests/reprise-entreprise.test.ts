import { beforeAll, describe, expect, it } from "vitest";
import { identifyingFragments, listingRef, revenueBand, staffBand } from "@/lib/business-takeover";
import type { Database } from "@/lib/db";
import {
  contactTransferListing,
  myTransferListing,
  publicTransferListing,
  publicTransferListings,
  publicTransferTrades,
  saveTransferListing,
  setTransferListingStatus,
} from "@/lib/services/business-takeover";
import type { Ctx } from "@/lib/services/context";
import { completeProfile, freshDb, signUp } from "./helpers";

const identity = {
  names: ["Carrelage Martin", "Martin Carrelage SARL"],
  siret: "73282932000074",
  phone: "04 72 00 00 00",
  email: "contact@martin.fr",
  street: "12 rue des Artisans",
};

describe("tranches et anonymat", () => {
  it("place le chiffre d'affaires moyen et l'effectif dans une tranche", () => {
    expect(revenueBand([])).toBe("");
    expect(revenueBand([0, 0, 0])).toBe("");
    expect(revenueBand([0, 180_000_00, 220_000_00])).toBe("100k-250k");
    expect(revenueBand([99_999_00])).toBe("moins-100k");
    expect(revenueBand([1_200_000_00])).toBe("plus-1m");
    expect(staffBand(0)).toBe("seul");
    expect(staffBand(1)).toBe("seul");
    expect(staffBand(4)).toBe("2-5");
    expect(staffBand(12)).toBe("plus-10");
  });

  it("repère tout ce qui trahirait l'identité du cédant", () => {
    expect(identifyingFragments("Entreprise de carrelage reconnue, clientèle fidèle de particuliers.", identity)).toEqual([]);
    expect(identifyingFragments("Reprenez Carrelage Martin, quarante ans de métier", identity)).toEqual(["le nom de l'entreprise"]);
    expect(identifyingFragments("SIREN 732 829 320", identity)).toContain("le numéro SIRET ou SIREN");
    expect(identifyingFragments("Appelez le 06 12 34 56 78", identity)).toContain("un numéro de téléphone");
    expect(identifyingFragments("Écrivez à cedant@exemple.fr", identity)).toContain("une adresse e-mail");
    expect(identifyingFragments("Voir www.mon-site.fr", identity)).toContain("une adresse de site");
    expect(identifyingFragments("Atelier situé rue des Artisans", identity)).toContain("l'adresse de l'entreprise");
    expect(listingRef("3f2a9c10-0000-4000-8000-000000000000")).toBe("R-3F2A9C");
  });
});

describe("annonce de reprise", () => {
  let db: Database;
  let seller: Ctx;
  let other: Ctx;
  let id: string;

  beforeAll(async () => {
    db = await freshDb();
    seller = await signUp(db, "cedant@reprise.fr", "Carrelage Martin");
    await completeProfile(seller);
    other = await signUp(db, "autre@reprise.fr", "Plomberie Roy");
  });

  it("refuse une annonce qui nomme l'entreprise et calcule les tranches", async () => {
    await expect(
      saveTransferListing(seller, {
        headline: "Carrelage Martin à reprendre",
        description: "Entreprise de carrelage installée depuis trente ans, clientèle fidèle.",
      }),
    ).rejects.toThrow(/anonyme.*nom de l'entreprise/);
    const l = await saveTransferListing(seller, {
      headline: "Entreprise de carrelage à reprendre près de Lyon",
      description: "Entreprise de carrelage installée depuis trente ans, clientèle fidèle de particuliers et de syndics.",
      reason: "retraite",
      accompanimentMonths: "6",
    });
    id = l.id;
    expect(l).toMatchObject({ status: "brouillon", department: "69", trade: "carrelage", staffBand: "seul", accompanimentMonths: 6, revenueBand: "" });
    expect(await publicTransferListing(db, id)).toBeNull();
  });

  it("publie l'annonce sans rien révéler de l'entreprise", async () => {
    await setTransferListingStatus(seller, "publiee");
    const list = await publicTransferListings(db);
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(/Martin|732829320|org_id/);
    expect(list[0].ref).toBe(listingRef(id));
    expect(await publicTransferListings(db, { department: "75" })).toHaveLength(0);
    expect(await publicTransferListings(db, { department: "69", trade: "Carrelage" })).toHaveLength(1);
    expect(await publicTransferTrades(db)).toEqual(["carrelage"]);
    const audit = await db.query("SELECT 1 FROM audit_logs WHERE action='transfer.publish' AND target=$1", [id]);
    expect(audit).toHaveLength(1);
  });

  it("transmet la prise de contact au cédant seul", async () => {
    await expect(
      contactTransferListing(db, id, { name: "Julie Repreneur", message: "Je cherche à reprendre une entreprise de carrelage." }, { ip: "10.0.0.1" }),
    ).rejects.toThrow(/téléphone ou une adresse/);
    await contactTransferListing(
      db,
      id,
      { name: "Julie Repreneur", email: "julie@exemple.fr", message: "Je cherche à reprendre une entreprise de carrelage." },
      { ip: "10.0.0.1" },
    );
    await contactTransferListing(
      db,
      id,
      { name: "Robot", email: "r@exemple.fr", message: "Message automatique sans intérêt aucun.", website: "x" },
      { ip: "10.0.0.2" },
    );
    const mine = await myTransferListing(seller);
    expect(mine.contacts.map((c) => c.name)).toEqual(["Julie Repreneur"]);
    const mails = await db.query<{ subject: string }>("SELECT subject FROM emails WHERE kind='notification' AND subject LIKE '%repreneur%'");
    expect(mails).toHaveLength(1);
    expect((await myTransferListing(other)).listing).toBeNull();
  });

  it("retire l'annonce : elle disparaît et ne reçoit plus de contact", async () => {
    await setTransferListingStatus(seller, "retiree");
    expect(await publicTransferListings(db)).toHaveLength(0);
    await expect(
      contactTransferListing(db, id, { name: "Marc", phone: "0611223344", message: "Toujours disponible pour une reprise ?" }, { ip: "10.0.0.3" }),
    ).rejects.toThrow(/introuvable/);
  });
});
