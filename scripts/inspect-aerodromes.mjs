import { mkdir, writeFile } from 'node:fs/promises';
import { getChart } from 'naviair-charts';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
await mkdir('tmp/pdfs', { recursive: true });
// Pass ICAO codes to inspect only those airports.
const airports = process.argv.slice(2).length ? process.argv.slice(2).map(value => value.toUpperCase()) : ['EKCH', 'EKBI', 'EKYT', 'EKAH', 'EKRK', 'EKSB', 'EKRN', 'EKSP', 'EKOD', 'EKEB'];
for (const icao of airports) {
  for (const part of ['ADC', 'AD2']) {
    const chart = await getChart(part === 'ADC' ? { icao, chart: 'ADC' } : { icao });
    const response = await fetch(chart.url);
    if (!response.ok) throw new Error(`${chart.name}: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(`tmp/pdfs/${icao}-${part}.pdf`, bytes);
    await writeFile(`tmp/pdfs/${icao}-${part}.json`, JSON.stringify(chart, null, 2));
    const task = getDocument({ data: bytes, standardFontDataUrl: `${process.cwd().replaceAll('\\', '/')}/node_modules/pdfjs-dist/standard_fonts/` });
    const document = await task.promise;
    let text = '';
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      text += `\nPAGE ${pageNumber}\n` + content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('');
      if (part === 'ADC' && pageNumber === 1) {
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport }).promise;
        await writeFile(`tmp/pdfs/${icao}-ADC.png`, canvas.toBuffer('image/png'));
      }
    }
    await writeFile(`tmp/pdfs/${icao}-${part}.txt`, text);
    console.log(`${icao} ${part}: ${document.numPages} pages, ${chart.name}, effective ${chart.publishAt?.toISOString().slice(0, 10)}`);
    await task.destroy();
  }
}
