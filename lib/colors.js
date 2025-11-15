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
export { parseColor, parseColors };
