function translate(url, dx, dy) {
  const u = url.toString().replace(/[?#].*$/, "");
  const r = u.match(/^(.+)\/([0-9]+)\/([0-9]+)\.png$/);
  if (!r) throw new Error("Not a dempng");
  return new URL(`${r[1]}/${parseInt(r[2]) + dx}/${parseInt(r[3]) + dy}.png`);
}

function clip(val, min, max) {
  if (max < min) return clip(val, max, min);
  if (val < min) return min;
  if (val > max) return max;
  return val;
}

function parseColor(color) {
  const s = "" + color;
  if (!s.match(/^[0-9a-f]+$/)) return null;
  switch (s.length) {
    case 3:
      return (s + "f").split("").map((a) => parseInt(a, 16) * 0x11);
    case 4:
      return s.split("").map((a) => parseInt(a, 16) * 0x11);
    case 6:
      return (s + "ff").match(/.{2}/g).map((a) => parseInt(a, 16));
    case 8:
      return s.match(/.{2}/g).map((a) => parseInt(a, 16));
  }
  return null;
}

function parseColors(colors) {
  const s = "" + colors;
  if (!s.match(/^[0-9a-f]{3,}(?:-[0-9a-f]{3,})+$/)) return null;

  let def = s.split("-").map((a) => parseColor(a));
  if (!def || def.find((a) => a === null)) return null;
  def = def.map((e, i, a) => ({ rgba: e, tick: 0xff * (i / (a.length - 1)) }));

  let left = def.shift();
  let right = null;
  const res = [left.rgba];
  while (def.length > 0) {
    if (right !== null) left = right;
    right = def.shift();
    for (let i = Math.ceil(left.tick + Number.MIN_VALUE); i <= right.tick; i++) {
      const t = (i - left.tick) / (right.tick - left.tick);
      res.push(left.rgba.map((_, j) => Math.floor(left.rgba[j] * (1 - t) + right.rgba[j] * t)));
    }
  }
  return res;
}

const errorImageBitmapPromise = (() => {
  const img = new ImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) img.data.set([0x80, 0, 0, 0xff], i);
  return createImageBitmap(img);
})();

const cache = {};
async function asBitmap(url) {
  const u = url.toString().replace(/[?#].*$/, "");
  if (cache[u]) return await cache[u];
  const res = await fetch(u);
  if (!res.ok) return await (cache[u] = errorImageBitmapPromise);
  const bitmap = await createImageBitmap(await res.blob());
  delete cache[u];
  return bitmap;
}

async function asImageData(url) {
  const bitmap = await asBitmap(url);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function asResponse(imageData) {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const context = canvas.getContext("2d");
  context.putImageData(imageData, 0, 0);
  return new Response(await canvas.convertToBlob(), {
    type: "image/png",
  });
}

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
  convolveFn(fn) {
    const dst = [];
    const d = this.data;
    const w = this.width;
    const h = this.height;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        dst.push(
          fn([
            d[i - 1 - w],
            d[i - w],
            d[i + 1 - w],
            d[i - 1],
            d[i],
            d[i + 1],
            d[i - 1 + w],
            d[i + w],
            d[i + 1 + w],
          ])
        );
      }
    }
    return new DEM(dst, w - 2, h - 2);
  }
  get(c, dx, dy) {
    return this.data[c + dx + dy * this.width];
  }
}

async function asDEM(url, options) {
  const { padding, normalize } = Object.assign({ padding: 1, normalize: true }, options || {});
  const promises = [];
  for (let dy of [-1, 0, 1]) {
    for (let dx of [-1, 0, 1]) {
      promises.push(asBitmap(translate(url, dx, dy)));
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
}

export { parseColor, parseColors, clip, asDEM, asResponse, asImageData };
