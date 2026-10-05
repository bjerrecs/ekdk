export function isNaviairPdfUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'aim.naviair.dk' && url.port === '' && !url.username && !url.password && url.pathname.startsWith('/media/files/') && /\.pdf$/i.test(url.pathname) && !url.search;
  } catch { return false; }
}

export function matchApproachCharts(charts, runway, procedure = 'ILS') {
  const runwayPattern = new RegExp(`\\bRWY[ _]+${runway.replace(/([LRC])$/, '[ _]*$1')}\\b`, 'i');
  const procedurePattern = procedure === 'RNAV' ? /\b(?:RNAV|RNP|GNSS)\b/i : new RegExp(`\\b${procedure}\\b`, 'i');
  return charts.filter(chart => !/\b(?:SID|STAR|DEP|ARR)\b/i.test(chart.title) && runwayPattern.test(chart.title.replace(/_/g, ' ')) && procedurePattern.test(chart.title));
}

export function chartGroup(chart) {
  if (/\b(?:STAR|ARR)\b/i.test(chart.title)) return 'Arrivals';
  if (/\b(?:SID|DEP)\b/i.test(chart.title)) return 'Departures';
  if (/\b(?:ILS|LOC|RNP|RNAV|VOR|NDB|IAC)\b/i.test(chart.title)) return 'Approaches';
  if (/\b(?:ADC|GMC|PDC|APDC|VAC)\b/i.test(chart.title)) return 'Aerodrome';
  return 'References';
}
