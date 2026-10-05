import { readFile, writeFile } from 'node:fs/promises';

// Pass ICAO codes to regenerate only those airports; the rest of the existing file is kept.
const target = 'src/lib/runway-data.json';
const requested = process.argv.slice(2).map(value => value.toUpperCase());
const output = requested.length ? JSON.parse(await readFile(target, 'utf8')) : {};
for (const icao of requested.length ? requested : ['EKCH', 'EKBI', 'EKYT', 'EKAH', 'EKRK', 'EKSB', 'EKRN', 'EKSP', 'EKOD', 'EKEB']) {
  const text = await readFile(`tmp/pdfs/${icao}-AD2.txt`, 'utf8');
  const start = text.indexOf('12. Runway Physical Characteristics');
  const section = text.slice(start, text.indexOf('13. Declared Distances', start));
  const chartText = (await readFile(`tmp/pdfs/${icao}-ADC.txt`, 'utf8')).replace(/\s/g, '');
  const physicalSource = JSON.parse(await readFile(`tmp/pdfs/${icao}-AD2.json`, 'utf8'));
  const source = JSON.parse(await readFile(`tmp/pdfs/${icao}-ADC.json`, 'utf8'));
  const runwayPattern = /^(\d{2}\s?[LRC]?)\s+([\d.]+)° GEO\s+(\d+) x (\d+) M\s+[^\n]*?(\d{2} \d{2} [\d.]+N)[^\n]*\n([\d.]+)° MAG\s+([^\n]*?)\s+(\d{3} \d{2} [\d.]+E)/gm;
  const thresholds = [...section.matchAll(runwayPattern)].map(match => {
    const latitude = match[5];
    const longitude = match[8];
    if (!chartText.includes(latitude.replace(/\s/g, '')) || !chartText.includes(longitude.replace(/\s/g, ''))) throw new Error(`${icao} ${match[1]}: threshold must be reviewed against ADC`);
    return { runway: match[1].replace(/\s/g, ''), latitude, longitude, trueBearing: Number(match[2]), magneticBearing: Number(match[6]), length: Number(match[3]), width: Number(match[4]), surface: match[7].trim() };
  });
  if (!thresholds.length || thresholds.length % 2) throw new Error(`${icao}: incomplete runway table`);
  output[icao] = { source: { name: source.name, title: source.title, url: source.url, effective: source.publishAt.slice(0, 10), retrieved: new Date().toISOString().slice(0, 10), publisher: 'NAVIAIR · AIP Denmark', derivation: 'Published WGS-84 runway threshold coordinates, cross-checked against the aerodrome chart. North-up local projection; widths exaggerated for readability. Not a taxiway chart.' }, physicalSource: { name: physicalSource.name, url: physicalSource.url, effective: physicalSource.publishAt.slice(0, 10), publisher: 'NAVIAIR · AIP Denmark' }, thresholds };
  console.log(`${icao}: ${thresholds.length} thresholds verified against ${source.name}`);
}
const content = JSON.stringify(output, null, 2);
await writeFile(target, content + '\n');
