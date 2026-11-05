const CACHE = "malik-v1";
const ASSETS = [
  "./", "./index.html", "./login.html", "./dashboard.html", "./admin.html",
  "./css/style.css", "./js/supabase.js", "./js/auth.js", "./js/user.js", "./js/admin.js",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Jangan cache request ke Supabase
  if (e.request.url.includes("supabase.co")) return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});