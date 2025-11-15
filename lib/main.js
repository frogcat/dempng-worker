import { parseColor, parseColors, clip, asDEM, asResponse, asImageData } from "./util.js";

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
  const dem = await asDEM(url, { normalize: true });
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
  const dem = await asDEM(url, { normalize: true });
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
  const dem = await asDEM(url, { normalize: false });
  const color = parseColor(url.searchParams.get("color")) || parseColor("ffffff");
  const fallback = parseColor(url.searchParams.get("fallback")) || parseColor("00000000");
  const interval = parseFloat(url.searchParams.get("interval") || "100");

  const src = dem.convolveFn(function ([nw, n, ne, w, c, e, sw, s, se]) {
    const center = Math.floor((c * 0.01) / interval);
    const east = Math.floor((e * 0.01) / interval);
    const south = Math.floor((s * 0.01) / interval);
    if (isNaN(center)) return 0;
    if (center === east && center === south) return 0;
    return 0xff;
  });

  const dst = new ImageData(src.width, src.height);
  for (let i = 0; i < src.data.length; i++) {
    if (src.data[i] === 0) {
      dst.data.set(fallback, i * 4);
    } else {
      dst.data.set(color, i * 4);
    }
  }
  return await asResponse(dst);
}

async function hillshade(url) {
  const dem = await asDEM(url, { normalize: true });
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
