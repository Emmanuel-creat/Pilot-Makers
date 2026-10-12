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

test("les pages principales s'affichent", async ({ page }) => {
  await login(page);
  for (const [path, title] of [
    ["/app/devis", "Devis"],
    ["/app/clients", "Clients"],
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
  await cp.getByRole("button", { name: "Accepter le devis" }).click();
  await cp.locator("#r-name").fill("Claire Dubois");
  await cp.getByRole("checkbox").check();
  await cp.getByRole("button", { name: "Confirmer l'acceptation" }).click();
  await expect(cp.getByText(/accept/i).first()).toBeVisible();
  await client.close();

  // 5. Facture d'acompte de 30 %, puis facture de solde.
  await page.goto(quoteUrl);
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
