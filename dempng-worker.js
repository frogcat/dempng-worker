import * as main from "./lib/main.js";

self.addEventListener("install", () => {
  console.info("installing dempng-worker.js");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.info("activated dempng-worker.js");
  event.waitUntil(clients.claim());
});

const allow = [
  "https://cyberjapandata.gsi.go.jp/xyz/dem1a_png/",
  "https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/",
  "https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/",
  "https://cyberjapandata.gsi.go.jp/xyz/dem5c_png/",
  "https://cyberjapandata.gsi.go.jp/xyz/demgm_png/",
  "https://cyberjapandata.gsi.go.jp/xyz/dem_png/",
];

self.addEventListener("fetch", (event) => {
  if (!allow.find((x) => event.request.url.startsWith(x))) return;
  const url1 = new URL(event.request.url);
  const key = Object.keys(main).find((x) => url1.searchParams.has("type", x));
  if (key) {
    const url2 = new URL(event.request.url.replace(/[?#].*$/, ""));
    event.respondWith(main[key](url2, url1.searchParams));
  }
});
