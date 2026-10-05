export const airports = [
  { id: 'EKCH', name: 'Copenhagen', local: 'Kastrup', aliases: ['cph', 'københavn', 'kobenhavn', 'kastrup'], runways: ['04L', '04R', '22L', '22R', '12', '30'], crop: [259, 315, 255, 174] },
  { id: 'EKBI', name: 'Billund', local: '', aliases: ['bll'], runways: ['09', '27'], crop: [689, 315, 255, 174] },
  { id: 'EKYT', name: 'Aalborg', local: '', aliases: ['aal'], runways: ['08L', '08R', '26L', '26R'], crop: [1119, 315, 255, 174] },
  { id: 'EKAH', name: 'Aarhus', local: '', aliases: ['aar', 'århus', 'tirstrup'], runways: ['10L', '10R', '28L', '28R'], crop: [259, 654, 255, 166] },
  { id: 'EKRK', name: 'Roskilde', local: '', aliases: ['rke'], runways: ['03', '11', '21', '29'], crop: [689, 654, 255, 166] },
  { id: 'EKSB', name: 'Sønderborg', local: '', aliases: ['sgd', 'sonderborg'], runways: ['14', '32'], crop: [1119, 654, 255, 166] },
  { id: 'EKRN', name: 'Bornholm', local: 'Rønne', aliases: ['rnn', 'ronne', 'rønne'], runways: ['11', '29'], crop: [] },
  { id: 'EKSP', name: 'Skrydstrup', local: '', aliases: ['sks'], runways: ['10L', '10R', '28L', '28R'], crop: [] },
  { id: 'EKOD', name: 'Odense', local: 'Hans Christian Andersen', aliases: ['ode', 'hca'], runways: ['06', '24'], crop: [] },
];
export const topics = ['EKDK FIR', 'Airspace', 'LOAs', 'Phraseology', 'ATS Units', 'Parking', 'Danish AFIS procedures', 'IFR clearances', 'Wake turbulence', 'Airspace classes', 'EuroScope', 'Alias files', 'Local procedures'];
export const sources = { charts: 'https://aim.naviair.dk/', procedures: 'https://wiki.vatsim-scandinavia.org/' };
