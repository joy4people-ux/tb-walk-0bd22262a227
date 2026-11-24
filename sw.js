self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("tb-walk")).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{ if(e.request.mode==="navigate") e.respondWith(fetch(e.request,{cache:"no-cache"}).catch(()=>caches.match(e.request))); });
