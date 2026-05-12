const equipePorEstado = {
  bahia: ["Ronaldo", "Marciel", "Ronivaldo", "Diogo", "Junior", "Andre", "Luan", "Will"],
  pernambuco: ["Joas", "João Paulo", "Bruno", "Fabio", "Henrrique"],
  goias: ["Robson", "Adriano", "Ivan", "Francisco"],
  saopaulo: ["Thids", "Admin"]
};

const placas = [
  { placa: 'GIO-9717', modelo: 'Truck' },
  { placa: 'ERA-2F91', modelo: null },
  { placa: 'SWA-0B35', modelo: null },
  { placa: 'FTB-5A27', modelo: null },
  { placa: 'TKW-5A15', modelo: null },
  { placa: 'TIV-7C72', modelo: null },
  { placa: 'STM-5C06', modelo: null },
];

const modelos = ['Truck', 'Toco', '3/4'];

const hoteis = [
  "Hotel Ibis - São Paulo",
  "Hotel Ibis - Campinas",  
  "Hotel Ibis - São José dos Campos",
  "Hotel Travel Inn - São Paulo",
  "Hotel Travel Inn - Campinas",
  "Hotel Express - São Paulo",
  "Hotel Express - Campinas",
  "Hotel Grabriel - São Paulo",
  "Hotel Grabriel - Campinas",
  "Pousada do Vale",
  "Another Hotel - Outro"
];

function getEquipeByDDD(jid) {
  const ddd = jid.substring(2, 4);
  
  if (['11'].includes(ddd)) return equipePorEstado.saopaulo;
  if (['71', '73', '74', '75', '77'].includes(ddd)) return equipePorEstado.bahia;
  if (['81', '87'].includes(ddd)) return equipePorEstado.pernambuco;
  if (['62', '64'].includes(ddd)) return equipePorEstado.goias;
  
  return [...equipePorEstado.saopaulo, ...equipePorEstado.bahia, ...equipePorEstado.pernambuco, ...equipePorEstado.goias];
}

module.exports = {
  getEquipeByDDD,
  placas,
  modelos,
  municipios: [],
  destinos: [],
  hoteis
};
