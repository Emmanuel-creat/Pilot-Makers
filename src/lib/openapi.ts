/** Description OpenAPI 3.1 de l'API publique v1, servie sur /api/v1/openapi.json et reprise dans la page d'aide. */

export interface ApiEndpoint {
  method: "GET" | "POST" | "DELETE";
  path: string;
  summary: string;
  write?: boolean;
  query?: { name: string; description: string; type?: "string" | "integer" }[];
  pdf?: boolean;
}

export const API_ENDPOINTS: ApiEndpoint[] = [
  { method: "GET", path: "/api/v1/me", summary: "Entreprise et droits de la clé" },
  { method: "GET", path: "/api/v1/today", summary: "Chantiers du jour et devis en attente de réponse (widgets d'écran d'accueil)" },
  {
    method: "GET",
    path: "/api/v1/customers",
    summary: "Liste des clients",
    query: [
      { name: "q", description: "Recherche (nom, e-mail, téléphone, ville, SIREN)" },
      { name: "limit", description: "Nombre de résultats, 500 au plus (50 par défaut)", type: "integer" },
      { name: "offset", description: "Décalage pour la pagination", type: "integer" },
    ],
  },
  { method: "POST", path: "/api/v1/customers", summary: "Créer un client (doublon probable refusé sauf allow_duplicate=true)", write: true },
  { method: "GET", path: "/api/v1/customers/{id}", summary: "Fiche d'un client" },
  {
    method: "GET",
    path: "/api/v1/quotes",
    summary: "Liste des devis",
    query: [
      { name: "status", description: "draft, ready, sent, viewed, accepted, refused, expired, canceled" },
      { name: "customer_id", description: "Devis d'un client" },
      { name: "page", description: "Page (1 par défaut)", type: "integer" },
      { name: "page_size", description: "Taille de page, 100 au plus", type: "integer" },
    ],
  },
  { method: "GET", path: "/api/v1/quotes/{id}", summary: "Devis complet : lots, lignes, totaux et versions émises" },
  {
    method: "GET",
    path: "/api/v1/quotes/{id}/pdf",
    summary: "PDF émis (dernière version, ou ?version=N)",
    pdf: true,
    query: [{ name: "version", description: "Numéro de version", type: "integer" }],
  },
  {
    method: "GET",
    path: "/api/v1/invoices",
    summary: "Liste des factures et avoirs",
    query: [
      { name: "status", description: "issued, partial, overdue, paid, canceled, credit" },
      { name: "customer_id", description: "Factures d'un client" },
      { name: "limit", description: "Nombre de résultats, 500 au plus", type: "integer" },
    ],
  },
  { method: "GET", path: "/api/v1/invoices/{id}", summary: "Facture avec son contenu figé" },
  { method: "GET", path: "/api/v1/invoices/{id}/pdf", summary: "PDF de la facture", pdf: true },
  {
    method: "GET",
    path: "/api/v1/catalog-items",
    summary: "Catalogue des prestations",
    query: [
      { name: "q", description: "Recherche" },
      { name: "limit", description: "Nombre de résultats, 2000 au plus", type: "integer" },
    ],
  },
  { method: "POST", path: "/api/v1/catalog-items", summary: "Ajouter une prestation au catalogue", write: true },
  {
    method: "GET",
    path: "/api/v1/jobs",
    summary: "Chantiers et avancement",
    query: [{ name: "status", description: "a_planifier, en_cours, termine, receptionne" }],
  },
  { method: "GET", path: "/api/v1/jobs/{id}", summary: "Fiche chantier avec ses tâches" },
  { method: "GET", path: "/api/v1/webhooks", summary: "Abonnements créés avec cette clé et événements disponibles" },
  {
    method: "POST",
    path: "/api/v1/webhooks",
    summary: "S'abonner à un événement (url ou target_url, event ou events) : renvoie la clé de signature",
    write: true,
  },
  { method: "DELETE", path: "/api/v1/webhooks/{id}", summary: "Se désabonner", write: true },
  {
    method: "GET",
    path: "/api/v1/webhooks/samples",
    summary: "Exemples de contenu de chaque événement",
    query: [{ name: "event", description: "quote.accepted, invoice.paid ou customer.created" }],
  },
];

export function openApiSpec(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of API_ENDPOINTS) {
    const params = [
      ...(e.path.includes("{id}") ? [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }] : []),
      ...(e.query ?? []).map((q) => ({ name: q.name, in: "query", description: q.description, schema: { type: q.type ?? "string" } })),
    ];
    const ok = e.pdf
      ? { description: "Document PDF", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } }
      : { description: "Réponse JSON", content: { "application/json": { schema: { type: "object" } } } };
    paths[e.path] = {
      ...paths[e.path],
      [e.method.toLowerCase()]: {
        summary: e.summary,
        ...(params.length ? { parameters: params } : {}),
        ...(e.method === "POST" ? { requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } } } : {}),
        responses: {
          [e.method === "POST" ? "201" : "200"]: ok,
          "401": { description: "Clé manquante, invalide ou révoquée" },
          "403": { description: e.write ? "Clé en lecture seule ou compte en lecture seule" : "Accès refusé" },
          "404": { description: "Introuvable" },
          "429": { description: "Limite de 120 requêtes par minute et par clé dépassée (en-tête Retry-After)" },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "API Pilot-Makers",
      version: "1.0.0",
      description:
        "Accès aux clients, devis, factures, catalogue et chantiers de votre entreprise. Les montants sont en centimes (suffixe _cents ou Cents), les prix du catalogue en dix-millièmes d'euro (suffixe 4).",
    },
    servers: [{ url: origin }],
    security: [{ cle: [] }],
    components: { securitySchemes: { cle: { type: "http", scheme: "bearer", description: "Clé créée dans Entreprise, onglet API (pm_...)" } } },
    paths,
  };
}
