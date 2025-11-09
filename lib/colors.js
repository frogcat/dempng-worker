function parseColor(color) {
  if (typeof color === "string" && color.match(/^[0-9a-f]{6}$/)) {
    return [
      parseInt(color.substring(0, 2), 16),
      parseInt(color.substring(2, 4), 16),
      parseInt(color.substring(4, 6), 16),
      0xff,
    ];
  }
  if (typeof color === "string" && color.match(/^[0-9a-f]{8}$/)) {
    return [
      parseInt(color.substring(0, 2), 16),
      parseInt(color.substring(2, 4), 16),
      parseInt(color.substring(4, 6), 16),
      parseInt(color.substring(6, 8), 16),
    ];
  }
  return null;
}
function parseColors(colors) {
  if (typeof colors !== "string") return null;

  const def = [];
  if (colors.match(/^[0-9a-f]{6}-[0-9a-f]{6}(?:-[0-9a-f]{6})*$/)) {
    const tokens = colors.split("-");
    for (let i = 0; i < tokens.length; i++) {
      def.push({
        index: Math.floor((0xff * i) / (tokens.length - 1)),
        rgba: [
          parseInt(tokens[i].substring(0, 2), 16),
          parseInt(tokens[i].substring(2, 4), 16),
          parseInt(tokens[i].substring(4, 6), 16),
          0xff,
        ],
      });
    }
  }
  if (colors.match(/^[0-9a-f]{8}-[0-9a-f]{8}(?:-[0-9a-f]{8})*$/)) {
    const tokens = colors.split("-");
    for (let i = 0; i < tokens.length; i++) {
      def.push({
        index: Math.floor((0xff * i) / (tokens.length - 1)),
        rgba: [
          parseInt(tokens[i].substring(0, 2), 16),
          parseInt(tokens[i].substring(2, 4), 16),
          parseInt(tokens[i].substring(4, 6), 16),
          parseInt(tokens[i].substring(6, 8), 16),
        ],
      });
    }
  }

  if (colors.match(/^[0-9a-f]{10}-[0-9a-f]{10}(?:-[0-9a-f]{10})*$/)) {
    const tokens = colors.split("-");
    for (let i = 0; i < tokens.length; i++) {
      def.push({
        index: parseInt(tokens[i].substring(0, 2), 16),
        rgba: [
          parseInt(tokens[i].substring(2, 4), 16),
          parseInt(tokens[i].substring(4, 6), 16),
          parseInt(tokens[i].substring(6, 8), 16),
          parseInt(tokens[i].substring(8, 10), 16),
        ],
      });
    }
    def.sort((a, b) => a.index - b.index);
    const head = def[0];
    const tail = def[def.length - 1];
    if (head.index > 0) def.unshift({ index: 0, rgba: head.rgba });
    if (tail.index < 0xff) def.push({ index: 0xff, rgba: tail.rgba });
  }

  if (def.length === 0) return null;

  const result = [];
  let left = def.shift();
  let right = def.shift();
  for (let i = 0; i < 0x100; i++) {
    if (left.index === i) result.push(left.rgba);
    else if (right.index === i) {
      result.push(right.rgba);
      while (right && right.index === i) {
        left = right;
        right = def.shift();
      }
    } else {
      const t = (i - left.index) / (right.index - left.index);
      result.push([
        Math.floor(left.rgba[0] * (1 - t) + right.rgba[0] * t),
        Math.floor(left.rgba[1] * (1 - t) + right.rgba[1] * t),
        Math.floor(left.rgba[2] * (1 - t) + right.rgba[2] * t),
        Math.floor(left.rgba[3] * (1 - t) + right.rgba[3] * t),
      ]);
    }
  }
  return result;
}

function rgbToHsv(r, g, b) {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h;
  if (d === 0) h = 0;
  else if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;

  h = Math.round((h * 60 + 360) % 360);

  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hexToRgb(hex) {
  let h = hex.replace(/^#/, "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return { r, g, b };
}

function computeParamsFromRed(hex) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, v } = rgbToHsv(r, g, b);
  return {
    "raster-hue-rotate": h,
    "raster-saturation": Math.max(-1, Math.min(1, s - 1)),
    "raster-brightness-max": v,
  };
}

export { parseColor, parseColors, computeParamsFromRed };
