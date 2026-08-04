export type ScannerPoint = { x: number; y: number };

export type DocumentScan = {
  canvas: HTMLCanvasElement;
  corners: ScannerPoint[] | null;
  width: number;
  height: number;
};

function grayscale(data: Uint8ClampedArray, index: number) {
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function convexHull(points: ScannerPoint[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o: ScannerPoint, a: ScannerPoint, b: ScannerPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: ScannerPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: ScannerPoint[] = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function distance(a: ScannerPoint, b: ScannerPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Finds the four strongest outer corners from a Sobel edge map. */
export function detectDocumentCorners(image: ImageData): ScannerPoint[] | null {
  const { width, height, data } = image;
  if (width < 40 || height < 40) return null;
  const magnitudes: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      const gx =
        -grayscale(data, i - width * 4 - 4) + grayscale(data, i - width * 4 + 4) -
        2 * grayscale(data, i - 4) + 2 * grayscale(data, i + 4) -
        grayscale(data, i + width * 4 - 4) + grayscale(data, i + width * 4 + 4);
      const gy =
        -grayscale(data, i - width * 4 - 4) - 2 * grayscale(data, i - width * 4) -
        grayscale(data, i - width * 4 + 4) + grayscale(data, i + width * 4 - 4) +
        2 * grayscale(data, i + width * 4) + grayscale(data, i + width * 4 + 4);
      magnitudes.push(Math.hypot(gx, gy));
    }
  }
  if (!magnitudes.length) return null;
  const sorted = [...magnitudes].sort((a, b) => a - b);
  const threshold = Math.max(42, sorted[Math.floor(sorted.length * 0.9)] ?? 42);
  const inset = Math.max(4, Math.round(Math.min(width, height) * 0.025));
  const points: ScannerPoint[] = [];
  let magnitudeIndex = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const magnitude = magnitudes[magnitudeIndex++];
      if (magnitude >= threshold && x > inset && y > inset && x < width - inset && y < height - inset) {
        points.push({ x, y });
      }
    }
  }
  if (points.length < 20) return null;

  const hull = convexHull(points);
  if (hull.length < 4) return null;
  const corners = [
    hull.reduce((best, p) => (p.x + p.y < best.x + best.y ? p : best), hull[0]),
    hull.reduce((best, p) => (p.x - p.y > best.x - best.y ? p : best), hull[0]),
    hull.reduce((best, p) => (p.x + p.y > best.x + best.y ? p : best), hull[0]),
    hull.reduce((best, p) => (p.y - p.x > best.y - best.x ? p : best), hull[0]),
  ];
  const unique = corners.filter((point, index) => corners.findIndex((p) => distance(p, point) < 8) === index);
  if (unique.length !== 4) return null;
  const area = Math.abs(corners.reduce((sum, point, index) => {
    const next = corners[(index + 1) % corners.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
  if (area < width * height * 0.12) return null;
  return corners;
}

function solve(matrix: number[][], values: number[]) {
  const n = values.length;
  const augmented = matrix.map((row, i) => [...row, values[i]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-8) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let j = column; j <= n; j += 1) augmented[column][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let j = column; j <= n; j += 1) augmented[row][j] -= factor * augmented[column][j];
    }
  }
  return augmented.map((row) => row[n]);
}

function homographyFromRectangle(corners: ScannerPoint[], width: number, height: number) {
  const destination = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const matrix: number[][] = [];
  const values: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x: u, y: v } = destination[i];
    const source = corners[i];
    matrix.push([u, v, 1, 0, 0, 0, -u * source.x, -v * source.x]);
    values.push(source.x);
    matrix.push([0, 0, 0, u, v, 1, -u * source.y, -v * source.y]);
    values.push(source.y);
  }
  const coefficients = solve(matrix, values);
  if (!coefficients) return null;
  return { coefficients, yCoefficients: coefficients };
}

export function warpDocument(source: CanvasImageSource, corners: ScannerPoint[]): DocumentScan | null {
  const top = distance(corners[0], corners[1]);
  const bottom = distance(corners[3], corners[2]);
  const left = distance(corners[0], corners[3]);
  const right = distance(corners[1], corners[2]);
  const width = Math.max(1, Math.min(2400, Math.round(Math.max(top, bottom))));
  const height = Math.max(1, Math.min(3200, Math.round(Math.max(left, right))));
  const homography = homographyFromRectangle(corners, width, height);
  if (!homography) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const sourceCanvas = document.createElement("canvas");
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) return null;
  const sourceWidth =
    "videoWidth" in source
      ? Number(source.videoWidth)
      : "width" in source && typeof source.width === "number"
        ? source.width
        : 0;
  const sourceHeight =
    "videoHeight" in source
      ? Number(source.videoHeight)
      : "height" in source && typeof source.height === "number"
        ? source.height
        : 0;
  if (!sourceWidth || !sourceHeight) return null;
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  sourceContext.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  const sourcePixels = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
  const output = context.createImageData(width, height);
  const x = homography.coefficients;
  const y = homography.yCoefficients;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const denominator = x[6] * column + x[7] * row + 1;
      const sourceX = (x[0] * column + x[1] * row + x[2]) / denominator;
      const sourceY = (y[3] * column + y[4] * row + y[5]) / denominator;
      const sx = Math.max(0, Math.min(sourceWidth - 1, Math.round(sourceX)));
      const sy = Math.max(0, Math.min(sourceHeight - 1, Math.round(sourceY)));
      const sourceIndex = (sy * sourceWidth + sx) * 4;
      const outputIndex = (row * width + column) * 4;
      output.data[outputIndex] = sourcePixels.data[sourceIndex];
      output.data[outputIndex + 1] = sourcePixels.data[sourceIndex + 1];
      output.data[outputIndex + 2] = sourcePixels.data[sourceIndex + 2];
      output.data[outputIndex + 3] = 255;
    }
  }
  context.putImageData(output, 0, 0);
  return { canvas, corners, width, height };
}
