/*
 * Service de l'application installable.
 * - Fichiers statiques (scripts, styles, icônes) : servis depuis le cache, mis à jour en arrière-plan.
 * - Pages : toujours demandées au serveur ; sans réseau, la page « hors ligne » s'affiche, avec la page autonome
 *   « Devis sans réseau » qui garde les devis préparés dans le téléphone jusqu'au retour du réseau. Exception : les
 *   20 derniers devis ouverts restent consultables et modifiables sans réseau (copie effacée à la déconnexion).
 * - Données (API, PDF) : jamais mises en cache, elles sont propres à chaque compte.
 */
const VERSION = "pm-v4";
const PAGES = "pm-devis-v1";
const PAGES_MAX = 20;
const QUOTE_PAGE = /^\/app\/devis\/[0-9a-f-]{36}$/;
const OFFLINE = "/hors-ligne";
const OFFLINE_QUOTE = "/devis-hors-ligne.html";
const PRECACHE = [OFFLINE, OFFLINE_QUOTE, "/devis-hors-ligne.js", "/icon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg" || url.pathname === "/devis-hors-ligne.js"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Déconnexion ou changement de compte : les devis gardés pour le travail sans réseau sont effacés.
    if (url.pathname === "/connexion" || url.pathname === "/inscription") event.waitUntil(caches.delete(PAGES));
    if (QUOTE_PAGE.test(url.pathname)) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            if (res.ok && !res.redirected && new URL(res.url).pathname === url.pathname) {
              const copy = res.clone();
              event.waitUntil(
                caches.open(PAGES).then(async (cache) => {
                  await cache.put(url.pathname, copy);
                  const keys = await cache.keys();
                  await Promise.all(keys.slice(0, Math.max(0, keys.length - PAGES_MAX)).map((k) => cache.delete(k)));
                }),
              );
            }
            return res;
          })
          .catch(() =>
            caches
              .open(PAGES)
              .then((cache) => cache.match(url.pathname))
              .then((r) => r || caches.match(OFFLINE))
              .then((r) => r || Response.error()),
          ),
      );
      return;
    }
    // Devis sans réseau : page autonome gardée par le téléphone, mise à jour quand le réseau est là.
    if (url.pathname === OFFLINE_QUOTE) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(caches.open(VERSION).then((cache) => cache.put(OFFLINE_QUOTE, copy)));
            }
            return res;
          })
          .catch(() => caches.match(OFFLINE_QUOTE).then((r) => r || Response.error())),
      );
      return;
    }
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE).then((r) => r || Response.error())));
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(req).then((hit) => {
          const fresh = fetch(req)
            .then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || fresh;
        }),
      ),
    );
  }
});

/* Notifications sur le téléphone : le message chiffré est déchiffré par le navigateur avant d'arriver ici. */
self.addEventListener("push", (event) => {
  let data = { title: "Pilot-Makers", body: "", url: "/app" };
  try {
    data = Object.assign(data, event.data ? event.data.json() : {});
  } catch (e) {
    data.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url } }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/app", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(target.href);
          return c.focus();
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
