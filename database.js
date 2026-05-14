const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dayjs = require('dayjs');

const fs = require('fs');
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

const dbPath = path.resolve(__dirname, 'data', 'logistica.db');
const db = new sqlite3.Database(dbPath);

function init() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Cria a tabela com os novos campos
db.run(`
        CREATE TABLE IF NOT EXISTS tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id TEXT,
          tipo TEXT DEFAULT 'SAIDA',
          data TEXT,
          solicitante TEXT,
          sender_jid TEXT,
          equipe TEXT,
          placa TEXT,
          caminhao TEXT,
          num_saida TEXT,
          quantidade INTEGER,
          entregas INTEGER DEFAULT 0,
          coleta INTEGER DEFAULT 0,
          motores INTEGER DEFAULT 0,
          destino TEXT,
          horario TEXT,
          horario_chegada TEXT,
          km_inicial INTEGER,
          km_final INTEGER,
          observacao TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) reject(err);
        
        db.run("ALTER TABLE tickets ADD COLUMN tipo TEXT DEFAULT 'SAIDA'", () => {});
        db.run("ALTER TABLE tickets ADD COLUMN km_inicial INTEGER", () => {});
        db.run("ALTER TABLE tickets ADD COLUMN km_final INTEGER", () => {});
        db.run("ALTER TABLE tickets ADD COLUMN placa TEXT", () => {});
        db.run("ALTER TABLE tickets ADD COLUMN entregas INTEGER DEFAULT 0", () => {});
        db.run("ALTER TABLE tickets ADD COLUMN coleta INTEGER DEFAULT 0", () => {});
        db.run("ALTER TABLE tickets ADD COLUMN motores INTEGER DEFAULT 0", () => {});
        db.run("ALTER TABLE tickets ADD COLUMN horario_chegada TEXT", () => {});
        db.run("ALTER TABLE tickets ADD COLUMN dia_semana TEXT", () => {});
        db.run("ALTER TABLE tickets ADD COLUMN horas_extras REAL DEFAULT 0", () => {});
        resolve();
      });
    });
  });
}

function saveTicket(data) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO tickets (
        ticket_id, tipo, data, dia_semana, solicitante, sender_jid, equipe, 
        placa, caminhao, num_saida, quantidade, entregas, coleta, motores,
        destino, horario, horario_chegada, km_inicial, km_final, observacao, horas_extras
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(query, [
      data.ticket_id, data.tipo || 'SAIDA', data.data, data.dia_semana || '', data.solicitante, data.sender_jid, 
      data.equipe, data.placa, data.caminhao, data.num_saida,
      data.quantidade || 0, data.entregas || 0, data.coleta || 0, data.motores || 0,
      data.destino, data.horario, data.horario_chegada || '', data.km_inicial || 0, data.km_final || 0, data.observacao,
      data.horas_extras || 0
    ], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getTripCountToday(jid) {
  return new Promise((resolve, reject) => {
    const today = dayjs().format('DD-MM-YYYY');
    const query = `SELECT COUNT(*) as count FROM tickets WHERE data = ? AND sender_jid = ? AND tipo = 'SAIDA'`;
    db.get(query, [today, jid], (err, row) => {
      if (err) reject(err);
      else resolve(row.count + 1);
    });
  });
}

function getIndividualStats(jid, nome) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM tickets 
      WHERE (sender_jid = ? OR equipe LIKE ?) AND tipo = 'SAIDA'
      ORDER BY created_at DESC
    `;
    db.all(query, [jid, `%${nome}%`], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getReport(periodo, ddds = []) {
  return new Promise((resolve, reject) => {
    let query = "SELECT * FROM tickets WHERE tipo = 'SAIDA'";
    let params = [];
    if (periodo === 'dia') {
      query += " AND data = ?";
      params.push(dayjs().format('DD-MM-YYYY'));
    }
    if (ddds.length > 0) {
      const likes = ddds.map(d => `sender_jid LIKE '55${d}%'`).join(' OR ');
      query += ` AND (${likes})`;
    }
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getAllTickets(ddds = []) {
  return new Promise((resolve, reject) => {
    let query = "SELECT * FROM tickets";
    if (ddds.length > 0) {
      const likes = ddds.map(d => `sender_jid LIKE '55${d}%'`).join(' OR ');
      query += ` WHERE ${likes}`;
    }
    query += " ORDER BY created_at DESC";
    
    db.all(query, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getRanking(mesAno, tipo = 'motos', modo = 'individual') {
  return new Promise((resolve, reject) => {
    let selectField = 'quantidade';
    if (tipo === 'horas') selectField = 'horas_extras';
    else if (tipo === 'coletas') selectField = 'coleta';
    else if (tipo === 'motores') selectField = 'motores';

    const query = `
      SELECT equipe, ${selectField} as valor, 1 as viagens
      FROM tickets 
      WHERE data LIKE ? AND tipo = 'SAIDA'
    `;

    console.log(`🔍 [DB] getRanking Query: ${query.replace('?', "'%" + mesAno + "'")}`);

    db.all(query, [`%${mesAno}`], (err, rows) => {
      if (err) return reject(err);
      
      console.log(`🔍 [DB] getRanking retornou ${rows.length} registros.`);

      if (modo === 'equipe') {
        // Agrupamento por equipe exata (string completa), limpando espaços extras
        const aggregated = rows.reduce((acc, row) => {
          const key = (row.equipe || 'Sem Equipe').trim();
          if (!acc[key]) acc[key] = { equipe: key, total: 0, viagens: 0 };
          acc[key].total += row.valor || 0;
          acc[key].viagens += 1;
          return acc;
        }, {});

        const result = Object.values(aggregated).sort((a, b) => b.total - a.total);
        console.log(`🔍 [DB] Ranking Equipe Processado: ${result.length} equipes encontradas.`);
        
        resolve(result.map(r => ({
          equipe: r.equipe,
          viagens: r.viagens,
          [`total_${tipo}`]: r.total
        })));
      } else {
        // Agrupamento INDIVIDUAL (quebra a string por vírgula)
        const aggregated = {};
        rows.forEach(row => {
          const nomes = (row.equipe || '').split(',').map(n => n.trim()).filter(n => n);
          nomes.forEach(nome => {
            if (!aggregated[nome]) aggregated[nome] = { equipe: nome, total: 0, viagens: 0 };
            aggregated[nome].total += row.valor || 0;
            aggregated[nome].viagens += 1;
          });
        });
        const result = Object.values(aggregated).sort((a, b) => b.total - a.total);
        resolve(result.map(r => ({
          equipe: r.equipe,
          viagens: r.viagens,
          [`total_${tipo}`]: r.total
        })));
      }
    });
  });
}

function getColaboradorStats(nome, mesAno) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        quantidade,
        coleta,
        motores,
        horas_extras
      FROM tickets
      WHERE (equipe LIKE ? OR solicitante LIKE ?) AND data LIKE ? AND tipo = 'SAIDA'
    `;
    db.all(query, [`%${nome}%`, `%${nome}%`, `%${mesAno}`], (err, rows) => {
      if (err) return reject(err);
      if (!rows || rows.length === 0) return resolve(null);

      const stats = rows.reduce((acc, row) => {
        acc.total_motos += row.quantidade || 0;
        acc.total_coletas += row.coleta || 0;
        acc.total_motores += row.motores || 0;
        acc.total_horas += row.horas_extras || 0;
        acc.total_viagens += 1;
        return acc;
      }, { total_motos: 0, total_coletas: 0, total_motores: 0, total_horas: 0, total_viagens: 0 });

      resolve({
        equipe: nome,
        ...stats
      });
    });
  });
}

function getColaboradorDetails(nome, mesAno, limit = 10) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM tickets
      WHERE (equipe LIKE ? OR solicitante LIKE ?) AND data LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `;
    db.all(query, [`%${nome}%`, `%${nome}%`, `%${mesAno}`, limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = {
  init,
  saveTicket,
  getTripCountToday,
  getIndividualStats,
  getReport,
  getAllTickets,
  getRanking,
  getColaboradorStats,
  getColaboradorDetails
};
