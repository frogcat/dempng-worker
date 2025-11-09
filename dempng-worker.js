import { mapbox, slope, curvature } from "./lib/main.js";

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

  const url = new URL(event.request.url);
  if (url.searchParams.has("type", "mapbox")) {
    event.respondWith(mapbox(url));
    return;
  }
  if (url.searchParams.has("type", "slope")) {
    event.respondWith(slope(url));
    return;
  }
  if (url.searchParams.has("type", "curvature")) {
    event.respondWith(curvature(url));
    return;
  }

  return;
});
