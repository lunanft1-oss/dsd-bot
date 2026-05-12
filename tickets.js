const dayjs = require('dayjs');

function generateTicketId() {
  const dateStr = dayjs().format('DDMMYY-HHmmss');
  return `VGM-${dateStr}`;
}

function formatTicket(data) {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━
🚛 TICKET DE VIAGEM
━━━━━━━━━━━━━━━━━━━━━━━━
🔖 Nº: ${data.ticket_id}
📅 Data: ${data.data}
👤 Responsável: ${data.solicitante}
👥 Equipe: ${data.equipe}
🚚 Caminhão: ${data.caminhao}
🔢 Saída: ${data.num_saida}ª viagem
📦 Qtd: ${data.quantidade}
📍 Destino: ${data.destino}
🕐 Horário: ${data.horario}
📝 Obs: ${data.observacao || 'Nenhuma'}
━━━━━━━━━━━━━━━━━━━━━━━━
✅ Viagem registrada com sucesso!
  `.trim();
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
