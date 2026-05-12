const PDFDocument = require('pdfkit-table');
const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');
require('dayjs/locale/pt-br');
dayjs.locale('pt-br');

async function generatePDF(tickets, titulo = 'Relatório DSD') {
  return new Promise((resolve, reject) => {
    const fileName = `Relatorio_DSD_${dayjs().format('DD_MM_HHmm')}.pdf`;
    const filePath = path.resolve(__dirname, fileName);
    
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const stream = fs.createWriteStream(filePath);
    
    doc.pipe(stream);
    
    doc.fontSize(20).text(titulo, { align: 'center' });
    doc.moveDown();

    const processedRows = [];
    const sortedTickets = [...tickets].sort((a, b) => new Date(a.data) - new Date(b.data));
    const tempSaidas = {};

    sortedTickets.forEach(t => {
      const key = `${t.solicitante}_${t.caminhao}`;
      if (t.tipo === 'SAIDA') {
        tempSaidas[key] = t;
      } else if (t.tipo === 'CHEGADA' || t.tipo === 'PARADA') {
        const saida = tempSaidas[key];
        const dataObj = dayjs(t.data);
        const diaSemana = t.dia_semana || dataObj.format('dddd');
        
        let row = [
          t.horario_chegada || t.horario || '---',
          dataObj.format('DD/MM/YYYY'),
          diaSemana,
          saida ? saida.horario : '---',
          'NÃO',
          '0h',
          String(saida ? saida.quantidade : (t.quantidade || 0)),
          t.destino,
          '',
          t.caminhao || '',
          String(saida ? (saida.km_inicial || '') : ''),
          String(t.km_final || ''),
          t.solicitante
        ];

        if (saida && saida.horario) {
          const hSaida = parseInt(saida.horario.split(':')[0]);
          const strChegada = t.horario_chegada || t.horario || '00:00';
          const hChegada = parseInt(strChegada.split(':')[0]);
          if (!isNaN(hChegada) && !isNaN(hSaida)) {
            row[4] = (hChegada >= 22 || hChegada <= 5 || hSaida >= 22 || hSaida <= 5) ? 'SIM' : 'NÃO';
            const diff = hChegada - hSaida;
            row[5] = diff > 9 ? `${diff - 9}h` : '0h';
          }
        }

        processedRows.push(row);
        delete tempSaidas[key];
      }
    });

    Object.values(tempSaidas).forEach(s => {
      const dataObj = dayjs(s.data);
      const diaSemana = s.dia_semana || dataObj.format('dddd');
      processedRows.push([
        '---',
        dataObj.format('DD/MM/YYYY'),
        diaSemana,
        s.horario || '---',
        '---',
        '---',
        String(s.quantidade || 0),
        s.destino || '',
        '',
        s.caminhao || '',
        String(s.km_inicial || ''),
        '---',
        s.solicitante || ''
      ]);
    });

    const table = {
      title: "Viagens Registradas",
      headers: [
        { label: "Chegada", width: 50 },
        { label: "Data", width: 60 },
        { label: "Dia", width: 60 },
        { label: "Saída", width: 40 },
        { label: "Adc. Not.", width: 40 },
        { label: "Hora Ext.", width: 40 },
        { label: "Motos", width: 35 },
        { label: "Destino", width: 100 },
        { label: "Frete", width: 35 },
        { label: "Caminhão", width: 60 },
        { label: "KM Ini", width: 40 },
        { label: "KM Fin", width: 40 },
        { label: "Resp.", width: 100 }
      ],
      rows: processedRows,
    };

    doc.table(table, {
      prepareHeader: () => doc.font("Helvetica-Bold").fontSize(8),
      prepareRow: () => doc.font("Helvetica").fontSize(8),
    });

    doc.end();
    
    stream.on('finish', () => {
      resolve({ filePath, fileName });
    });
    stream.on('error', reject);
  });
}

module.exports = { generatePDF };
