import 'server-only';
import { NaviairClient } from 'naviair-charts';
import { isNaviairPdfUrl } from './chart-policy';

const client = new NaviairClient({
  cacheTtl: 15 * 60_000,
  fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(15_000) }),
});

export async function airportCharts(icao: string) {
  const charts = await client.getAerodromeCharts(icao, { publication: 'aip-dk' });
  return charts.filter(chart => isNaviairPdfUrl(chart.url)).map(chart => ({
    id: chart.id,
    name: chart.name,
    title: chart.title.replace(/^\d+\.\s*/, ''),
    url: chart.url,
    publication: chart.publication,
    effective: chart.publishAt?.toISOString().slice(0, 10) || null,
    withdrawn: chart.unpublishAt?.toISOString().slice(0, 10) || null,
  }));
}
