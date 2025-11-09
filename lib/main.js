import { parseColors, parseColor } from "./colors.js";

const errorImageBitmapPromise = (() => {
  const img = new ImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) img.data.set([0x80, 0, 0, 0xff], i);
  return createImageBitmap(img);
})();

const cache = {};
const asBitmap = async function (url) {
  const u = url.toString().replace(/[?#].*$/, "");
  if (cache[u]) return await cache[u];
  const res = await fetch(u);
  if (!res.ok) return await (cache[u] = errorImageBitmapPromise);
  const bitmap = await createImageBitmap(await res.blob());
  delete cache[u];
  return bitmap;
};

const asImageData = async function (url) {
  const bitmap = await asBitmap(url);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
};

const asResponse = async function (imageData) {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const context = canvas.getContext("2d");
  context.putImageData(imageData, 0, 0);
  return new Response(await canvas.convertToBlob(), {
    type: "image/png",
  });
};

const shift = function (url, dx, dy) {
  const u = url.toString().replace(/[?#].*$/, "");
  const r = u.match(/^(.+)\/([0-9]+)\/([0-9]+)\.png$/);
  if (!r) throw new Error("Not a dempng");
  return new URL(`${r[1]}/${parseInt(r[2]) + dx}/${parseInt(r[3]) + dy}.png`);
};

const clip = function (val, min, max) {
  if (val < min) return min;
  if (val > max) return max;
  return val;
};

class DEM {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
  convolution(i, m) {
    const d = this.data;
    const w = this.width;
    return (
      d[i - w - 1] * m[0] +
      d[i - w] * m[1] +
      d[i - w + 1] * m[2] +
      d[i - 1] * m[3] +
      d[i] * m[4] +
      d[i + 1] * m[5] +
      d[i + w - 1] * m[6] +
      d[i + w] * m[7] +
      d[i + w + 1] * m[8]
    );
  }
}

const asDEM = async function (url, padding) {
  const promises = [];
  for (let dy of [-1, 0, 1]) {
    for (let dx of [-1, 0, 1]) {
      promises.push(asBitmap(shift(url, dx, dy)));
    }
  }
  const bitmaps = await Promise.all(promises);
  const w = bitmaps[0].width;
  const h = bitmaps[0].width;
  const canvas = new OffscreenCanvas(w + padding * 2, h + padding * 2);
  const context = canvas.getContext("2d");
  context.fillStyle = "#800000";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let dy of [-1, 0, 1]) {
    for (let dx of [-1, 0, 1]) {
      const i = dx + 1 + (dy + 1) * 3;
      context.drawImage(bitmaps[i], w * dx + padding, h * dy + padding);
    }
  }

  const src = context.getImageData(0, 0, canvas.width, canvas.height);
  const d = src.data;

  const z = parseInt(url.pathname.split("/")[3]);
  const unit = 500 * Math.pow(2, 15 - z);
  const normalized = [];
  for (let i = 0; i < d.length; i += 4) {
    let src = (d[i] << 16) + (d[i + 1] << 8) + d[i + 2];
    src -= [0, NaN, 1 << 24][Math.sign(src - 0x800000) + 1];
    normalized.push(src / unit);
  }

  return new DEM(normalized, src.width, src.height);
};

async function mapbox(url) {
  const imageData = await asImageData(url);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    let src = (d[i] << 16) + (d[i + 1] << 8) + d[i + 2];
    src -= [0, src, 1 << 24][Math.sign(src - 0x800000) + 1];
    const dst = Math.floor(0.1 * src + 100000);
    d.set([(dst & 0xff0000) >> 16, (dst & 0xff00) >> 8, dst & 0xff], i);
  }
  return await asResponse(imageData);
}

async function slope(url) {
  const padding = 1;
  const dem = await asDEM(url, padding);
  const colors = parseColors(url.searchParams.get("colors")) || parseColors("ffffff-000000");
  const fallback = parseColor(url.searchParams.get("fallback")) || parseColor("00000000");
  const gain = parseFloat(url.searchParams.get("gain") || "1");
  const min = parseFloat(url.searchParams.get("min") || "0");
  const max = parseFloat(url.searchParams.get("max") || "90");

  const w = dem.width - padding * 2;
  const h = dem.height - padding * 2;
  const dst = new ImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const j = dem.width * (y + padding) + x + padding;
      const ns = dem.convolution(j, [0.25, 0.5, 0.25, 0, 0, 0, -0.25, -0.5, -0.25]);
      const ew = dem.convolution(j, [-0.25, 0, 0.25, -0.5, 0, 0.5, -0.25, 0, 0.25]);
      const slope = Math.hypot(ns * gain, ew * gain);
      if (isNaN(slope)) {
        dst.data.set(fallback, i * 4);
      } else {
        const degree = clip((180 * Math.atan(slope)) / Math.PI, min, max);
        const index = Math.floor((0xff * (degree - min)) / (max - min));
        dst.data.set(colors[index], i * 4);
      }
    }
  }

  return await asResponse(dst);
}

async function curvature(url) {
  const padding = 1;
  const dem = await asDEM(url, padding);
  const colors = parseColors(url.searchParams.get("colors")) || parseColors("000000-ffffff");
  const fallback = parseColor(url.searchParams.get("fallback")) || parseColor("00000000");
  const gain = parseFloat(url.searchParams.get("gain") || "1");
  const min = parseFloat(url.searchParams.get("min") || "-90");
  const max = parseFloat(url.searchParams.get("max") || "90");

  const w = dem.width - padding * 2;
  const h = dem.height - padding * 2;
  const dst = new ImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const j = dem.width * (y + padding) + x + padding;
      const curvature = dem.convolution(j, [0, -0.25, 0, -0.25, 1, -0.25, 0, -0.25, 0]) * gain;
      if (isNaN(curvature)) {
        dst.data.set(fallback, i * 4);
      } else {
        const degree = clip((180 * Math.atan(curvature)) / Math.PI, min, max);
        const index = Math.floor((0xff * (degree - min)) / (max - min));
        dst.data.set(colors[index], i * 4);
      }
    }
  }
  return await asResponse(dst);
}

export { mapbox, slope, curvature };
