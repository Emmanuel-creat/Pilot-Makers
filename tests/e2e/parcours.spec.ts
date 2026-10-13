import { expect, test, type Page } from "@playwright/test";

/**
 * Parcours complet d'un artisan, du devis vide jusqu'à la facture payée,
 * avec l'acceptation en ligne par le client dans un navigateur séparé.
 */

const EMAIL = "demo@pilot-makers.fr";
const PASSWORD = "Demo2026Pilot";

async function login(page: Page) {
  await page.goto("/connexion");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/app(\/|$)/);
}

test.beforeEach(async ({ page }) => {
  // Les confirmations du navigateur (émission du solde, suppression) sont acceptées.
  page.on("dialog", (d) => d.accept());
});

test("une mauvaise connexion est refusée", async ({ page }) => {
  await page.goto("/connexion");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill("mauvais-mot-de-passe");
  await page.locator("form button[type=submit]").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/connexion/);
});

test("les pages légales sont accessibles sans compte", async ({ page }) => {
  for (const [path, title] of [
    ["/cgu", "Conditions"],
    ["/confidentialite", "Politique de confidentialité"],
    ["/mentions-legales", "Mentions légales"],
    ["/cookies", "Cookies"],
    ["/securite", "Signaler une faille"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
  }
  const txt = await page.request.get("/.well-known/security.txt");
  expect(txt.ok()).toBe(true);
  expect(await txt.text()).toContain("Policy:");
});

test("le centre d'aide trouve un guide et l'affiche", async ({ page }) => {
  await page.goto("/aide");
  await page.getByLabel("Rechercher dans l'aide").fill("rétractation");
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page.getByRole("link", { name: /Délai de rétractation/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Délai de rétractation de 14 jours");
  const health = await page.request.get("/api/health");
  expect((await health.json()).status).toBe("ok");
});

test("les pages principales s'affichent", async ({ page }) => {
  await login(page);
  for (const [path, title] of [
    ["/app/devis", "Devis"],
    ["/app/clients", "Clients"],
    ["/app/demandes", "Demandes"],
    ["/app/rapports", "Rapports"],
    ["/app/catalogue", "Catalogue"],
    ["/app/factures", "Factures"],
    ["/app/modeles", "Modèles de devis"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  }
});

test("devis vide, émission, acceptation en ligne, factures et paiement", async ({ page, browser }) => {
  await login(page);

  // 1. Nouveau devis vide pour une cliente existante.
  await page.goto("/app/devis/nouveau");
  const customer = page.locator("select[name=customerId]");
  const value = await customer.locator("option", { hasText: "Dubois" }).first().getAttribute("value");
  await customer.selectOption(value!);
  await page.locator("input[name=title]").fill("Carrelage de la cuisine");
  await page.getByRole("button", { name: "Commencer un devis vide" }).click();
  await page.waitForURL(/\/app\/devis\/[0-9a-f-]{36}$/);
  const quoteUrl = page.url();

  // 2. Deux prestations ajoutées depuis le catalogue.
  await page.getByRole("button", { name: "Catalogue", exact: true }).click();
  const picker = page.getByRole("dialog");
  await picker.getByPlaceholder("Rechercher une prestation").fill("carrelage au sol");
  await picker.locator("li", { hasText: "Pose de carrelage au sol" }).locator("input[type=checkbox]").check();
  await picker.getByPlaceholder("Rechercher une prestation").fill("ragréage");
  await picker.locator("li", { hasText: "Ragréage du sol" }).locator("input[type=checkbox]").check();
  await picker.getByRole("button", { name: "Ajouter au devis" }).click();
  await expect(picker).toBeHidden();

  // 3. Émission : numéro définitif et PDF figé.
  await page.getByRole("button", { name: "Émettre" }).first().click();
  const issue = page.getByRole("dialog");
  await issue.getByRole("checkbox").check();
  await issue.getByRole("button", { name: "Émettre" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^D-\d{4}-\d{4}$/);
  const number = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();

  const pdf = await page.request.get(`${quoteUrl.replace("/app/devis/", "/api/quotes/")}/pdf?version=1`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");

  // 4. Lien de consultation ouvert par la cliente, sans compte, dans un autre navigateur.
  await page.getByRole("button", { name: "Créer un lien de consultation" }).click();
  const link = await page.getByLabel("Lien de consultation").inputValue();
  expect(link).toMatch(/\/d\//);
  const client = await browser.newContext({ locale: "fr-FR" });
  const cp = await client.newPage();
  await cp.goto(new URL(link).pathname);
  await expect(cp.getByText(number).first()).toBeVisible();
  // Copie traduite proposée au client étranger.
  const translated = await cp.request.get(new URL(link).pathname.replace("/d/", "/api/public/quotes/") + "/pdf?langue=en");
  expect(translated.status()).toBe(200);
  expect(translated.headers()["content-disposition"]).toContain("-en.pdf");
  // Le PDF émis est figé : un navigateur qui l'a déjà reçoit une réponse 304 sans le fichier.
  const pdfUrl = new URL(link).pathname.replace("/d/", "/api/public/quotes/") + "/pdf";
  const first = await cp.request.get(pdfUrl);
  const etag = first.headers()["etag"];
  expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
  expect((await cp.request.get(pdfUrl, { headers: { "if-none-match": etag } })).status()).toBe(304);
  // Avant d'accepter, la cliente demande une modification sur une ligne précise.
  await cp.getByRole("radio", { name: "Demande de modification sur une ligne" }).check();
  await cp.getByLabel("Ligne concernée").selectOption({ label: "Ragréage du sol" });
  await cp.getByLabel("Ce que vous souhaitez changer").fill("Pouvez-vous prévoir un ragréage fibré ?");
  await cp.getByRole("button", { name: "Envoyer" }).click();
  await expect(cp.getByText("Pouvez-vous prévoir un ragréage fibré ?")).toBeVisible();
  await cp.getByRole("button", { name: "Accepter le devis" }).click();
  await cp.locator("#r-name").fill("Claire Dubois");
  await cp.getByRole("checkbox", { name: /Bon pour accord/ }).check();
  // Prestations à 10 % : la cliente atteste les conditions du taux réduit.
  await cp.getByRole("checkbox", { name: /taux réduit de TVA/ }).check();
  await cp.getByRole("button", { name: "Confirmer l'acceptation" }).click();
  await expect(cp.getByText(/accept/i).first()).toBeVisible();
  await client.close();

  // 5. La demande apparaît sur le devis côté entreprise, puis facture d'acompte de 30 % et facture de solde.
  await page.goto(quoteUrl);
  await expect(page.locator("#echanges").getByText("Pouvez-vous prévoir un ragréage fibré ?")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Facturation" })).toBeVisible();
  await page.locator("#dep-pct").fill("30");
  await page.getByRole("button", { name: "Facturer l'acompte" }).click();
  await page.waitForURL(/\/app\/factures\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("FA-");
  const deposit = (await page.getByRole("heading", { level: 1 }).textContent())!.match(/FA-\d{4}-\d{4}/)![0];

  await page.goto(quoteUrl);
  await page.getByRole("button", { name: "Facturer le solde" }).click();
  await page.waitForURL(/\/app\/factures\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("FA-");
  const final = (await page.getByRole("heading", { level: 1 }).textContent())!.match(/FA-\d{4}-\d{4}/)![0];
  expect(final).not.toBe(deposit);

  // 6. Paiement intégral du solde : la facture passe à « Payée ».
  await page.locator("#pay-ref").fill("Virement test");
  await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Paiement enregistré.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Payée", { exact: true }).first()).toBeVisible();

  const invoicePdf = await page.request.get(page.url().replace("/app/factures/", "/api/invoices/") + "/pdf");
  expect(invoicePdf.status()).toBe(200);

  // 7. Les deux factures apparaissent dans la liste : acompte à encaisser, solde payé.
  await page.goto("/app/factures");
  await expect(page.getByRole("row", { name: new RegExp(`${final}.*Payée`) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(`${deposit}.*acompte`) })).toBeVisible();
});

test("espace client : lien personnel, documents et message", async ({ page, browser }) => {
  await login(page);
  await page.goto("/app/clients");
  await page.getByRole("link", { name: /Dubois/ }).first().click();
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: /Lien seul|Créer un lien/ }).click();
  const link = (await page.getByTestId("lien-espace").textContent())!.trim();
  expect(link).toMatch(/\/espace\//);

  const client = await browser.newContext({ locale: "fr-FR" });
  const cp = await client.newPage();
  await cp.goto(new URL(link).pathname);
  await expect(cp.getByRole("heading", { name: "Devis", exact: true })).toBeVisible();
  await expect(cp.getByRole("heading", { name: "Factures", exact: true })).toBeVisible();
  const quote = cp.locator("article").first();
  const body = `Merci, à quelle date commencez-vous ? ${Date.now().toString(36)}`;
  await quote.locator("details").evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await quote.getByLabel("Message", { exact: true }).fill(body);
  await quote.getByRole("button", { name: "Envoyer" }).click();
  await expect(quote.getByText(body)).toBeVisible();
  await client.close();

  await page.goto("/app");
  await expect(page.getByText(/nouveau message du client|nouveaux messages du client/).first()).toBeVisible();
});

test("clé d'accès : ajout dans Mon compte puis connexion sans mot de passe", async ({ page, context }) => {
  // Authentificateur virtuel du navigateur, qui vérifie l'utilisateur comme une empreinte digitale.
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
  });
  await login(page);
  await page.goto("/app/compte");
  await page.getByLabel("Nom de l'appareil (facultatif)").fill("Téléphone de test");
  await page.getByRole("button", { name: "Ajouter une clé d'accès" }).click();
  await expect(page.getByText("Clé d'accès ajoutée")).toBeVisible();
  await expect(page.getByText("Téléphone de test")).toBeVisible();

  await context.clearCookies();
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec une clé d'accès" }).click();
  await page.waitForURL(/\/app(\/|$)/);

  await page.goto("/app/compte");
  await expect(page.getByText(/utilisée le/)).toBeVisible();
  await page.getByRole("button", { name: "Retirer la clé d'accès Téléphone de test" }).click();
  await expect(page.getByText("Aucune clé d'accès pour l'instant.")).toBeVisible();
});
