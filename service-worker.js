const CACHE_NAME = "creativo-gestionale-v4";
const STATIC_ASSETS = [
  "/manifest.webmanifest?v=4",
  "/apple-touch-icon.png?v=4",
  "/icon-192.png?v=4",
  "/icon-512.png?v=4",
  "/favicon-32.png?v=4"
];
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    Promise.all(STATIC_ASSETS.map(url => cache.add(url).catch(()=>null)))
  ));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;
  if(req.mode === "navigate"){
    event.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }
  const url = new URL(req.url);
  if(url.origin === self.location.origin){
    event.respondWith(fetch(req).then(resp=>{
      const copy=resp.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));
      return resp;
    }).catch(()=>caches.match(req)));
  }
});
