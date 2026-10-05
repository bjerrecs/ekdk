import { mkdir, writeFile } from 'node:fs/promises';
import { getAerodromeCharts } from 'naviair-charts';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { airports } from '../src/lib/data.js';
import { matchApproachCharts } from '../src/lib/chart-policy.js';
import { extractIlsReference, combineIlsReferences } from '../src/lib/ils-parser.js';

await mkdir('tmp/ils', { recursive: true });
let chartCount = 0;
let runwayCount = 0;
for (const airport of airports) {
  const charts = (await getAerodromeCharts(airport.id, { publication: 'aip-dk' })).filter(chart => /\bILS\b/.test(chart.title));
  const extracted = new Map();
  for (const chart of charts) {
    const response = await fetch(chart.url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Download failed: ${chart.name}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const task = getDocument({ data: bytes, standardFontDataUrl: `${process.cwd().replaceAll('\\', '/')}/node_modules/pdfjs-dist/standard_fonts/` });
    try {
      const document = await task.promise;
      const page = await document.getPage(1);
      const content = await page.getTextContent();
      const items = content.items.filter(item => 'str' in item).map(item => ({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }));
      await writeFile(`tmp/ils/${chart.name}.json`, JSON.stringify({ chart, height: page.view[3], items }, null, 2));
      const runway = airport.runways.find(value => matchApproachCharts([chart], value, 'ILS').length);
      if (!runway) throw new Error(`Unrecognized runway: ${chart.name}`);
      extracted.set(chart.name, extractIlsReference(items, { airport: airport.id, runway, height: page.view[3] - page.view[1] }));
      chartCount++;
    } finally { await task.destroy(); }
  }
  for (const runway of airport.runways) {
    const applicable = matchApproachCharts(charts, runway, 'ILS');
    if (!applicable.length) continue;
    const result = combineIlsReferences(applicable.map(chart => extracted.get(chart.name)));
    if (!result.course || !result.frequency || !result.identifier) throw new Error(`Incomplete or conflicting ILS reference: ${airport.id} ${runway}`);
    runwayCount++;
    console.log(`${airport.id} ${runway}: ${result.course}° / ${result.frequency} MHz / ${result.identifier}`);
  }
}
console.log(`Verified ${chartCount} current chart documents across ${runwayCount} runway references.`);
