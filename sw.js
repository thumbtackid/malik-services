
const CACHE = "malik-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./dashboard.html",
  "./admin.html",
  "./css/style.css",
  "./js/supabase.js",
  "./js/auth.js",
  "./js/user.js",
  "./js/admin.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.all(
        ASSETS.map(async (asset) => {
          try {
            await cache.add(asset);
          } catch (error) {
            console.warn("Gagal cache:", asset);
          }
        })
      );
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("malik-") && key !== CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Jangan cache request eksternal atau Supabase
  if (url.origin !== self.location.origin) return;

  // Navigasi halaman: prioritaskan jaringan
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        return (
          await caches.match("./index.html")
        ) || Response.error();
      })
    );
    return;
  }

  // Aset: cache-first
  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;

      try {
        const response = await fetch(request);

        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }

        return response;
      } catch (error) {
        return Response.error();
      }
    })
  );
});
