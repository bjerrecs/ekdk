// Reads the vector content of a Naviair aerodrome chart PDF: filled/stroked paths with their colours,
// flattened to polylines in page space (origin top-left, y down), and positioned text.
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const OP_NAMES = Object.fromEntries(Object.entries(OPS).map(([name, code]) => [code, name]));
const multiply = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function flatten(data, matrix) {
  const subpaths = [];
  let current = null;
  let last = [0, 0];
  const push = point => { current.push(point); last = point; };
  for (let index = 0; index < data.length;) {
    const op = data[index++];
    if (op === 0) { current = []; subpaths.push(current); push(apply(matrix, data[index], data[index + 1])); index += 2; }
    else if (op === 1) { push(apply(matrix, data[index], data[index + 1])); index += 2; }
    else if (op === 2 || op === 3) {
      const count = op === 2 ? 3 : 2;
      const controls = Array.from({ length: count }, (_, k) => apply(matrix, data[index + k * 2], data[index + k * 2 + 1]));
      index += count * 2;
      const start = last;
      for (let step = 1; step <= 8; step++) {
        const t = step / 8, u = 1 - t;
        const point = count === 3
          ? [0, 1].map(axis => u ** 3 * start[axis] + 3 * u * u * t * controls[0][axis] + 3 * u * t * t * controls[1][axis] + t ** 3 * controls[2][axis])
          : [0, 1].map(axis => u * u * start[axis] + 2 * u * t * controls[0][axis] + t * t * controls[1][axis]);
        push(point);
      }
    } else if (op === 4) { if (current?.length) current.closed = true; }
    else break;
  }
  return subpaths.filter(subpath => subpath.length > 1);
}

export async function readChart(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Chart download failed: ${url}`);
  const pdf = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), verbosity: 0 }).promise;
  const page = await pdf.getPage(1);
  const [, , width, height] = page.view;
  const operators = await page.getOperatorList();
  const paths = [];
  const stack = [];
  let matrix = [1, 0, 0, -1, 0, height];
  let fill = null;
  let stroke = null;
  operators.fnArray.forEach((code, index) => {
    const name = OP_NAMES[code];
    const args = operators.argsArray[index];
    if (name === 'save') stack.push(matrix);
    else if (name === 'restore') matrix = stack.pop() || matrix;
    else if (name === 'transform') matrix = multiply(matrix, args);
    else if (name === 'setFillRGBColor') fill = args[0];
    else if (name === 'setStrokeRGBColor') stroke = args[0];
    else if (name === 'constructPath') {
      const paint = OP_NAMES[args[0]] || '';
      const filled = /fill/i.test(paint);
      paths.push({ filled, stroked: /stroke/i.test(paint), fill: filled ? fill : null, stroke: /stroke/i.test(paint) ? stroke : null, subpaths: flatten(Object.values(args[1]?.[0] || {}), matrix) });
    }
  });
  const text = (await page.getTextContent()).items.filter(item => item.str.trim()).map(item => ({ text: item.str.trim(), width: item.width, x: item.transform[4], y: height - item.transform[5], size: Math.hypot(item.transform[2], item.transform[3]), angle: Math.atan2(item.transform[1], item.transform[0]) }));
  return { width, height, paths, text };
}
