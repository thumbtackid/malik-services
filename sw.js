const CACHE_NAME = "malik-service-v21";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./login.html",
  "./dashboard.html",
  "./admin.html",
  "./artikel.html",
  "./about.html",
  "./contact.html",
  "./privacy-policy.html",
  "./terms.html",
  "./disclaimer.html",
  "./css/style.css",
  "./js/supabase.js",
  "./js/auth.js",
  "./js/user.js",
  "./js/admin.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => cache.add(url))
      );
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn("Gagal cache:", ASSETS_TO_CACHE[index], result.reason);
        }
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith("malik-service")) {
            console.log("Menghapus cache lama:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        console.log("Offline, mengambil dari cache:", request.url);
        const cachedResponse = await caches.match(request);

        if (cachedResponse) return cachedResponse;

        if (request.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }

        return Response.error();
      })
  );
});