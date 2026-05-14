const dayjs = require('dayjs');

function generateTicketId() {
  const dateStr = dayjs().format('DDMMYY-HHmmss');
  return `VGM-${dateStr}`;
}

function formatTicket(data) {
  let msg = `
━━━━━━━━━━━━━━━━━━━━━━━━
📄 *TICKET DE VIAGEM*
━━━━━━━━━━━━━━━━━━━━━━━━
🔖 Nº: ${data.ticket_id}
📅 Data: ${data.data} (${data.dia_semana || ''})
👤 Responsável: ${data.solicitante}
👥 Equipe: ${data.equipe}
🚗 Placa: *${data.placa || '-'}*
🚚 Modelo: ${data.caminhao || '-'}
🔢 Saída Nº: ${data.num_saida || '-'}
📍 Destino: ${data.destino}
🕐 Saída: ${data.horario}
🏁 Chegada: ${data.horario_chegada || '-'}
🕒 Horas Extras: *${(data.horas_extras || 0).toFixed(1)}h*
🏍️ Motos: ${data.quantidade || 0}
📋 Coletas: ${data.coleta || 0}
⚙️ Motores: ${data.motores || 0}
`.trim();

  if (data.observacao && data.observacao.toLowerCase() !== 'não') {
    msg += `\n📝 Obs: ${data.observacao}`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n✅ Viagem registrada com sucesso!`;
  return msg;
}

function formatReport(rows, title) {
  if (rows.length === 0) return `Sem viagens registradas para: ${title}`;

  let report = `📊 RELATÓRIO: ${title.toUpperCase()}\n`;
  report += `Total de viagens: ${rows.length}\n\n`;

  rows.forEach((row, index) => {
    report += `${index + 1}. ${row.destino} (${row.data}) - ${row.equipe}\n`;
  });

  return report;
}

module.exports = { generateTicketId, formatTicket, formatReport };
