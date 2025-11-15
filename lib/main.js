import { parseColors, parseColor } from "./colors.js";

const asBitmap = (() => {
  const img = new ImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) img.data.set([0x80, 0, 0, 0xff], i);
  const errorImageBitmapPromise = createImageBitmap(img);
  const cache = {};
  return async function (url) {
    const u = url.toString().replace(/[?#].*$/, "");
    if (cache[u]) return await cache[u];
    const res = await fetch(u);
    if (!res.ok) return await (cache[u] = errorImageBitmapPromise);
    const bitmap = await createImageBitmap(await res.blob());
    delete cache[u];
    return bitmap;
  };
})();

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
  if (max < min) return clip(val, max, min);
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
  convolve(m) {
    const dst = [];
    const d = this.data;
    const w = this.width;
    const h = this.height;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        dst.push(
          d[i - 1 - w] * m[0] +
            d[i - w] * m[1] +
            d[i + 1 - w] * m[2] +
            d[i - 1] * m[3] +
            d[i] * m[4] +
            d[i + 1] * m[5] +
            d[i - 1 + w] * m[6] +
            d[i + w] * m[7] +
            d[i + 1 + w] * m[8]
        );
      }
    }
    return new DEM(dst, w - 2, h - 2);
  }
  get(c, dx, dy) {
    return this.data[c + dx + dy * this.width];
  }
}

const asDEM = async function (url, options) {
  const { padding, normalize } = Object.assign({ padding: 1, normalize: true }, options || {});
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
  const unit = normalize ? 500 * Math.pow(2, 15 - z) : 1;
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

async function elevation(url) {
  const colors = parseColors(url.searchParams.get("colors")) || parseColors("000000-ffffff");
  const fallback = parseColor(url.searchParams.get("fallback")) || parseColor("00000000");
  const gain = parseFloat(url.searchParams.get("gain") || "1");
  const low = parseFloat(url.searchParams.get("low") || "0");
  const high = parseFloat(url.searchParams.get("high") || "4000");

  const imageData = await asImageData(url);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    let src = (d[i] << 16) + (d[i + 1] << 8) + d[i + 2];
    src -= [0, NaN, 1 << 24][Math.sign(src - 0x800000) + 1];
    if (isNaN(src)) {
      d.set(fallback, i);
    } else {
      const alt = src * 0.01 * gain;
      const index = clip(Math.floor((0xff * (alt - low)) / (high - low)), 0, 0xff);
      d.set(colors[index], i);
    }
  }
  return await asResponse(imageData);
}

async function slope(url) {
  const padding = 1;
  const dem = await asDEM(url, { padding: padding, normalize: true });
  const colors = parseColors(url.searchParams.get("colors")) || parseColors("ffffff-000000");
  const fallback = parseColor(url.searchParams.get("fallback")) || parseColor("00000000");
  const gain = parseFloat(url.searchParams.get("gain") || "1");
  const low = parseFloat(url.searchParams.get("low") || "0");
  const high = parseFloat(url.searchParams.get("high") || "90");

  const src1 = dem.convolve([0.25, 0.5, 0.25, 0, 0, 0, -0.25, -0.5, -0.25]);
  const src2 = dem.convolve([-0.25, 0, 0.25, -0.5, 0, 0.5, -0.25, 0, 0.25]);
  const dst = new ImageData(src1.width, src1.height);

  for (let i = 0; i < src1.data.length; i++) {
    const slope = Math.hypot(src1.data[i] * gain, src2.data[i] * gain);
    if (isNaN(slope)) {
      dst.data.set(fallback, i * 4);
    } else {
      const degree = clip((180 * Math.atan(slope)) / Math.PI, low, high);
      const index = Math.floor((0xff * (degree - low)) / (high - low));
      dst.data.set(colors[index], i * 4);
    }
  }

  return await asResponse(dst);
}

async function curvature(url) {
  const padding = 1;
  const dem = await asDEM(url, { padding: padding, normalize: true });
  const colors = parseColors(url.searchParams.get("colors")) || parseColors("000000-ffffff");
  const fallback = parseColor(url.searchParams.get("fallback")) || parseColor("00000000");
  const gain = parseFloat(url.searchParams.get("gain") || "1");
  const low = parseFloat(url.searchParams.get("low") || "-90");
  const high = parseFloat(url.searchParams.get("high") || "90");

  const src = dem.convolve([0, -0.25, 0, -0.25, 1, -0.25, 0, -0.25, 0]);
  const dst = new ImageData(src.width, src.height);

  for (let i = 0; i < src.data.length; i++) {
    const curvature = src.data[i] * gain;
    if (isNaN(curvature)) {
      dst.data.set(fallback, i * 4);
    } else {
      const degree = clip((180 * Math.atan(curvature)) / Math.PI, low, high);
      const index = Math.floor((0xff * (degree - low)) / (high - low));
      dst.data.set(colors[index], i * 4);
    }
  }
  return await asResponse(dst);
}

async function contour(url) {
  const padding = 1;
  const dem = await asDEM(url, { padding: padding, normalize: false });
  const color = parseColor(url.searchParams.get("color")) || parseColor("ffffff");
  const fallback = parseColor(url.searchParams.get("fallback")) || parseColor("00000000");
  const interval = parseFloat(url.searchParams.get("interval") || "100");

  const w = dem.width - padding * 2;
  const h = dem.height - padding * 2;
  const dst = new ImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const j = dem.width * (y + padding) + x + padding;
      const v = [
        Math.floor((dem.get(j, 0, 0) * 0.01) / interval),
        Math.floor((dem.get(j, 1, 0) * 0.01) / interval),
        Math.floor((dem.get(j, 0, 1) * 0.01) / interval),
        Math.floor((dem.get(j, 1, 1) * 0.01) / interval),
      ];
      if (isNaN(v[0]) || (v[0] === v[1] && v[0] === v[2] && v[0] === v[3]))
        dst.data.set(fallback, i * 4);
      else dst.data.set(color, i * 4);
    }
  }

  return await asResponse(dst);
}

async function hillshade(url) {
  const padding = 1;
  const dem = await asDEM(url, { padding: padding, normalize: true });
  const colors = parseColors(url.searchParams.get("colors")) || parseColors("00000000-000000ff");
  const fallback = parseColor(url.searchParams.get("fallback")) || parseColor("00000000");
  const gain = parseFloat(url.searchParams.get("gain") || "1");
  const low = parseFloat(url.searchParams.get("low") || "0");
  const high = parseFloat(url.searchParams.get("high") || "90");
  const dir = (parseFloat(url.searchParams.get("dir") || "0") * Math.PI) / 180;
  const alt = (parseFloat(url.searchParams.get("alt") || "45") * Math.PI) / 180;

  const lx = Math.cos(alt) * Math.sin(dir);
  const ly = Math.cos(alt) * Math.cos(dir);
  const lz = Math.sin(alt);

  const dzdy = dem.convolve([0.25, 0.5, 0.25, 0, 0, 0, -0.25, -0.5, -0.25]);
  const dzdx = dem.convolve([-0.25, 0, 0.25, -0.5, 0, 0.5, -0.25, 0, 0.25]);

  const dst = new ImageData(dzdy.width, dzdy.height);

  for (let i = 0; i < dzdy.data.length; i++) {
    const ns = dzdy.data[i] * gain;
    const ew = dzdx.data[i] * gain;
    if (isNaN(ns) || isNaN(ew)) {
      dst.data.set(fallback, i * 4);
    } else {
      const num = -ew * lx + -ns * ly + lz;
      const denom = Math.sqrt(1 + ew * ew + ns * ns);
      const theta = Math.acos(num / denom);
      const degree = clip((theta * 180) / Math.PI, low, high);
      const index = clip(Math.floor((0xff * (degree - low)) / (high - low)), 0, 0xff);
      dst.data.set(colors[index], i * 4);
    }
  }
  return await asResponse(dst);
}
export { mapbox, slope, curvature, elevation, contour, hillshade };
