# dempng-worker

`dempng-worker` は [国土地理院標高 PNG タイルシリーズ](https://maps.gsi.go.jp/development/demtile.html#dem) へのアクセスに干渉して
さまざまな加工結果を返す [ServiceWorker](https://developer.mozilla.org/ja/docs/Web/API/Service_Worker_API) です。[Leaflet](https://leafletjs.com/) や [maplibre-gl-js](https://maplibre.org/maplibre-gl-js/docs/) といった特定の Web 地図ライブラリに依存せずに動作することが特徴です。

`dempng-worker` が動作する環境では、
<https://cyberjapandata.gsi.go.jp/xyz/dem_png/9/453/202.png?type=hillshade> のように、
標高 PNG タイルシリーズの URL に特定の Query パラメータが付与された場合に限り効果が発動します。
Query パラメータに応じてソースとなる PNG タイル（と、必要に応じてその周辺タイル）をもとに、以下のようなタイル画像が生成されます。

- 段彩図 (elevation)
- 傾斜量図 (slope)
- 曲率図 (curvature)
- 陰影図 (hillshade)
- 等高線図 (contour)
- Mapbox Terrain PNG (mapbox)

## Demo

### maplibre-gl-js

<https://frogcat.github.io/dempng-worker/maplibre.html>

### leaflet

<https://frogcat.github.io/dempng-worker/leaflet.html>

## Usage

1. [dempng_worker.js](https://github.com/frogcat/dempng-worker/blob/main/dempng-worker.js) と [lib](https://github.com/frogcat/dempng-worker/tree/main/lib) をコピーします
2. 以下のコードを参考に `dempng-worker.js` をインストールします
3. `dempng-worker.js` が有効になると `startApp()` 関数が実行されるので、ここに地図初期化処理を記述します

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>dempng-worker</title>
    <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0" />
    <link href="https://unpkg.com/maplibre-gl@5.11.0/dist/maplibre-gl.css" rel="stylesheet" />
    <script src="https://unpkg.com/maplibre-gl@5.11.0/dist/maplibre-gl.js"></script>
    <style>
      #map {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script type="module">
      (async (a) => {
        // 同フォルダに配置された dempng-worker が登録される
        await a.register("./dempng-worker.js", { type: "module" });
        // dempng-worker が有効になったら startApp() が実行される
        if (a.controller) startApp();
        else a.addEventListener("controllerchange", startApp, { once: true });
      })(navigator.serviceWorker);

      // dempng-worker が有効になってから実行される関数
      function startApp() {
        new maplibregl.Map({
          container: "map",
          hash: true,
          style: `style/hillshade.json`,
        });
      }
    </script>
  </body>
</html>
```

## Spec

### Target

以下の 6 種の dem_png に対して作用します。

- `https://cyberjapandata.gsi.go.jp/xyz/dem1a_png/{z}/{x}/{y}.png`
- `https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png`
- `https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/{z}/{x}/{y}.png`
- `https://cyberjapandata.gsi.go.jp/xyz/dem5c_png/{z}/{x}/{y}.png`
- `https://cyberjapandata.gsi.go.jp/xyz/demgm_png/{z}/{x}/{y}.png`
- `https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png`

### 段彩図 (type=elevation)

標高値 (単位: メートル) に応じて着色した結果を返します。

以下のクエリーパラメータを設定可能です。

| parameter | value              | required                      | note                         |
| --------- | ------------------ | ----------------------------- | ---------------------------- |
| type      | "elevation"        | Yes                           | 固定値                       |
| colors    | カラーマップ指定   | No (default: "000000-ffffff") | [See: Color Map](#color-map) |
| fallback  | エラーピクセル色   | No (default: "00000000")      | [See: Color](#color)         |
| gain      | 標高値に掛ける乗数 | No (default: 1.0)             |                              |
| low       | 標高値の下限 [m]   | No (default: 0.0)             |                              |
| high      | 標高値の上限 [m]   | No (default: 4000.0)          |                              |

### 傾斜量図 (type=slope)

傾斜 (0° ～ 90°) に応じて着色した結果を返します。

以下のクエリーパラメータを設定可能です。

| parameter | value              | required                     | note                         |
| --------- | ------------------ | ---------------------------- | ---------------------------- |
| type      | "slope"            | Yes                          | 固定値                       |
| colors    | カラーマップ指定   | No (default: "ffffff-00000") | [See: Color Map](#color-map) |
| fallback  | エラーピクセル色   | No (default: "00000000")     | [See: Color](#color)         |
| gain      | 標高値に掛ける乗数 | No (default: 1.0)            |                              |
| low       | 傾斜量の下限 [°]   | No (default: 0.0)            | 0° ～ 90°                    |
| high      | 傾斜量の上限 [°]   | No (default: 90.0)           | 0° ～ 90°                    |

### 曲率図 (type=curvature)

曲率 (-90° ～ 90°) に応じて着色した結果を返します。

以下のクエリーパラメータを設定可能です。

| parameter | value              | required                      | note                         |
| --------- | ------------------ | ----------------------------- | ---------------------------- |
| type      | "slope"            | Yes                           | 固定値                       |
| colors    | カラーマップ指定   | No (default: "000000-ffffff") | [See: Color Map](#color-map) |
| fallback  | エラーピクセル色   | No (default: "00000000")      | [See: Color](#color)         |
| gain      | 標高値に掛ける乗数 | No (default: 1.0)             |                              |
| low       | 曲率の下限 [°]     | No (default: -90.0)           | -90° ～ 90°                  |
| high      | 曲率の上限 [°]     | No (default: 90.0)            | -90° ～ 90°                  |

### 陰影図 (type=hillshade)

光源と面のなす角度 (0° ～ 180°) に応じて着色した結果を返します。

以下のクエリーパラメータを設定可能です。

| parameter | value              | required                          | note                         |
| --------- | ------------------ | --------------------------------- | ---------------------------- |
| type      | "hillshade"        | Yes                               | 固定値                       |
| colors    | カラーマップ指定   | No (default: "00000000-000000ff") | [See: Color Map](#color-map) |
| fallback  | エラーピクセル色   | No (default: "00000000")          | [See: Color](color#color)    |
| gain      | 標高値に掛ける乗数 | No (default: 1.0)                 |                              |
| low       | 角度の下限 [°]     | No (default: 0.0)                 | 0° ～ 180°                   |
| high      | 角度の上限 [°]     | No (default: 90.0)                | 0° ～ 180°                   |
| dir       | 光源の方角 [°]     | No (default: 0.0)                 | 北 0°/東 90°/南 180°/西:270° |
| alt       | 光源の高度 [°]     | No (default: 45.0)                | 水平 0°/真上 90°             |

### 等高線図 (type=contour)

等高線間隔 (単位: メートル) に応じて等高線部分を着色した結果を返します。

以下のクエリーパラメータを設定可能です。

| parameter | value            | required                 | note                 |
| --------- | ---------------- | ------------------------ | -------------------- |
| type      | "contour"        | Yes                      | 固定値               |
| color     | 等高線の色       | No (default: "ffffff")   | [See: Color](#color) |
| fallback  | 等高線以外の色   | No (default: "00000000") | [See: Color](#color) |
| interval  | 等高線の間隔 [m] | No (default: 100.0)      |                      |

### Mapbox Terrain PNG (type=mapbox)

地理院標高 PNG を [Mapbox Terrain PNG 形式](https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-dem-v1/) に変換して返します。
maplibre-gl-js 等で `terrain` を設定する場合に使用します。

以下のクエリーパラメータを設定可能です。

| parameter | value    | required | note   |
| --------- | -------- | -------- | ------ |
| type      | "mapbox" | Yes      | 固定値 |

- 地理院標高 PNG における `#800000` (NaN) は Mapbox Terrain PNG では `#0186a0` (標高 0m) として着色されます

## Note

### Color

`fallback` および `color` パラメータでは任意の単色を指定することができます。
以下の 4 パターンの記法に対応しています。

- RGB `[0-9a-f]{3}`
- RGBA `[0-9a-f]{4}`
- RRGGBB `[0-9a-f]{6}`
- RRGGBBAA `[0-9a-f]{8}`

RGB および RRGGBB のアルファは 0xff (不透明) が設定されます。

### Color Map

`colors` パラメータでは複数の色からなる任意のグラデーションを指定することができます。

RGB / RGBA / RRGGBB / RRGGBBAA で表現される複数の色を - (ハイフン) で連結した文字列を指定します。

- {color_1}-{color_2}-...{color_n}

```
例1: 000-fff (黒～白のグラデーション)
例2: 0f0-ff0-f00 (緑～黄～赤のグラデーション)
例3: 0000-000f (透明黒～不透明黒のグラデーション)
```

### Gain

- `gain` パラメータは dempng からデコードされた標高値に対して乗算される係数です
- 都市部などの微細な凹凸を強調したい場合には 1 より大きい値を設定することで、視認性を改善できる場合もあります

(以上)
