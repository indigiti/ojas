const offline=new URL("offline.html",self.registration.scope).href;
const cacheKey="ojas-shell-__BUILD__";
self.addEventListener("install",event=>event.waitUntil(
 caches.open(cacheKey).then(cache=>cache.add(new Request(offline,{cache:"reload"})))
));
self.addEventListener("activate",event=>event.waitUntil(
 caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("ojas-shell-")&&k!==cacheKey).map(k=>caches.delete(k))))
));
self.addEventListener("fetch",event=>{
 const url=new URL(event.request.url);
 const scope=self.registration.scope;
 if(event.request.method!=="GET"||event.request.mode!=="navigate"||!url.href.startsWith(scope)||url.href.startsWith(new URL("api/",scope).href))return;
 event.respondWith(fetch(event.request).catch(async()=>await (await caches.open(cacheKey)).match(offline)??Response.error()));
});
