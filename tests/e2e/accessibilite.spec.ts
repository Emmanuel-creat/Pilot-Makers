import AxeBuilder from "@axe-core/playwright";
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
        Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")).some((e) => e.value === "Remplacement du tableau électrique"),
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
  await page.getByRole("button", { name: "Enregistrer" }).click();
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
