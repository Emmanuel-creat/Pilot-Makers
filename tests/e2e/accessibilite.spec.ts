import AxeBuilder from "@axe-core/playwright";
import { PDFDocument } from "pdf-lib";
import { expect, test, type Page } from "@playwright/test";

/**
 * Accessibilité (RGAA, WCAG 2.2 niveau AA) : analyse automatique des écrans principaux.
 * Les défauts graves ou critiques font échouer le test. L'analyse automatique ne couvre
 * qu'une partie des critères : un audit manuel reste nécessaire.
 */

async function login(page: Page) {
  await page.goto("/connexion");
  await page.locator("#email").fill("demo@pilot-makers.fr");
  await page.locator("#password").fill("Demo2026Pilot");
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/app(\/|$)/);
}

async function audit(page: Page, label: string) {
  // Après une action serveur, le titre de la page est réécrit : l'analyse attend qu'il soit en place.
  await expect(page).toHaveTitle(/\S/);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = serious.map(
    (v) =>
      `${v.id} (${v.impact}) : ${v.help} -> ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
  expect(report, `${label}\n${report.join("\n")}`).toEqual([]);
}

test("pages publiques", async ({ page }) => {
  for (const path of ["/", "/connexion", "/inscription", "/aide", "/aide/creer-un-devis", "/cgu", "/statut"]) {
    await page.goto(path);
    await audit(page, path);
  }
});

test("écrans de l'application", async ({ page }) => {
  await login(page);
  for (const path of [
    "/app",
    "/app/devis",
    "/app/clients",
    "/app/demandes",
    "/app/rapports",
    "/app/catalogue",
    "/app/factures",
    "/app/chantiers",
    "/app/planning",
    "/app/planning?vue=mois",
    "/app/pointage",
    "/app/pointage?vue=equipe",
    "/app/equipe",
    "/app/entreprise",
    "/app/entreprise?onglet=tarifs",
    "/app/entreprise?onglet=webhooks",
    "/app/nouveautes",
    "/app/compte",
    "/app/assistance",
  ]) {
    await page.goto(path);
    await audit(page, path);
  }
  await page.goto("/app/devis");
  await page.locator("a:visible", { hasText: "Rénovation de salle de bains" }).first().click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await audit(page, "fiche devis");
  await page.goto("/app/devis/nouveau");
  await audit(page, "nouveau devis");
});

test("réglages d'affichage : texte agrandi, contraste renforcé, thème sombre", async ({ page }) => {
  await login(page);
  await page.goto("/app/compte");
  const base = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  await page.getByLabel("Très grande", { exact: true }).check();
  await page.getByLabel(/Renforcé/).check();
  await page.getByLabel("Sombre", { exact: true }).check();
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-text", "xl");
  await expect(html).toHaveAttribute("data-contrast", "high");
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeCloseTo(base * 1.25, 1);
  // Les réglages tiennent d'une page à l'autre et restent accessibles.
  for (const path of ["/app", "/app/factures"]) {
    await page.goto(path);
    await expect(html).toHaveAttribute("data-text", "xl");
    await audit(page, `${path} en affichage renforcé`);
  }
  await page.goto("/app/compte");
  await page.getByLabel("Normale", { exact: true }).check();
  await page.getByLabel("Standard", { exact: true }).check();
  await page.getByLabel("Comme l'appareil", { exact: true }).check();
  await expect(html).not.toHaveAttribute("data-text", /./);
});

test("application installable : manifeste, icônes et page hors ligne", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/app");
  for (const icon of manifest.icons.filter((i: { type: string }) => i.type === "image/png")) {
    const r = await request.get(icon.src);
    expect(r.ok(), icon.src).toBe(true);
  }
  expect((await request.get("/sw.js")).ok()).toBe(true);
  await page.goto("/hors-ligne");
  await expect(page.getByRole("heading", { name: "Pas de connexion" })).toBeVisible();
  await audit(page, "/hors-ligne");
});

test("suivi de chantier : avancement d'une tâche", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await audit(page, "fiche chantier");
  const third = page.locator("form[aria-label^='Avancement de']").nth(2);
  await third.getByRole("button", { name: "75 %" }).click();
  await expect(third.getByRole("button", { name: "75 %" })).toHaveAttribute("aria-pressed", "true");
});

test("chantier : journal et procès-verbal de réception signé à l'écran", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await page.locator("#journal-note").fill("Étanchéité posée, séchage 24 h");
  await page.getByLabel("Enregistrer la position").uncheck();
  await page.getByRole("button", { name: "Ajouter au journal" }).click();
  await expect(page.getByText("Étanchéité posée, séchage 24 h")).toBeVisible();

  await page.getByLabel("Réception avec réserves").check();
  await page.getByLabel("Réserve 1", { exact: true }).fill("Joint de la bonde à reprendre");
  for (const label of ["Signature du client : signez dans ce cadre", "Signature de l'entreprise : signez dans ce cadre"]) {
    const pad = page.getByRole("img", { name: label });
    await pad.scrollIntoViewIfNeeded();
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 8 });
    await page.mouse.move(box.x + 200, box.y + 40, { steps: 8 });
    await page.mouse.up();
  }
  await audit(page, "fiche chantier avant réception");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Signer le procès-verbal" }).click();
  await expect(page.getByRole("link", { name: "Procès-verbal signé (PDF)" })).toBeVisible();
  await page.getByLabel("Commentaire de levée : Joint de la bonde à reprendre").fill("Joint refait");
  await page.getByRole("button", { name: "Lever" }).click();
  await expect(page.getByRole("link", { name: "Procès-verbal de levée des réserves" })).toBeVisible();
  await audit(page, "fiche chantier après réception");
});

test("planning : glisser une affectation vers un autre jour", async ({ page }) => {
  await login(page);
  await page.goto("/app/planning");
  const block = page.locator("td [draggable=true]", { hasText: "Douche à l'italienne" }).first();
  await expect(block).toBeVisible();
  const row = page.locator("tr", { has: page.getByRole("rowheader", { name: /Fourgon/ }) });
  const target = row.locator("td").nth(4);
  await block.dragTo(target);
  await expect(page.getByText("Déplacé", { exact: false }).first()).toBeVisible();
  await expect(row.locator("td").nth(4).locator("[draggable=true]")).toHaveCount(1);
});

test("import du catalogue depuis un fichier d'un autre logiciel", async ({ page }) => {
  await login(page);
  await page.goto("/app/catalogue/import");
  await audit(page, "import du catalogue");
  // Export Excel français : encodage Windows-1252, où l'euro est l'octet 0x80.
  const csv = Buffer.concat([
    Buffer.from("Désignation;Unité;Prix unitaire HT;Taux de TVA\nDépose de cloison test;m²;18,00 ", "latin1"),
    Buffer.from([0x80]),
    Buffer.from(";10 %\n", "latin1"),
  ]);
  await page.locator("input[type=file]").setInputFiles({ name: "export.csv", mimeType: "text/csv", buffer: csv });
  await expect(page.getByText("Prêt à importer")).toBeVisible();
  await page.getByRole("button", { name: "Importer 1 ligne(s)" }).click();
  await expect(page.getByText("1 ligne(s) importée(s)")).toBeVisible();
});

test("import de clients : colonnes inconnues désignées à la main", async ({ page }) => {
  await login(page);
  await page.goto("/app/clients/import");
  const csv = Buffer.from("Ident;Intitulé client;Joignable au;Remarque libre\nC001;Lefèvre Import;0612345678;client fidèle\n", "utf8");
  await page.locator("input[type=file]").setInputFiles({ name: "ancien-logiciel.csv", mimeType: "text/csv", buffer: csv });
  // Aucune colonne reconnue : l'écran de correspondance s'ouvre avec un exemple de chaque colonne.
  await expect(page.getByText("ex. Lefèvre Import")).toBeVisible();
  await audit(page, "correspondance des colonnes");
  await page.getByLabel(/Intitulé client/).selectOption("last_name");
  await page.getByLabel(/Joignable au/).selectOption("phone");
  await expect(page.getByText("Prêt à importer")).toBeVisible();
  await page.getByRole("button", { name: "Importer 1 ligne(s)" }).click();
  await expect(page.getByText("1 ligne(s) importée(s)")).toBeVisible();
  await page.goto("/app/clients?q=Lef%C3%A8vre%20Import");
  await expect(page.getByText("Lefèvre Import").first()).toBeVisible();
});

test("API publique : clé créée à l'écran puis utilisée", async ({ page, request }) => {
  await login(page);
  await page.goto("/app/entreprise?onglet=api");
  await audit(page, "onglet API");
  await page.getByLabel("Nom de la clé").fill("Essai navigateur");
  await page.getByRole("button", { name: "Créer la clé" }).click();
  const key = (await page.locator(".select-all").first().textContent())!.trim();
  expect(key).toMatch(/^pm_/);
  expect((await request.get("/api/v1/me")).status()).toBe(401);
  const me = await request.get("/api/v1/me", { headers: { authorization: `Bearer ${key}` } });
  expect(me.status()).toBe(200);
  expect((await me.json()).scopes).toEqual(["read"]);
  const customers = await request.get("/api/v1/customers?limit=2", { headers: { authorization: `Bearer ${key}` } });
  expect((await customers.json()).data.length).toBeGreaterThan(0);
  const write = await request.post("/api/v1/customers", { headers: { authorization: `Bearer ${key}` }, data: { last_name: "Essai" } });
  expect(write.status()).toBe(403);
  expect((await (await request.get("/api/v1/openapi.json")).json()).openapi).toBe("3.1.0");
});

test("pointage : chronomètre sur un chantier puis validation par l'encadrement", async ({ page }) => {
  await login(page);
  await page.goto("/app/pointage");
  await page.getByLabel("Enregistrer la position au départ").uncheck();
  await page.getByRole("button", { name: "Commencer" }).click();
  await expect(page.getByText("Pointage en cours depuis")).toBeVisible();
  await audit(page, "pointage en cours");
  await page.getByLabel("Note (facultative)").fill("Joints de la douche");
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByText("Joints de la douche").first()).toBeVisible();
  await page.goto("/app/pointage?vue=equipe");
  await page.getByRole("button", { name: /Tout cocher à valider/ }).click();
  await page.getByRole("button", { name: /^Valider/ }).click();
  await expect(page.getByText(/pointage\(s\) validé\(s\)/)).toBeVisible();
  const csv = await page.request.get(`/api/timesheets/export?mois=${new Date().toISOString().slice(0, 7)}`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("heures_sup_25");
});

test("chantier : achat affecté et comparaison des coûts", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Coûts et marge" })).toBeVisible();
  await page.getByLabel("Achat", { exact: true }).fill("Natte d'étanchéité");
  await page.getByLabel("Montant HT (euros)").fill("86,40");
  await page.getByRole("button", { name: "Ajouter l'achat" }).click();
  await expect(page.getByText("Natte d'étanchéité")).toBeVisible();
  await page.getByText("Détail ligne par ligne").click();
  await audit(page, "coûts du chantier");
});

test("chantier : commande fournisseur, réception et rapprochement de la facture", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Commandes fournisseurs" })).toBeVisible();
  await page.getByRole("button", { name: "Commande vide" }).click();
  await page.waitForURL(/\/commandes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Désignation").fill("Receveur extra-plat");
  await page.getByLabel("Qté").fill("2");
  await page.getByLabel("Prix unit. HT").fill("120");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText("Total HT : 240,00")).toBeVisible();
  await page.getByLabel("Fournisseur", { exact: true }).fill("Négoce du Rhône");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Commande enregistrée.")).toBeVisible();
  await audit(page, "commande brouillon");
  await page.getByRole("button", { name: "Marquer comme envoyée" }).click();
  await expect(page.getByRole("heading", { name: "Réception" })).toBeVisible();
  await page.getByLabel(/Receveur extra-plat/).fill("2");
  await page.getByRole("button", { name: "Enregistrer la réception" }).click();
  await expect(page.getByText("Commande reçue en totalité.")).toBeVisible();
  await page.getByLabel("Montant HT (euros)").fill("240");
  await page.getByRole("button", { name: "Rapprocher la facture" }).click();
  await expect(page.getByText("Facture conforme")).toBeVisible();
  await audit(page, "commande reçue et facture rapprochée");
  const pdf = await page.request.get(page.url().replace(/\/app\/chantiers\/[^/]+\/commandes\//, "/api/orders/") + "/pdf");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
});

test("planning : lien d'abonnement d'agenda lisible sans session", async ({ page, browser }) => {
  await login(page);
  await page.goto("/app/planning");
  await page.getByRole("button", { name: "Créer le lien d'abonnement" }).click();
  const url = (await page.getByTestId("lien-agenda").textContent())!.trim();
  expect(url).toMatch(/\/api\/agenda\/cal_[\w-]+\.ics$/);
  await audit(page, "abonnement d'agenda");
  const anon = await browser.newContext();
  const res = await anon.request.get(new URL(url).pathname);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  expect(await res.text()).toContain("BEGIN:VCALENDAR");
  await anon.close();
});

test("sous-traitants : fiche, attestation et vigilance sur le chantier", async ({ page }) => {
  const name = `Plâtrerie Martin ${Date.now().toString(36)}`;
  await login(page);
  await page.goto("/app/sous-traitants");
  await page.getByLabel("Raison sociale").fill(name);
  await page.getByLabel("Métier").fill("Plâtrerie");
  await page.getByLabel("E-mail", { exact: true }).fill("contact@platrerie-martin.fr");
  await page.getByRole("button", { name: "Ajouter le sous-traitant" }).click();
  await page.waitForURL(/\/app\/sous-traitants\/[0-9a-f-]{36}$/);
  await page.getByLabel("Document", { exact: true }).selectOption("urssaf");
  await page.getByLabel(/^Fichier/).setInputFiles({ name: "vigilance.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% essai\n") });
  await page.getByRole("button", { name: "Ajouter le document" }).click();
  await expect(page.getByText("Document ajouté.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Attestation de vigilance URSSAF" })).toBeVisible();
  await audit(page, "fiche sous-traitant");
  await page.getByRole("button", { name: "Demander les documents à jour" }).click();
  await expect(page.getByText("Demande envoyée par e-mail.")).toBeVisible();
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await page.getByLabel("Sous-traitant", { exact: true }).selectOption({ label: name });
  await page.getByLabel("Montant HT", { exact: true }).fill("6000");
  await page.getByRole("button", { name: "Ajouter au chantier" }).click();
  await expect(page.getByText("Obligation de vigilance")).toBeVisible();
});

test("devis : prix demandé à un sous-traitant, réponse en ligne puis intégration avec la marge", async ({ page, browser }) => {
  const name = `Électricité Roux ${Date.now().toString(36)}`;
  await login(page);
  await page.goto("/app/sous-traitants");
  await page.getByLabel("Raison sociale").fill(name);
  await page.getByLabel("E-mail", { exact: true }).fill("devis@electricite-roux.fr");
  await page.getByRole("button", { name: "Ajouter le sous-traitant" }).click();
  await page.waitForURL(/\/app\/sous-traitants\/[0-9a-f-]{36}$/);

  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Rénovation électrique");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  const quoteUrl = page.url();
  const panel = page.locator("#sous-traitance");
  await panel.locator("#sq-sub").selectOption({ label: name });
  await panel.getByLabel("Travaux demandés").fill("Remplacement du tableau électrique");
  await panel.getByRole("button", { name: "Demander un prix" }).click();
  const msg = panel.getByText(/Demande envoyée par e-mail\./);
  await expect(msg).toBeVisible();
  const link = (await msg.textContent())!.match(/https?:\/\/\S+/)![0];

  const st = await browser.newContext({ locale: "fr-FR" });
  const sp = await st.newPage();
  await sp.goto(new URL(link).pathname);
  await expect(sp.getByRole("heading", { name: "Remplacement du tableau électrique" })).toBeVisible();
  await sp.getByLabel("Montant hors taxes (euros)").fill("1 500");
  await sp.getByLabel("Délai d'intervention").fill("3 jours");
  await sp.getByRole("button", { name: "Envoyer mon prix" }).click();
  await expect(sp.getByText("Merci, votre prix a bien été transmis.")).toBeVisible();
  await st.close();

  await page.goto(quoteUrl);
  const card = panel.getByTestId("demande-st").filter({ hasText: "Remplacement du tableau électrique" });
  await expect(card.getByText("Prix reçu")).toBeVisible();
  await card.getByLabel("Marge (%)").fill("20");
  await card.getByRole("button", { name: "Intégrer au devis" }).click();
  await page.waitForURL(/ligne=sous-traitance/);
  await expect(card.getByText("Retenu", { exact: true })).toBeVisible();
  // La ligne de sous-traitance figure dans l'éditeur du devis.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")).some(
          (e) => e.value === "Remplacement du tableau électrique",
        ),
      ),
    )
    .toBe(true);
});

test("itinéraires : position relevée sur le chantier puis trajets du jour", async ({ page }) => {
  await login(page);
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 45.7719, longitude: 4.8902 });
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Je suis sur le chantier" }).click();
  await expect(page.getByText("Position du chantier enregistrée.")).toBeVisible();
  await expect(page.getByText("Position relevée sur place.")).toBeVisible();
  await page.goto("/app/planning");
  await page.getByRole("link", { name: "Trajets" }).click();
  await expect(page.getByRole("heading", { name: "Trajets du jour" })).toBeVisible();
  await audit(page, "trajets du jour");
});

test("devis : métré des murs avec ouvertures déduites reporté sur la ligne", async ({ page }) => {
  await login(page);
  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Peinture de la chambre");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Ligne libre" }).first().click();
  await page.getByLabel("Désignation", { exact: true }).last().fill("Peinture des murs, deux couches");
  await page.getByRole("button", { name: "Métré", exact: true }).last().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: /Murs d'une pièce/ })).toBeChecked();
  await dialog.getByLabel("Longueur 1").fill("4");
  await dialog.getByLabel("Largeur 1").fill("3");
  await dialog.getByLabel("Hauteur 1").fill("2,5");
  await dialog.getByRole("button", { name: "Ajouter une ouverture" }).click();
  await dialog.locator("#md-0-a").fill("0,83");
  await dialog.locator("#md-0-b").fill("2,04");
  await expect(dialog.getByTestId("metre-total")).toHaveText("Total : 33,31 m²");
  await audit(page, "métré");
  await dialog.getByRole("button", { name: "Reporter 33,31 m²" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Quantité", { exact: true }).last()).toHaveValue("33,31");
  await expect(page.getByRole("button", { name: "Métré : 33,31 m²" })).toBeVisible();
});

test("devis : cotes du métré dictées à la voix", async ({ page }) => {
  // Reconnaissance vocale simulée : elle « entend » deux phrases dès le démarrage de la dictée.
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      start() {
        const phrases = ["Chambre 4 mètres 10 par trois mètres hauteur 2 mètres 50", "porte 83 centimètres par 2 mètres 4"];
        setTimeout(() => {
          const results = phrases.map((t) => Object.assign([{ transcript: t }], { isFinal: true }));
          this.onresult?.({ resultIndex: 0, results });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  });
  await login(page);
  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Peinture dictée");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Ligne libre" }).first().click();
  await page.getByLabel("Désignation", { exact: true }).last().fill("Peinture des murs");
  await page.getByRole("button", { name: "Métré", exact: true }).last().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Dicter les cotes" }).click();
  await expect(dialog.getByText("Ajouté : porte, 0,83 x 2,04")).toBeVisible();
  await expect(dialog.getByLabel("Longueur 1")).toHaveValue("4,10");
  // Murs : 2 x (4,10 + 3) x 2,50 = 35,50 m², porte de 0,83 x 2,04 = 1,69 m² déduite.
  await expect(dialog.getByTestId("metre-total")).toHaveText("Total : 33,81 m²");
});

test("banque : relevé importé, opération mise de côté puis remise", async ({ page }) => {
  await login(page);
  await page.goto("/app/factures");
  await page.getByRole("link", { name: "Rapprochement bancaire" }).click();
  await expect(page.getByRole("heading", { name: "Rapprochement bancaire" })).toBeVisible();
  const label = `VIR INCONNU ${Date.now().toString(36).toUpperCase()}`;
  const today = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const csv = Buffer.from(`Date;Libellé;Débit;Crédit\n${today};${label};;12,34\n${today};CB QUINCAILLERIE;8,50;\n`, "utf8");
  await page.getByLabel(/Relevé bancaire/).setInputFiles({ name: "releve.csv", mimeType: "text/csv", buffer: csv });
  await expect(page.getByText("2 opération(s) ajoutée(s), 0 rapprochée(s) automatiquement.")).toBeVisible();
  const item = page.locator("li", { hasText: label }).first();
  await expect(item).toBeVisible();
  await audit(page, "rapprochement bancaire");
  await item.getByRole("button", { name: "Mettre de côté (hors factures)" }).click();
  const done = page.locator("li", { hasText: label }).filter({ hasText: "mise de côté" });
  await expect(done).toBeVisible();
  await done.getByRole("button", { name: "Remettre" }).click();
  await expect(page.locator("li", { hasText: label }).getByRole("button", { name: "Mettre de côté (hors factures)" })).toBeVisible();
});

test("notes de frais : ticket photographié puis validation et remboursement", async ({ page }) => {
  await login(page);
  await page.goto("/app/frais");
  await page.getByLabel("Photo du ticket").setInputFiles({
    name: "ticket.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]),
  });
  await page.getByLabel("Montant TTC (euros)").fill("23,40");
  await page.getByLabel("Dont TVA").fill("2,13");
  await page.getByLabel("Commerçant").fill("Relais des Artisans");
  await page.getByRole("button", { name: "Envoyer la note de frais" }).click();
  await expect(page.getByText("Note envoyée pour validation.")).toBeVisible();
  await expect(page.getByText("Relais des Artisans").first()).toBeVisible();
  await audit(page, "notes de frais");
  await page.goto("/app/frais?vue=equipe");
  await page
    .getByRole("checkbox", { name: /Relais des Artisans/ })
    .first()
    .check();
  await page.getByRole("button", { name: /^Valider/ }).click();
  await expect(page.getByText(/note\(s\) validée\(s\)/)).toBeVisible();
  await page
    .getByRole("checkbox", { name: /Relais des Artisans/ })
    .first()
    .check();
  await page.getByRole("button", { name: "Remboursé" }).click();
  await expect(page.getByText(/marquée\(s\) remboursée\(s\)/)).toBeVisible();
  await audit(page, "validation des notes de frais");
  const csv = await page.request.get(`/api/expenses/export?mois=${new Date().toISOString().slice(0, 7)}`);
  expect(await csv.text()).toContain("Relais des Artisans");
});

test("notes de frais : facture électronique Factur-X lue et préremplie", async ({ page }) => {
  await login(page);
  await page.goto("/app/frais");
  const day = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="r" xmlns:udt="u">` +
    `<rsm:ExchangedDocument><ram:ID>NEG-4471</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${day.replace(/-/g, "")}</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>` +
    `<rsm:SupplyChainTradeTransaction><ram:ApplicableHeaderTradeAgreement><ram:SellerTradeParty><ram:Name>Négoce Rhône Matériaux</ram:Name></ram:SellerTradeParty></ram:ApplicableHeaderTradeAgreement>` +
    `<ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode><ram:SpecifiedTradeSettlementHeaderMonetarySummation>` +
    `<ram:TaxBasisTotalAmount>100.00</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">20.00</ram:TaxTotalAmount><ram:GrandTotalAmount>120.00</ram:GrandTotalAmount>` +
    `</ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;
  const doc = await PDFDocument.create();
  doc.addPage().drawText("Facture NEG-4471", { x: 50, y: 700 });
  await doc.attach(new TextEncoder().encode(xml), "factur-x.xml", { mimeType: "text/xml", description: "Factur-X" });
  await page.getByLabel("Photo du ticket").setInputFiles({ name: "facture.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) });
  await expect(page.getByText(/Facture électronique lue \(n° NEG-4471\)/)).toBeVisible();
  await expect(page.getByLabel("Montant TTC (euros)")).toHaveValue("120,00");
  await expect(page.getByLabel("Dont TVA")).toHaveValue("20,00");
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(day);
  await expect(page.getByLabel("Commerçant")).toHaveValue("Négoce Rhône Matériaux");
  await audit(page, "facture électronique lue");
  await page.getByRole("button", { name: "Envoyer la note de frais" }).click();
  await expect(page.getByText("Note envoyée pour validation.")).toBeVisible();
  await expect(page.getByText("Négoce Rhône Matériaux").first()).toBeVisible();
});

test("assistance : rappel téléphonique demandé puis annulé", async ({ page }) => {
  await login(page);
  await page.goto("/app/assistance");
  await page.getByLabel("Numéro à rappeler").fill("06 12 34 56 78");
  await page.getByLabel("Jour").selectOption({ index: 1 });
  await page.getByLabel("Créneau").selectOption("apres_midi");
  await page.getByLabel("Sujet (facultatif)").fill("Paramétrer les factures d'acompte");
  await page.getByRole("button", { name: "Être rappelé" }).click();
  await expect(page.getByTestId("rappel-prevu")).toContainText("entre 14 h et 17 h");
  await expect(page.getByTestId("rappel-prevu")).toContainText("06 12 34 56 78");
  await expect(page.getByText("Séances de prise en main en ligne")).toBeVisible();
  await audit(page, "assistance avec rappel");
  await page.getByRole("button", { name: "Annuler le rappel" }).click();
  await expect(page.getByRole("button", { name: "Être rappelé" })).toBeVisible();
});

test("menu : briques choisies, ordre et barre du téléphone", async ({ page }) => {
  await login(page);
  await page.goto("/app/menu");
  await page.getByRole("button", { name: "Retirer Modèles de devis" }).click();
  await page.getByRole("button", { name: "Ajouter Banque" }).click();
  await page.getByRole("button", { name: "Monter Clients" }).click();
  await audit(page, "personnaliser le menu");
  await page.getByRole("button", { name: "Enregistrer mon menu" }).click();
  await expect(page.getByText("Menu enregistré.")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(nav.getByRole("link", { name: "Modèles de devis" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Banque" })).toBeVisible();
  await page.getByRole("button", { name: "Revenir au menu d'origine" }).click();
  await expect(page.getByText("Menu d'origine rétabli.")).toBeVisible();
  await expect(nav.getByRole("link", { name: "Modèles de devis" })).toBeVisible();
});

test("assistant vocal : demande relue puis confirmée", async ({ page }) => {
  await login(page);
  await page.goto("/app");
  await page.getByRole("button", { name: "Assistant vocal" }).click();
  await page.getByLabel("Votre demande").fill("Ajoute le client Julien Vocal au 06 44 55 66 77 à Annecy");
  await page.getByRole("button", { name: "Demander" }).click();
  const answer = page.getByTestId("assistant-reponse");
  await expect(answer).toContainText("Je crée le client Julien Vocal");
  await expect(page.getByLabel("Téléphone", { exact: true })).toHaveValue("06 44 55 66 77");
  await expect(page.getByLabel("Ville", { exact: true })).toHaveValue("Annecy");
  await audit(page, "assistant vocal, relecture");
  await page.getByRole("button", { name: "Confirmer" }).click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]{36}/);
  await expect(page.getByText("Client créé.")).toBeVisible();
  await page.getByLabel("Votre demande").fill("Combien me reste-t-il à encaisser ?");
  await page.getByRole("button", { name: "Demander" }).click();
  await expect(answer).toContainText("à encaisser");
  await page.getByLabel("Votre demande").fill("Ouvre le planning");
  await page.getByRole("button", { name: "Demander" }).click();
  await page.waitForURL(/\/app\/planning/);
});

test("fiche d'établissement : horaires, contrôles et vérification", async ({ page }) => {
  await login(page);
  await page.goto("/app/entreprise?onglet=vitrine");
  await expect(page.getByRole("heading", { name: "Fiche d'établissement en ligne" })).toBeVisible();
  await page.getByLabel("Lundi", { exact: true }).fill("8h-12h, 14h-18h");
  await page.getByLabel("Mardi", { exact: true }).fill("8h à 17h");
  await page.getByLabel("Adresse de la fiche 1").fill("https://g.page/exemple");
  await page.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await expect(page.getByText("Fiche d'établissement enregistrée.")).toBeVisible();
  await expect(page.getByText("Lundi : 8h - 12h, 14h - 18h")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ouvrir ma fiche Google" })).toBeVisible();
  await audit(page, "fiche d'établissement");
  await page.getByRole("button", { name: "J'ai vérifié mes fiches" }).click();
  await expect(page.getByText("Vérification notée.")).toBeVisible();
  await expect(page.getByText(/Dernière vérification le/)).toBeVisible();
});

test("devis : variantes base et confort au choix du client", async ({ page }) => {
  await login(page);
  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Salle de bain à variantes");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Ligne libre" }).first().click();
  await page.getByLabel("Désignation", { exact: true }).last().fill("Faïence murale");
  await page.getByLabel("Quantité", { exact: true }).last().fill("20");
  await page.getByLabel("Prix unitaire HT", { exact: true }).last().fill("40");
  await page.getByLabel("Titre de la section").first().fill("Carrelage");
  await page.getByRole("button", { name: "Créer une variante de la section" }).first().click();
  const variants = page.getByTestId("variante");
  await expect(variants).toHaveCount(2);
  await expect(page.getByLabel("Libellé de la variante").first()).toHaveValue("Base");
  await expect(page.getByLabel("Libellé de la variante").last()).toHaveValue("Confort");
  await page.getByLabel("Prix unitaire HT", { exact: true }).last().fill("60");
  await expect(variants.first()).toContainText("Comprise dans le total");
  await expect(variants.last()).toContainText("Au choix du client, 1 200,00 € HT");
  await expect(page.getByText("Total calculé avec la première variante de chaque choix")).toBeVisible();
  await audit(page, "variantes de devis");
});

test("devis : modification faite ailleurs reprise sans recharger", async ({ page, context }) => {
  await login(page);
  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Cuisine à deux mains");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByLabel("Objet des travaux").fill("Cuisine complète, modifiée sur la tablette");
  await expect(other.getByText("Enregistré").first()).toBeVisible();
  // Le premier onglet reprend la modification au signal de présence suivant, sans rechargement.
  await expect(page.getByLabel("Objet des travaux")).toHaveValue("Cuisine complète, modifiée sur la tablette", { timeout: 15_000 });
  await page.getByLabel("Conditions de paiement").fill("Acompte de 30 % à la commande.");
  await expect(page.getByText("Enregistré").first()).toBeVisible();
  await expect(other.getByLabel("Conditions de paiement")).toHaveValue("Acompte de 30 % à la commande.", { timeout: 15_000 });
  await other.close();
});

test("chantiers : page des garanties", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.getByRole("link", { name: "Garanties" }).click();
  await page.waitForURL(/\/app\/chantiers\/garanties$/);
  await expect(page.getByRole("heading", { name: "Garanties", level: 1 })).toBeVisible();
  await audit(page, "garanties");
});

test("devis : arrondis commerciaux des prix et du total", async ({ page }) => {
  await login(page);
  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Sol arrondi");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Ligne libre" }).first().click();
  await page.getByLabel("Désignation", { exact: true }).last().fill("Ragréage");
  await page.getByLabel("Quantité", { exact: true }).last().fill("20");
  await page.getByLabel("Prix unitaire HT", { exact: true }).last().fill("43,87");
  const hints = page.getByTestId("arrondis");
  await expect(hints).toContainText("43,87 € devient 44,00 €");
  await audit(page, "arrondis commerciaux");
  await page.getByRole("button", { name: "Arrondir les prix" }).click();
  await expect(page.getByLabel("Prix unitaire HT", { exact: true }).last()).toHaveValue("44,00");
  await expect(hints).toContainText("Pour un montant rond");
  await page.getByRole("button", { name: "Arrondir le total" }).click();
  await expect(hints).toHaveCount(0);
  await expect(page.getByLabel("Remise globale (%)")).not.toHaveValue("");
});

test("devis : incohérence de TVA signalée avec lien vers la ligne", async ({ page }) => {
  await login(page);
  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Carrelage à vérifier");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Ligne libre" }).first().click();
  await page.getByLabel("Désignation", { exact: true }).last().fill("Pose de faïence");
  await page.getByLabel("Quantité", { exact: true }).last().fill("12");
  await page.getByLabel("Prix unitaire HT", { exact: true }).last().fill("40");
  await page.getByLabel("Taux de TVA").last().selectOption("5,5");
  await page.getByText(/point\(s\) d'attention/).click();
  await expect(page.getByText("« Pose de faïence » : la TVA à 5,5 % est réservée aux travaux d'amélioration énergétique")).toBeVisible();
  await page.getByRole("button", { name: "Voir la ligne" }).click();
  await expect(page.getByLabel("Désignation", { exact: true }).last()).toBeFocused();
  await audit(page, "incohérences");
});

test("planning : congés saisis et affichés dans la grille", async ({ page }) => {
  await login(page);
  await page.goto("/app/planning");
  await page.getByLabel("Motif").selectOption({ label: "Formation" });
  await page.getByLabel("Commentaire").fill("Habilitation électrique");
  await page.getByRole("button", { name: "Enregistrer l'absence" }).click();
  await expect(page.getByText("Absence enregistrée.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Absences de la période" })).toContainText("formation");
  await expect(page.getByTestId("absence").first()).toHaveText("Formation");
  await audit(page, "absences au planning");
  const remove = page.getByRole("button", { name: /^Retirer l'absence/ });
  while (await remove.count()) {
    const n = await remove.count();
    await remove.first().click();
    await expect(remove).toHaveCount(n - 1);
  }
  await expect(page.getByText("Aucune absence sur la période.")).toBeVisible();
});

test("équipe : habilitation avec échéance proposée", async ({ page }) => {
  await login(page);
  await page.goto("/app/equipe");
  await page.getByLabel("Habilitation ou formation").fill("Habilitation électrique");
  await page.getByLabel("Obtenue le").fill("2025-03-15");
  await expect(page.getByLabel("Valable jusqu'au")).toHaveValue("2028-03-15");
  await page.getByLabel(/^Précision/).fill("B1V BR");
  await page.getByRole("button", { name: "Enregistrer l'habilitation" }).click();
  await expect(page.getByText("Habilitation enregistrée.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Habilitations de l'équipe" })).toContainText("Habilitation électrique (B1V BR)");
  await audit(page, "habilitations");
});

test("parc : outil, contrôle périodique et contrôle fait", async ({ page }) => {
  await login(page);
  await page.goto("/app/parc");
  await page.getByLabel("Outil ou engin").fill("Nacelle ciseaux");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retirer l'outil Nacelle ciseaux" }).first()).toBeVisible();
  await page.getByLabel("Véhicule ou outil").selectOption({ label: "Nacelle ciseaux" });
  await page.getByLabel("Contrôle", { exact: true }).fill("Vérification générale périodique");
  await expect(page.getByLabel("Tous les (mois)")).toHaveValue("6");
  await page.getByRole("button", { name: "Ajouter le contrôle" }).click();
  const list = page.getByRole("list", { name: "Contrôles du parc" });
  await expect(list).toContainText("Nacelle ciseaux : Vérification générale périodique, tous les 6 mois");
  await audit(page, "véhicules et outillage");
  await list.getByRole("button", { name: /^Fait/ }).first().click();
  await expect(list).toContainText("dernier le");
});

test("rapports : tableau de bord micro-entreprise", async ({ page }) => {
  await login(page);
  await page.goto("/app/rapports");
  await page.getByRole("link", { name: "Micro-entreprise" }).click();
  await page.waitForURL(/\/app\/rapports\/micro$/);
  await expect(page.getByRole("progressbar", { name: "Prestations de services" }).first()).toBeVisible();
  await expect(page.getByRole("table", { name: "Encaissements à déclarer par mois et par trimestre" })).toContainText("Trimestre 4");
  await audit(page, "micro-entreprise");
  await page.getByRole("link", { name: "Tout déclarer en prestations" }).click();
  await expect(page.getByRole("columnheader", { name: "Ventes" })).toBeVisible();
});

test("rapports : budget annuel comparé au réalisé", async ({ page }) => {
  await login(page);
  await page.goto("/app/rapports");
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await page.waitForURL(/\/app\/rapports\/budget$/);
  await page.getByLabel("Chiffre d'affaires facturé (HT), sur l'année (€)").fill("120 000");
  await page.getByRole("button", { name: /^Enregistrer le budget/ }).click();
  await expect(page.getByText("Budget enregistré.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Budget et réalisé par poste" })).toContainText("120 000,00 €");
  await audit(page, "budget annuel");
});

test("rapports : rentabilité par client et type de chantier", async ({ page }) => {
  await login(page);
  await page.goto("/app/rapports");
  await page.getByRole("link", { name: "Rentabilité" }).click();
  await page.waitForURL(/\/app\/rapports\/rentabilite$/);
  await expect(page.getByRole("heading", { name: "Rentabilité", level: 1 })).toBeVisible();
  await audit(page, "rentabilité");
  await page.getByRole("link", { name: "Depuis le début" }).click();
  await expect(page.getByRole("link", { name: "Depuis le début" })).toHaveAttribute("aria-current", "page");
});

test("rapports : origine des clients et coût d'acquisition", async ({ page }) => {
  await login(page);
  await page.goto("/app/rapports");
  await page.getByRole("link", { name: "Origine des clients" }).click();
  await page.waitForURL(/\/app\/rapports\/origine$/);
  await page.getByLabel("Plateforme de mise en relation (€)").fill("240");
  await page.getByRole("button", { name: /^Enregistrer les dépenses/ }).click();
  await expect(page.getByText("Dépenses enregistrées.")).toBeVisible();
  await expect(page.getByRole("table", { name: /par source/ })).toContainText("240,00 €");
  await audit(page, "origine des clients");
});

test("entreprise : labels montrés aux clients", async ({ page }) => {
  await login(page);
  await page.goto("/app/entreprise?onglet=assurance");
  await page.getByLabel("Label", { exact: true }).selectOption("handibat");
  await page.getByLabel("Numéro (facultatif)").fill("H-2026-04");
  await page.getByRole("button", { name: "Ajouter le label" }).click();
  await expect(page.getByText("Label enregistré.")).toBeVisible();
  await expect(page.getByTestId("liste-labels")).toContainText("Handibat, n° H-2026-04");
  await audit(page, "labels");
  await page.getByRole("button", { name: "Supprimer Handibat" }).click();
  await expect(page.getByText("Aucun label enregistré.")).toBeVisible();
});

test("pointage : barème des indemnités de déplacement", async ({ page }) => {
  await login(page);
  await page.goto("/app/pointage?vue=equipe");
  await expect(page.getByRole("heading", { name: "Indemnités de déplacement" })).toBeVisible();
  await page.getByLabel("Repas, par jour en petit déplacement (€)").fill("11,20");
  await page.getByLabel("Transport zone 2").fill("3,10");
  await page.getByRole("button", { name: "Enregistrer le barème" }).click();
  await expect(page.getByText("Barème enregistré.")).toBeVisible();
  await audit(page, "indemnités de déplacement");
});

test("chantier : message à l'équipe", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  const text = `Livraison du receveur demain 8 h (${Date.now().toString(36)})`;
  await page.getByLabel("Message à l'équipe").fill(text);
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.getByRole("list", { name: "Messages du chantier" })).toContainText(text);
  await expect(page.getByLabel("Message à l'équipe")).toHaveValue("");
  await audit(page, "messages de chantier");
  const item = page.getByRole("listitem").filter({ hasText: text });
  await item.getByRole("button", { name: "Retirer" }).click();
  await expect(page.getByText(text)).toHaveCount(0);
});

test("rapports : rapport mensuel envoyé au gérant", async ({ page }) => {
  await login(page);
  await page.goto("/app/rapports");
  const box = page.getByLabel("Recevoir chaque début de mois le rapport du mois écoulé par e-mail");
  await box.uncheck();
  await page.getByTestId("rapport-mensuel").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Rapport mensuel désactivé.")).toBeVisible();
  await box.check();
  await page.getByTestId("rapport-mensuel").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Rapport mensuel activé.")).toBeVisible();
  await audit(page, "rapport mensuel");
});

test("rapports : charge des semaines à venir et saisonnalité", async ({ page }) => {
  await login(page);
  await page.goto("/app/rapports");
  await page.getByRole("link", { name: "Charge et saisonnalité" }).click();
  await page.waitForURL(/\/app\/rapports\/charge$/);
  await expect(page.getByRole("table", { name: "Charge prévue par semaine" }).locator("tbody tr")).toHaveCount(12);
  await audit(page, "charge et saisonnalité");
});

test("avis client : invitation, dépôt puis gestion", async ({ page, browser }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  const send = page.getByLabel("Envoyer l'invitation par e-mail au client");
  if (await send.count()) await send.uncheck();
  await page.getByRole("button", { name: /^(Demander un avis au client|Renvoyer une invitation)$/ }).click();
  const status = page.getByText(/Lien à transmettre au client : /);
  await expect(status).toBeVisible();
  const url = (await status.textContent())!.match(/https?:\/\/\S+\/avis\/[A-Za-z0-9_-]+/)![0];

  const client = await browser.newContext({ locale: "fr-FR" });
  const cp = await client.newPage();
  await cp.goto(new URL(url).pathname);
  await expect(cp.getByRole("heading", { level: 1 })).toContainText("Votre avis sur");
  await audit(cp, "dépôt d'un avis");
  await cp.getByText("4", { exact: true }).click();
  await cp.getByLabel("Votre avis (facultatif)").fill("Travail soigné, équipe ponctuelle.");
  await cp.getByRole("button", { name: "Envoyer mon avis" }).click();
  await expect(cp.getByRole("status")).toContainText("Merci");
  await client.close();

  await page.goto("/app/avis");
  await expect(page.getByRole("list", { name: "Avis reçus" })).toContainText("Travail soigné, équipe ponctuelle.");
  await audit(page, "avis clients");
});

test("vitrine : rendez-vous de visite réservé en ligne", async ({ page, browser }) => {
  await login(page);
  await page.goto("/app/entreprise?onglet=vitrine");
  await page.getByLabel("Publier la page vitrine").check();
  await page.getByLabel("Adresse de la page").fill("demo-vitrine");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Vitrine publiée.")).toBeVisible();
  await page.getByLabel("Proposer la prise de rendez-vous sur ma vitrine").check();
  for (const day of ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]) await page.getByLabel(`Visites le ${day}`).fill("8h-20h");
  await page.getByLabel("Délai de prévenance").selectOption("12");
  await page.getByRole("button", { name: "Enregistrer les visites" }).click();
  await expect(page.getByText("Prise de rendez-vous ouverte sur votre vitrine.")).toBeVisible();
  await audit(page, "réglages des visites");

  const visitor = await browser.newContext({ locale: "fr-FR" });
  const vp = await visitor.newPage();
  await vp.goto("/pro/demo-vitrine");
  await vp.getByRole("link", { name: "Prendre rendez-vous pour une visite" }).click();
  await expect(vp.getByRole("heading", { name: "Prendre rendez-vous pour une visite", level: 1 })).toBeVisible();
  await audit(vp, "réservation de visite");
  await vp.locator("label:has(input[name=slot])").first().click();
  await vp.getByLabel("Nom et prénom").fill("Hugo Lambert");
  await vp.getByLabel("Téléphone").fill("06 98 76 54 32");
  await vp.getByLabel("Adresse des travaux").fill("8 rue Mercière");
  await vp.getByLabel("Ville").fill("Lyon");
  await vp.getByLabel("Vos travaux").fill("Carrelage de la cuisine, environ 15 m².");
  await vp.getByRole("checkbox", { name: /organiser la visite/ }).check();
  await vp.getByRole("button", { name: "Réserver la visite" }).click();
  await expect(vp.getByRole("status")).toContainText("Visite réservée le");
  await visitor.close();

  await page.goto("/app/demandes");
  const visits = page.getByTestId("visites");
  await expect(visits.getByText("Hugo Lambert, 06 98 76 54 32")).toBeVisible();
  await audit(page, "visites à venir");
  // Annulée, la visite quitte la liste et le créneau redevient libre.
  await visits.locator("li", { hasText: "Hugo Lambert" }).getByRole("button", { name: "Annuler la visite" }).click();
  await expect(page.getByText("Hugo Lambert, 06 98 76 54 32")).toBeHidden();
});

test("chantier : dossier des ouvrages exécutés", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Dossier des ouvrages exécutés" })).toBeVisible();
  await expect(page.getByTestId("doe-checks")).toContainText("Réception prononcée");
  await page.getByLabel("Conseils d'entretien").fill("Nettoyer les joints au savon neutre, sans produit acide.");
  await page.getByRole("button", { name: "Enregistrer les conseils" }).click();
  await expect(page.getByText("Conseils d'entretien enregistrés.")).toBeVisible();
  await audit(page, "dossier des ouvrages exécutés");
  const href = await page.getByRole("link", { name: "Télécharger le dossier" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("chantier : plan de prévention à afficher", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Plan de prévention" }).click();
  await expect(page.getByRole("heading", { name: "Plan de prévention", level: 1 })).toBeVisible();
  await page.getByRole("checkbox", { name: /Chute de hauteur/ }).check();
  await page.getByLabel("Sauveteur secouriste du travail").fill("Julie Morel");
  await page.getByLabel("Année de construction du bâtiment").fill("1975");
  await page.getByRole("button", { name: "Enregistrer le plan" }).click();
  await expect(page.getByText("Plan de prévention enregistré.")).toBeVisible();
  await expect(page.getByText(/Repérage amiante avant travaux \(permis/)).toBeVisible();
  await audit(page, "plan de prévention");
  const res = await page.request.get(page.url().replace(/\/app\/chantiers\/([^/]+)\/securite$/, "/api/jobs/$1/prevention"));
  expect(res.headers()["content-type"]).toBe("application/pdf");
});

test("chantier : évacuation de déchets et registre", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Déchets du chantier" })).toBeVisible();
  await page.getByLabel("Nature du déchet").selectOption("gravats");
  await page.getByLabel("Quantité", { exact: true }).fill("1,2");
  await page.getByLabel("Installation de destination").fill("Déchèterie professionnelle de Vénissieux");
  await page.getByLabel("Coût HT (€)").fill("78");
  await page.getByRole("button", { name: "Noter l'évacuation" }).click();
  await expect(page.getByText("Évacuation enregistrée.")).toBeVisible();
  await expect(page.getByTestId("bilan-dechets")).toContainText("Inertes");
  await audit(page, "déchets du chantier");
  await page.goto("/app/chantiers/dechets");
  await expect(page.getByRole("cell", { name: "Déchèterie professionnelle de Vénissieux" }).first()).toBeVisible();
  await audit(page, "registre des déchets");
  const href = await page.getByRole("link", { name: /Exporter \d{4} \(CSV\)/ }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(await res.text()).toContain("17 01 07");
});

test("chantier : coordination des corps de métier", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Corps de métier" }).click();
  await expect(page.getByRole("heading", { name: "Coordination des corps de métier", level: 1 })).toBeVisible();
  const add = page.locator("form", { has: page.getByRole("button", { name: "Ajouter l'intervention" }) });
  await add.getByLabel("Corps de métier").selectOption("carrelage");
  await add.getByLabel("Début").fill("2026-11-10");
  await add.getByLabel("Fin").fill("2026-11-12");
  await add.getByRole("button", { name: "Ajouter l'intervention" }).click();
  await expect(page.getByText("Intervention ajoutée.")).toBeVisible();
  await add.getByLabel("Corps de métier").selectOption("plomberie");
  await add.getByLabel("Début").fill("2026-11-14");
  await add.getByLabel("Fin").fill("2026-11-15");
  await add.getByRole("button", { name: "Ajouter l'intervention" }).click();
  await expect(page.getByTestId("coordination-alertes")).toContainText("l'ordre habituel est inverse");
  await audit(page, "coordination des corps de métier");
});

test("stock : article suivi, entrée puis alerte de réapprovisionnement", async ({ page }) => {
  await login(page);
  await page.goto("/app/parc");
  await page.getByRole("link", { name: "Stock du dépôt et des véhicules" }).click();
  await expect(page.getByRole("heading", { name: "Stock", level: 1 })).toBeVisible();
  const name = `Cartouche de silicone ${Date.now().toString(36)}`;
  await page.getByLabel("Désignation (hors catalogue)").fill(name);
  await page.getByLabel("Unité").fill("u");
  await page.getByLabel("Seuil de réapprovisionnement").fill("10");
  await page.getByLabel("Quantité à commander", { exact: true }).fill("24");
  await page.getByRole("button", { name: "Suivre en stock" }).click();
  await expect(page.getByText("Article suivi en stock.")).toBeVisible();
  await expect(page.getByTestId("a-commander")).toContainText(name);
  await page.getByLabel("Mouvement", { exact: true }).selectOption("entree");
  await page.getByLabel("Article", { exact: true }).selectOption({ label: name });
  await page.getByLabel("Quantité (ou quantité comptée)").fill("30");
  await page.getByRole("button", { name: "Enregistrer le mouvement" }).click();
  await expect(page.getByText("Mouvement enregistré.")).toBeVisible();
  await expect(page.locator("tr", { hasText: name }).getByRole("cell").nth(1)).toHaveText("30");
  await audit(page, "stock");
});

test("chantier : location de matériel rendue et coût reporté", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  const name = `Perforateur ${Date.now().toString(36)}`;
  await page.getByLabel("Matériel loué").fill(name);
  await page.getByLabel("Loueur").fill("Kiloutou");
  await page.getByLabel("Tarif HT (€)").fill("35");
  await page.getByRole("button", { name: "Enregistrer la location" }).click();
  await expect(page.getByText("Location enregistrée.")).toBeVisible();
  await expect(page.getByTestId("bilan-locations")).toContainText("Coût des locations");
  await audit(page, "location de matériel");
  await page.goto("/app/chantiers/locations");
  await expect(page.getByTestId("locations-en-cours")).toContainText(name);
  await audit(page, "matériel loué");
  await page.getByRole("link", { name: "Douche à l'italienne" }).first().click();
  const row = page.locator("li", { hasText: name });
  await row.getByRole("button", { name: "Matériel rendu" }).click();
  // Rendu, le matériel n'a plus de formulaire de retour et son coût rejoint les achats du chantier.
  await expect(row.getByText("Rendu", { exact: true })).toBeVisible();
  await expect(page.getByText(`Location : ${name} (1 jour)`)).toBeVisible();
});

test("commandes groupées : page accessible depuis les chantiers", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.getByRole("link", { name: "Commandes groupées" }).click();
  await page.waitForURL(/\/app\/commandes$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Commandes groupées");
  await audit(page, "commandes groupées");
});

test("commande : bon de livraison avec réserves et retour au fournisseur", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Commande vide" }).click();
  await page.waitForURL(/\/commandes\/[0-9a-f-]{36}$/);
  const item = `Faïence ${Date.now().toString(36)}`;
  await page.getByLabel("Désignation").fill(item);
  await page.getByLabel("Qté").fill("10");
  await page.getByLabel("Prix unit. HT").fill("25");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText("Total HT : 250,00")).toBeVisible();
  await page.getByLabel("Fournisseur", { exact: true }).fill("Cédéo");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Commande enregistrée.")).toBeVisible();
  await page.getByRole("button", { name: "Marquer comme envoyée" }).click();
  await expect(page.getByRole("heading", { name: "Réception" })).toBeVisible();
  await page.getByRole("textbox", { name: new RegExp(item) }).fill("10");
  await page.getByLabel("N° du bon de livraison").fill("BL-4410");
  await page.getByLabel("Réserves à la livraison").fill("3 carreaux cassés");
  await page.getByRole("button", { name: "Enregistrer la réception" }).click();
  await expect(page.getByText("Commande reçue en totalité.")).toBeVisible();
  await expect(page.getByTestId("livraisons")).toContainText("bon BL-4410");
  await expect(page.getByTestId("livraisons")).toContainText("Réserves : 3 carreaux cassés");
  await page.getByLabel("Quantité retournée").fill("1");
  await page.getByRole("button", { name: "Déclarer le retour" }).click();
  await expect(page.getByTestId("retours")).toContainText("Avoir attendu 25,00");
  await audit(page, "livraisons et retours");
  await page.goto("/app/chantiers/retours");
  await expect(page.getByTestId("retours-en-attente")).toContainText(item);
  await audit(page, "retours fournisseurs");
});

test("catalogue : écarts de prix des chantiers terminés", async ({ page }) => {
  await login(page);
  await page.goto("/app/catalogue");
  await page.getByRole("link", { name: "Écarts de prix" }).click();
  await page.waitForURL(/\/app\/catalogue\/ecarts$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Écarts de prix");
  await audit(page, "écarts de prix");
});

test("devis : durée du chantier estimée d'après la main-d'oeuvre", async ({ page }) => {
  await login(page);
  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Pose de faïence");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Ligne libre" }).first().click();
  await page.getByLabel("Désignation", { exact: true }).last().fill("Pose de faïence murale");
  await page.getByLabel("Quantité", { exact: true }).last().fill("16");
  await page.getByLabel("Unité", { exact: true }).last().fill("h");
  await page.getByRole("button", { name: "Estimer d'après la main-d'oeuvre" }).click();
  await expect(page.getByLabel("Durée estimée")).toHaveValue("2,5 jours ouvrés, 1 personne");
  await expect(page.locator("#q-duration-help")).toContainText("16 h de main-d'oeuvre");
  await audit(page, "durée estimée");
});

test("devis : devis similaires gagnés ou perdus", async ({ page }) => {
  await login(page);
  await page.goto("/app/devis");
  await page.locator("a:visible", { hasText: "Rénovation de salle de bains" }).first().click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("devis-similaires")).toContainText("Devis similaires");
  await page.getByTestId("devis-similaires").scrollIntoViewIfNeeded();
  await audit(page, "devis similaires");
});

test("catalogue : comparateur de prix entre fournisseurs", async ({ page }) => {
  await login(page);
  await page.goto("/app/catalogue/tarifs-fournisseurs");
  await page.getByRole("link", { name: "Comparer les fournisseurs" }).click();
  await page.waitForURL(/\/app\/catalogue\/comparateur$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Comparateur de fournisseurs");
  await audit(page, "comparateur de fournisseurs");
});

test("catalogue : empreinte carbone d'un article", async ({ page }) => {
  await login(page);
  await page.goto("/app/catalogue/nouveau");
  await page.getByLabel("Nom de la prestation").fill(`Receveur extra-plat ${Date.now().toString(36)}`);
  await page.getByLabel("Prix de vente HT (€)").fill("189");
  await page.getByRole("button", { name: "Créer la prestation" }).click();
  await page.waitForURL(/\/app\/catalogue\/[0-9a-f-]{36}$/);
  await page.getByLabel("Marque et modèle").fill("Receveur Kinedo");
  await page.getByLabel("Délai (jours)").fill("10");
  await page.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await expect(page.getByText("Fiche produit enregistrée.")).toBeVisible();
  await page.getByLabel(/Kg CO2e par/).fill("55");
  await page.getByRole("button", { name: "Enregistrer l'empreinte" }).click();
  await expect(page.getByText("Empreinte enregistrée")).toBeVisible();
  await audit(page, "empreinte carbone");
});

test("équipe : déclaration de congés payés du bâtiment", async ({ page }) => {
  await login(page);
  await page.goto("/app/equipe");
  await page.getByRole("link", { name: "Congés payés du bâtiment" }).click();
  await page.waitForURL(/\/app\/equipe\/conges-payes/);
  await page.getByLabel("Taux de cotisation (%)").fill("20,5");
  await page.getByRole("button", { name: "Enregistrer la caisse" }).click();
  await expect(page.getByText("Caisse enregistrée")).toBeVisible();
  await audit(page, "congés payés du bâtiment");
});

test("équipe : parcours de formation des apprentis", async ({ page }) => {
  await login(page);
  await page.goto("/app/equipe");
  await page.getByRole("link", { name: "Apprentis", exact: true }).click();
  await page.waitForURL(/\/app\/equipe\/apprentis$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Parcours des apprentis");
  await audit(page, "parcours des apprentis");
});

test("carte des chantiers et des clients", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.getByRole("link", { name: "Carte", exact: true }).click();
  await page.waitForURL(/\/app\/carte$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Carte des chantiers et des clients");
  await audit(page, "carte");
  await page.getByRole("link", { name: "Clients", exact: true }).last().click();
  await page.waitForURL(/vue=clients/);
});

test("clients : campagne d'entretien vers les anciens clients", async ({ page }) => {
  await login(page);
  await page.goto("/app/clients");
  await page.getByRole("link", { name: "Campagnes" }).click();
  await page.waitForURL(/\/app\/clients\/campagnes$/);
  await audit(page, "campagnes");
  await page.getByLabel("Dernière facture il y a au moins (mois)").fill("");
  await page.getByLabel("Et au plus (mois)").fill("");
  await page.getByRole("button", { name: "Créer et prévisualiser" }).click();
  await page.waitForURL(/\/app\/clients\/campagnes\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Aperçu du message")).toBeVisible();
  await expect(page.getByText(/Pour ne plus recevoir ses offres/)).toBeVisible();
  await audit(page, "campagne");
});

test("comptabilité : préparation du bilan", async ({ page }) => {
  await login(page);
  await page.goto("/app/comptabilite");
  await page.getByRole("link", { name: /Préparation du bilan/ }).click();
  await page.waitForURL(/\/app\/comptabilite\/bilan$/);
  await page.getByRole("checkbox", { name: "Inventaire du stock" }).check();
  await page.getByLabel("Commentaire : Inventaire du stock").fill("Inventaire fait le dernier jour");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Préparation du bilan enregistrée.")).toBeVisible();
  await audit(page, "préparation du bilan");
  const href = await page.getByRole("link", { name: /Dossier pour l.expert-comptable/ }).getAttribute("href");
  const csv = await page.request.get(href!);
  expect(csv.status()).toBe(200);
});

test("chantier : planification automatique", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Planifier automatiquement" }).click();
  await page.waitForURL(/\/planifier$/);
  await page.getByLabel("Personnes").fill("1");
  await page.getByRole("button", { name: "Chercher une période" }).click();
  await expect(page.getByTestId("proposition-planning")).toBeVisible();
  await audit(page, "planification automatique");
  await page.getByRole("button", { name: "Enregistrer dans le planning" }).click();
  await page.waitForURL(/\/app\/planning\?vue=semaine/);
});

test("veille réglementaire annoncée sur le tableau de bord", async ({ page }) => {
  await login(page);
  await page.goto("/app");
  await page.getByRole("link", { name: /évolutions? réglementaires? vous concern/ }).click();
  await page.waitForURL(/\/app\/veille$/);
  await expect(page.getByTestId("veille-entree").first()).toBeVisible();
  await audit(page, "veille réglementaire");
  const unread = page.getByRole("button", { name: "Marquer comme lu" });
  const before = await unread.count();
  await unread.first().click();
  await expect(unread).toHaveCount(before - 1);
});

test("stock : scanner un code-barres et l'associer", async ({ page }) => {
  await login(page);
  await page.goto("/app/stock");
  await page.getByRole("link", { name: "Scanner un article" }).click();
  await page.waitForURL(/\/app\/stock\/scanner$/);
  await page.getByLabel("Code-barres ou référence").fill("4006381333931");
  await page.getByRole("button", { name: "Rechercher" }).click();
  await expect(page.getByTestId("code-lu")).toContainText("EAN-13");
  await audit(page, "scanner un article");
  const assign = page.getByRole("button", { name: "Associer" });
  if (await assign.count()) {
    await page.getByLabel("Article", { exact: true }).selectOption({ index: 0 });
    await assign.click();
  }
  await expect(page.locator('[data-testid="scan-stock"], [data-testid="scan-catalogue"]').first()).toBeVisible();
});

test("chantier : météo des travaux extérieurs", async ({ page }) => {
  await login(page);
  await page.goto("/app/chantiers");
  await page.locator("a", { hasText: "Douche à l'italienne" }).first().click();
  await page.waitForURL(/\/app\/chantiers\/[0-9a-f-]{36}$/);
  await page.getByLabel("Surveiller la météo pour").selectOption("maconnerie");
  await page.getByLabel("Surveiller la météo pour").locator("xpath=ancestor::form").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByLabel("Surveiller la météo pour")).toHaveValue("maconnerie");
  await page.getByRole("link", { name: "Voir la météo des chantiers" }).click();
  await page.waitForURL(/\/app\/chantiers\/meteo$/);
  await expect(page.getByRole("heading", { name: "Chantiers extérieurs" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Prévisions au dépôt" })).toBeVisible();
  await audit(page, "météo des chantiers");
});

test("rapports : repères anonymes après participation", async ({ page }) => {
  await login(page);
  await page.goto("/app/rapports");
  await page.getByRole("link", { name: "Repères" }).click();
  await page.waitForURL(/\/app\/rapports\/reperes$/);
  const join = page.getByRole("button", { name: "Participer aux repères" });
  if (await join.count()) await join.click();
  await expect(page.getByRole("button", { name: "Arrêter de participer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vos prix face au marché" })).toBeVisible();
  await expect(page.getByTestId("comparaison")).toBeVisible();
  await audit(page, "repères anonymes");
});

test("équipe : invitation par fonction et description des droits", async ({ page }) => {
  await login(page);
  await page.goto("/app/equipe");
  await expect(page.getByText("Conducteur de travaux :")).toBeVisible();
  await audit(page, "équipe et fonctions");
  await page.getByLabel("Fonction", { exact: true }).selectOption("conducteur");
  await page.getByLabel("Adresse e-mail").fill(`conducteur-${Date.now().toString(36)}@exemple.fr`);
  await page.getByRole("button", { name: "Inviter" }).click();
  await expect(page.getByText(/Invitation envoyée|limitée à/)).toBeVisible();
});

test("devis : signature du client sur l'écran de l'artisan", async ({ page }) => {
  await login(page);
  await page.goto("/app/devis/nouveau");
  const customer = page.locator("select[name=customerId]");
  const value = await customer.locator("option", { hasText: "Dubois" }).first().getAttribute("value");
  await customer.selectOption(value!);
  await page.locator("input[name=title]").fill("Faïence de la salle d'eau");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Catalogue", exact: true }).click();
  const picker = page.getByRole("dialog");
  await picker.getByPlaceholder("Rechercher une prestation").fill("carrelage au sol");
  await picker.locator("li", { hasText: "Pose de carrelage au sol" }).locator("input[type=checkbox]").check();
  await picker.getByRole("button", { name: "Ajouter au devis" }).click();
  await expect(picker).toBeHidden();
  await page.getByRole("button", { name: "Émettre" }).first().click();
  const issue = page.getByRole("dialog");
  await issue.getByRole("checkbox").check();
  await issue.getByRole("button", { name: "Émettre" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^D-\d{4}-\d{4}$/);

  // Présentation sur tablette avant la signature
  await page.getByRole("link", { name: "Présenter sur tablette" }).click();
  await page.waitForURL(/\/presentation\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Écran 1 sur 3")).toBeVisible();
  await audit(page, "présentation : couverture");
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByText("Pose de carrelage au sol")).toBeVisible();
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByTestId("presentation-total")).toBeVisible();
  await expect(page.getByRole("button", { name: "Faire signer sur place" })).toBeVisible();
  await audit(page, "présentation : récapitulatif");
  await page.getByRole("link", { name: "Quitter la présentation" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Faire signer sur place" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom et prénom du signataire").fill("Claire Dubois");
  await dialog.getByRole("checkbox", { name: /Bon pour accord/ }).check();
  const attest = dialog.getByRole("checkbox", { name: /taux réduit de TVA/ });
  if (await attest.count()) await attest.check();
  const pad = dialog.getByRole("img", { name: "Signature du client : signez dans ce cadre" });
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 70, { steps: 8 });
  await page.mouse.move(box.x + 200, box.y + 30, { steps: 8 });
  await page.mouse.up();
  await audit(page, "signature sur place");
  await dialog.getByRole("button", { name: "Valider la signature" }).click();
  await expect(dialog.getByText("Devis signé et accepté.")).toBeVisible();
  await dialog.getByText("Fermer", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Faire signer sur place" })).toBeHidden();
  const signed = await page.request.get(`${page.url().replace("/app/devis/", "/api/quotes/")}/pdf?signe=1`);
  expect(signed.status()).toBe(200);
});

test("devis : lots regroupés par bâtiment avec sous-total", async ({ page }) => {
  await login(page);
  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Résidence Les Tilleuls");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Ligne libre" }).first().click();
  await page.getByLabel("Désignation", { exact: true }).last().fill("Peinture des cages d'escalier");
  await page.getByLabel("Quantité", { exact: true }).last().fill("10");
  await page.getByLabel("Prix unitaire HT", { exact: true }).last().fill("25");
  await page.getByRole("button", { name: "Ajouter une section" }).click();
  await page.getByLabel("Regroupement de la section").first().fill("Bâtiment A");
  await page.getByLabel("Titre de la section").first().fill("Peinture");
  await expect(page.getByTestId("sous-total-regroupement")).toHaveText("Sous-total Bâtiment A : 250,00 € HT");
  // Le lot ajouté ensuite reste dans le bâtiment du lot précédent.
  await page.getByLabel("Regroupement de la section").last().fill("Bâtiment B");
  await page.getByRole("button", { name: "Ajouter une section" }).click();
  await expect(page.getByLabel("Regroupement de la section").last()).toHaveValue("Bâtiment B");
  await audit(page, "lots regroupés");
});

test("assistant : réponses aux informations manquantes puis relance", async ({ page }) => {
  await login(page);
  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Carrelage de l'entrée");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Description du chantier").fill("Dépose de l'ancien carrelage et pose de carrelage au sol dans l'entrée");
  await dialog.getByRole("button", { name: "Proposer des lignes" }).click();
  await expect(dialog.getByRole("heading", { name: "Informations manquantes" })).toBeVisible();
  await dialog.getByLabel("Quelle surface faut-il traiter ?").fill("9,5");
  await dialog.getByLabel("Qui fournit les matériaux ?").selectOption("fournis par l'entreprise");
  await audit(page, "assistant avec relances");
  await dialog.getByRole("button", { name: "Relancer avec ces réponses" }).click();
  await expect(dialog.getByLabel("Description du chantier")).toHaveValue(/Surface à traiter : 9,5 m²\. Matériaux fournis par l'entreprise\.$/);
  await expect(dialog.getByLabel("Quelle surface faut-il traiter ?")).toHaveCount(0);
});

test("vitrine : page publique publiée puis demande de devis reçue", async ({ page, browser }) => {
  await login(page);
  await page.goto("/app/entreprise?onglet=vitrine");
  await page.getByLabel("Publier la page vitrine").check();
  await page.getByLabel("Adresse de la page").fill("demo-vitrine");
  await page.getByLabel("Présentation").fill("Carreleur à Lyon, salles de bains et cuisines.");
  await page.getByLabel("Zone d'intervention").fill("Lyon et 30 km");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Vitrine publiée.")).toBeVisible();
  await audit(page, "réglages de la vitrine");

  const visitor = await browser.newContext({ locale: "fr-FR" });
  const vp = await visitor.newPage();
  await vp.goto("/pro/demo-vitrine");
  await expect(vp.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(vp.getByText("Carreleur à Lyon, salles de bains et cuisines.")).toBeVisible();
  await audit(vp, "page vitrine publique");
  await vp.getByLabel("Nom et prénom").fill("Lucie Bernard");
  await vp.getByLabel("Téléphone").fill("06 12 34 56 78");
  await vp.getByLabel("Vos travaux").fill("Refaire la faïence de la salle de bains, environ 12 m².");
  await vp.getByRole("checkbox", { name: /recontacter/ }).check();
  await vp.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(vp.getByRole("status")).toContainText("Demande envoyée");
  await visitor.close();

  await page.goto("/app/demandes");
  await expect(page.getByText("Lucie Bernard").first()).toBeVisible();

  // Formulaire seul, intégrable dans le site de l'artisan.
  await page.goto("/app/entreprise?onglet=vitrine");
  await expect(page.getByLabel("Code à coller")).toHaveValue(/<iframe src="[^"]+\/integrer\/demo-vitrine"/);
  const res = await page.request.get("/integrer/demo-vitrine");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors *");
  const embedded = await browser.newContext({ locale: "fr-FR" });
  const ep = await embedded.newPage();
  await ep.goto("/integrer/demo-vitrine");
  await expect(ep.getByRole("heading", { name: "Demande de devis", level: 1 })).toBeVisible();
  await audit(ep, "formulaire intégrable");
  await embedded.close();
});

test("clients : parrainage par lien personnel vers la vitrine", async ({ page, browser }) => {
  await login(page);
  await page.goto("/app/clients/parrainage");
  await page.getByLabel("Programme de parrainage actif").check();
  await page.getByRole("button", { name: "Enregistrer le programme" }).click();
  await expect(page.getByText("Programme de parrainage actif.")).toBeVisible();
  await audit(page, "parrainage");
  await page.goto("/app/clients");
  await page.locator('a[href^="/app/clients/"][href*="-"]').first().click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Créer le lien de parrainage" }).click();
  const link = page.getByTestId("lien-parrainage");
  await expect(link).toContainText("?parrain=");
  await audit(page, "fiche client avec parrainage");
  const url = new URL((await link.textContent())!.trim());
  const visitor = await browser.newContext({ locale: "fr-FR" });
  const vp = await visitor.newPage();
  await vp.goto(url.pathname + url.search);
  await expect(vp.getByTestId("offre-parrainage")).toContainText("Vous venez de la part d'un client");
  await audit(vp, "vitrine avec parrainage");
  await visitor.close();
});

test("catalogue : fichier de prix fournisseur et alerte de marge", async ({ page }) => {
  await login(page);
  await page.goto("/app/catalogue/nouveau");
  await page.getByLabel("Nom de la prestation").fill("Colle carrelage C2 25 kg");
  await page.getByLabel("Prix de vente HT (€)").fill("30");
  await page.getByLabel("Coût d'achat HT (€)").fill("22");
  await page.getByLabel("Fournisseur", { exact: true }).fill("Négoce E2E");
  await page.getByLabel("Référence chez le fournisseur").fill("CK-E2E");
  await page.getByRole("button", { name: "Créer la prestation" }).click();
  await page.waitForURL(/\/app\/catalogue\/[0-9a-f-]{36}$/);

  await page.goto("/app/catalogue/tarifs-fournisseurs");
  await page.getByLabel("Fournisseur").fill("Négoce E2E");
  await page.getByLabel("Fichier de prix (.csv, .xlsx ou .ods)").setInputFiles({
    name: "tarif.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("REFCIALE;LIBELLE240;PRIXBASE;REMISE\nCK-E2E;Colle C2 25 kg;32,00;20\n", "utf8"),
  });
  await page.getByRole("button", { name: "Voir les changements" }).click();
  await expect(page.getByText(/passent sous la marge de 20 %/)).toBeVisible();
  await audit(page, "tarifs fournisseurs");
  await page.getByRole("button", { name: "Appliquer les nouveaux prix d'achat" }).click();
  await expect(page.getByRole("heading", { name: "Prix d'achat mis à jour" })).toBeVisible();

  await page.goto("/app/catalogue");
  await expect(page.getByRole("heading", { name: /Marge en baisse/ })).toBeVisible();
  await page.getByRole("button", { name: "Marge vue" }).first().click();
  await expect(page.getByRole("heading", { name: /Marge en baisse/ })).toBeHidden();
});

test("feuille de route : vote dans l'application, compte public", async ({ page }) => {
  await page.goto("/feuille-de-route");
  await expect(page.getByRole("heading", { level: 1, name: "Feuille de route" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mode hors ligne" })).toBeVisible();
  await audit(page, "feuille de route publique");
  await login(page);
  await page.goto("/app/feuille-de-route");
  const vote = page.getByRole("button", { name: /^Voter pour Mode hors ligne/ });
  await vote.click();
  await expect(page.getByRole("button", { name: /^Retirer mon vote pour Mode hors ligne, 1 vote/ })).toHaveAttribute("aria-pressed", "true");
  await audit(page, "feuille de route avec vote");
  await page.goto("/app/bienvenue");
  await expect(page.getByRole("heading", { name: "Envoyez-le à votre client" })).toBeVisible();
});

test("aides à la rénovation : qualification RGE puis contrôle du devis", async ({ page }) => {
  await login(page);
  await page.goto("/app/entreprise?onglet=assurance");
  const number = `E-${Date.now().toString(36)}`;
  await page.getByLabel("Numéro de qualification").fill(number);
  await page.getByLabel("Valable jusqu'au").fill("2030-12-31");
  await page.getByRole("checkbox", { name: "Isolation des combles et toitures" }).check();
  await audit(page, "qualifications RGE");
  await page.getByRole("button", { name: "Ajouter la qualification" }).click();
  await expect(page.getByTestId("liste-rge")).toContainText(number);

  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Isolation des combles perdus");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await page.getByRole("checkbox", { name: "MaPrimeRénov'" }).check();
  await expect(page.getByText("Aides à la rénovation : indiquez le domaine des travaux").first()).toBeVisible();
  await page.getByRole("checkbox", { name: "Pompes à chaleur" }).check();
  await expect(page.getByText(/aucune qualification RGE enregistrée pour « Pompes à chaleur »/).first()).toBeVisible();
  await page.getByRole("checkbox", { name: "Pompes à chaleur" }).uncheck();
  await page.getByRole("checkbox", { name: "Isolation des combles et toitures" }).check();
  await expect(page.getByText(/aucune qualification RGE/)).toHaveCount(0);
  await expect(page.getByText("MaPrimeRénov' : indiquez la date de la visite préalable du logement").first()).toBeVisible();
  await page.getByLabel("Visite préalable du logement").fill("2026-01-05");
  await expect(page.getByText("MaPrimeRénov' : indiquez la date de la visite préalable du logement")).toHaveCount(0);
  await audit(page, "devis avec aides");
});

test("rapports : TVA à déclarer et trésorerie à 3 mois", async ({ page }) => {
  await login(page);
  await page.goto("/app/rapports");
  await page.getByRole("link", { name: "TVA à déclarer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "TVA à déclarer" })).toBeVisible();
  await page.getByLabel("Déclaration trimestrielle").check();
  await page.getByRole("button", { name: "Afficher" }).click();
  await expect(page).toHaveURL(/trimestre=1/);
  await expect(page.getByTestId("tva-tableau")).toContainText("Total TVA collectée");
  await audit(page, "TVA à déclarer");
  const csv = await page.request.get("/api/reports/tva?du=2026-01-01&au=2026-03-31");
  expect(csv.headers()["content-type"]).toContain("text/csv");

  await page.goto("/app/rapports/tresorerie");
  await page.getByLabel("Solde bancaire actuel (€)").fill("100");
  await page.getByLabel("Charges fixes par mois (€)").fill("50000");
  await page.getByRole("button", { name: "Mettre à jour la prévision" }).click();
  await expect(page.getByText("Prévision mise à jour.")).toBeVisible();
  await expect(page.getByTestId("alerte-tresorerie")).toBeVisible();
  await expect(page.getByTestId("tresorerie-tableau")).toContainText("Solde estimé en fin de mois");
  await audit(page, "trésorerie");
  await page.getByLabel("Charges fixes par mois (€)").fill("0");
  await page.getByLabel("Solde bancaire actuel (€)").fill("5000");
  await page.getByRole("button", { name: "Mettre à jour la prévision" }).click();
  await expect(page.getByText("Prévision mise à jour.")).toBeVisible();
});

test("comptabilité : plan comptable du cabinet et exports", async ({ page }) => {
  await login(page);
  await page.goto("/app/comptabilite");
  await expect(page.getByRole("heading", { level: 1, name: "Comptabilité" })).toBeVisible();
  await audit(page, "comptabilité");
  await page.getByRole("link", { name: "Modifier les comptes" }).click();
  await page.getByLabel("Fournitures et matériaux").fill("707100");
  await page.getByRole("checkbox", { name: /Ventiler le chiffre d'affaires/ }).check();
  await audit(page, "plan comptable");
  await page.getByRole("button", { name: "Enregistrer le plan comptable" }).click();
  await expect(page.getByText("Plan comptable enregistré.")).toBeVisible();
  await page.goto("/app/comptabilite");
  await expect(page.getByTestId("plan-comptable")).toContainText("707100");
  const fec = await page.request.get("/api/exports/fec?du=2026-01-01&au=2026-12-31");
  expect(fec.status()).toBe(200);
  await page.getByLabel("Format").selectOption("csv");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^ecritures-\d{8}-\d{8}\.csv$/);
  await page.goto("/app/entreprise?onglet=comptabilite");
  await page.getByRole("checkbox", { name: /Ventiler le chiffre d'affaires/ }).uncheck();
  await page.getByRole("button", { name: "Enregistrer le plan comptable" }).click();
  await expect(page.getByText("Plan comptable enregistré.")).toBeVisible();
});

test("devis : croquis annoté joint et imprimé dans le PDF", async ({ page }) => {
  await login(page);
  await page.goto("/app/devis/nouveau");
  await page.locator("input[name=title]").fill("Ravalement de façade");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Dessiner un croquis" }).click();
  const dialog = page.getByRole("dialog");
  const canvas = dialog.getByTestId("annotation");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 120, { steps: 8 });
  await page.mouse.up();
  await dialog.getByRole("button", { name: "Flèche" }).click();
  await page.mouse.move(box.x + 250, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 100, { steps: 6 });
  await page.mouse.up();
  await dialog.getByRole("button", { name: "Texte ou cote" }).click();
  await dialog.getByLabel("Texte à placer (touchez l'image ensuite)").fill("2,40 m");
  await canvas.click({ position: { x: 60, y: 60 } });
  await dialog.getByLabel("Légende imprimée sous l'image").fill("Façade sud, cotes de l'échafaudage");
  await audit(page, "croquis");
  await dialog.getByRole("button", { name: "Ajouter au devis" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("photos-devis").getByRole("img", { name: "Façade sud, cotes de l'échafaudage" })).toBeVisible();
  const pdf = await page.request.get(`${page.url().replace("/app/devis/", "/api/quotes/")}/preview-pdf`);
  expect(pdf.status()).toBe(200);
  await page.getByRole("button", { name: "Retirer l'image 1" }).click();
  await expect(page.getByTestId("photos-devis")).toHaveCount(0);
});

test("catalogue : fiche technique jointe à un article", async ({ page }) => {
  await login(page);
  await page.goto("/app/catalogue");
  await page
    .getByRole("link", { name: /Pose de carrelage au sol/ })
    .first()
    .click();
  await page.waitForURL(/\/app\/catalogue\/[0-9a-f-]{36}$/);
  const doc = await PDFDocument.create();
  doc.addPage().drawText("Fiche technique colle C2", { x: 50, y: 700 });
  await page
    .getByLabel("Document PDF (5 Mo au plus)")
    .setInputFiles({ name: "fiche-colle.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) });
  await page.getByLabel("Type", { exact: true }).selectOption("fiche_technique");
  await audit(page, "fiches techniques");
  await page.getByRole("button", { name: "Joindre" }).click();
  const list = page.getByTestId("documents-article");
  await expect(list.getByRole("link", { name: "fiche-colle" })).toBeVisible();
  await list.getByRole("button", { name: "Retirer" }).last().click();
  await expect(list.getByRole("link", { name: "fiche-colle" })).toHaveCount(0);
});
