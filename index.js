const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const qrcodeImage = require('qrcode');
const pino = require('pino');
const { getEquipeByDDD, placas, modelos, hoteis } = require('./dados');
const db = require('./database');
const tickets = require('./tickets');
const reports = require('./reports');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');
const fs = require('fs');
require('dayjs/locale/pt-br');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('pt-br');

const states = {};
// SEU NÚMERO (Admin)
const adminNumber = "5511963534626@s.whatsapp.net";
const allowedNumbers = [
  adminNumber, 
  "557599565762@s.whatsapp.net",
  "5511959316952@s.whatsapp.net"
];

function isAllowedDDD(jid) {
  const ddd = jid.substring(2, 4);
  const allowed = ['11', '71', '73', '74', '75', '77', '81', '87', '62', '64'];
  return allowed.includes(ddd);
}

function getStateDDDs(jid) {
  const ddd = jid.substring(2, 4);
  if (['11'].includes(ddd)) return ['11'];
  if (['71', '73', '74', '75', '77'].includes(ddd)) return ['71', '73', '74', '75', '77'];
  if (['81', '87'].includes(ddd)) return ['81', '87'];
  if (['62', '64'].includes(ddd)) return ['62', '64'];
  return [ddd];
}

async function sendOrEdit(sock, jid, text, state) {
  // Forçamos o envio de uma nova mensagem para garantir visibilidade e compatibilidade
  console.log(`📤 Enviando nova mensagem para ${jid}...`);
  try {
    const sent = await sock.sendMessage(jid, { text: text });
    console.log(`✅ Mensagem enviada com sucesso!`);
    if (state) state.lastBotMsgKey = sent.key;
    return sent.key;
  } catch (err) {
    console.error(`❌ Erro ao enviar mensagem para ${jid}:`, err.message);
    throw err;
  }
}

function deleteMsgAsync(sock, jid, key) {
  sock.sendMessage(jid, { delete: key }).catch(() => {});
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('data/auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['DSD Transportes', 'Chrome', '20.0.04'],
    generateHighQualityLinkPreview: true,
    syncFullHistory: false
  });

  let isReconnecting = false;
  sock.ev.on('creds.update', saveCreds);

  // Lógica de Pareamento por Código para Railway
  if (!sock.authState.creds.registered) {
    // Você pode definir seu número aqui ou ele pedirá no console
    // Para facilitar, vou deixar um aviso nos logs
    console.log("⚠️ DISPOSITIVO NÃO CONECTADO!");
    console.log("👉 Para conectar via CÓDIGO (mais fácil no Railway):");
    console.log("1. No WhatsApp: Configurações > Dispositivos Conectados > Conectar um dispositivo");
    console.log("2. Selecione 'Conectar com número de telefone'");
    
    // Agora ele tenta pegar das variáveis de ambiente do Railway primeiro
    const phoneNumber = process.env.PAIRING_NUMBER || "5511963534626"; 
    console.log(`📞 Aguardando estabilização para solicitar código para: ${phoneNumber}...`);
    
    setTimeout(async () => {
        if (sock.authState.creds.registered) return;
        try {
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n************************************`);
            console.log(`🚀 SEU CÓDIGO DE PAREAMENTO: ${code}`);
            console.log(`************************************\n`);
        } catch (err) {
            console.error("❌ Erro ao solicitar código (pode ser limite de tentativas):", err.message);
            console.log("💡 Dica: Tente reiniciar o serviço no Railway em 5 minutos.");
        }
    }, 15000);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('📱 QR CODE GERADO (caso prefira):');
      qrcode.generate(qr, {small: true});
    }
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      const errorMsg = lastDisconnect?.error?.message || 'Unknown error';
      console.log(`❌ Conexão fechada. Razão: ${reason} - ${errorMsg}`);

      if (reason === 401 || reason === 408) {
        if (fs.existsSync('./data/auth_info_baileys')) {
          fs.rmSync('./data/auth_info_baileys', { recursive: true, force: true });
          console.log('🧹 Sessão limpa.');
        }
      }
      
      // Reconecta em quase todos os casos, exceto logout
      if (reason !== DisconnectReason.loggedOut && !isReconnecting) {
        isReconnecting = true;
        console.log('🔄 Tentando reconectar em 10 segundos...');
        setTimeout(() => {
          isReconnecting = false;
          connectToWhatsApp();
        }, 10000);
      }
    } else if (connection === 'open') {
      await db.init();
      const botNumber = sock.user.id.split(':')[0];
      console.log(`🚀 DSD Bot TURBO + RANKING ONLINE`);
      console.log(`🤖 Conectado como: ${botNumber}`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      console.log(`📡 Novo evento de mensagem (Tipo: ${type}) - Total: ${messages.length}`);
      const msg = messages[0];
      const jid = msg.key.remoteJid;
      const userJid = msg.key.participant || jid;

      console.log(`📡 Evento de mensagem [${type}] de: ${userJid}`);
      
      if (!msg.message) {
          console.log("ℹ️ Mensagem sem conteúdo.");
          return;
      }
      const cleanNumber = userJid.split('@')[0];
      
console.log(`--- EVENTO RECEBIDO ---`);
      console.log(`JID (Chat): ${jid}`);
      console.log(`User (Pessoa): ${userJid}`);
      console.log(`Tipo msg: ${JSON.stringify(Object.keys(msg.message))}`);
      const rawText = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.buttonsResponseMessage?.selectedButtonId || msg.message.listResponseMessage?.singleSelectReply?.selectedRowId || '';
      console.log(`Texto: "${rawText}"`);
      console.log(`-----------------------`);

      // LIBERADO PARA TESTE: Aceita qualquer um
      const isAuthorized = true;

      if (!isAuthorized) {
          console.log(`🚫 Acesso negado para: ${userJid}`);
          return;
      }

      try {
        await sock.readMessages([msg.key]);
      } catch (e) {
        console.log("⚠️ Não foi possível marcar como lida (normal para @lid).");
      }

      const text = (
        msg.message.conversation || 
        msg.message.extendedTextMessage?.text || 
        msg.message.buttonsResponseMessage?.selectedButtonId ||
        msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
        ""
      ).trim();
      const caption = (msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "").toLowerCase().trim();
      const command = (text.toLowerCase().trim() || caption);

      console.log(`📌 Command detectado: "${command}"`);

      // LISTA DE FRASES QUE O BOT USA (para evitar que ele responda a si mesmo)
      const botPhrases = [
        '🚩 *REGISTRO DE VIAGEM*',
        'Selecione os membros',
        'Selecione a Placa',
        'Selecione o Modelo',
        'Informe o *número da saída*',
        'Digite o Destino',
        'Horário de Saída',
        'Quantidade de *Motos*',
        'Quantidade de *Coletas*',
        'Quantidade de *Motores*',
        'Horário de Chegada',
        'Alguma observação',
        '📄 *TICKET DE VIAGEM*',
        '📍 *ASSISTENTE DSD',
        'Escolha a equipe'
      ];
      
      const normalizedText = text.replace(/\*/g, '').toLowerCase();
      const isBotPrompt = botPhrases.some(phrase => 
        normalizedText.includes(phrase.replace(/\*/g, '').toLowerCase())
      );

      // Se a mensagem for do bot (fromMe) e contiver frases do sistema, ignoramos
      console.log(`🔍 Verificando: fromMe=${msg.key.fromMe}, isBotPrompt=${isBotPrompt}, state=${!!states[jid]}`);
      
      if (msg.key.fromMe && isBotPrompt) {
        console.log("🤖 Ignorando prompt enviado pelo próprio bot.");
        return;
      }

      // Se for uma mensagem muito longa e for fromMe, provavelmente é um menu sincronizado, ignoramos
      if (msg.key.fromMe && text.length > 100 && (text.includes('\n') || isBotPrompt)) {
        console.log("🤖 Ignorando mensagem longa/menu sincronizada do dono.");
        return;
      }

      // Se for fromMe e não for um comando inicial, só processamos se houver um estado ativo
      if (msg.key.fromMe && !['novo', 'resumo', 'pdf', 'menu', 'gerar', 'ajuda', 'dsd', 'ranking'].includes(command)) {
        if (!states[jid]) {
          console.log("ℹ️ Ignorando mensagem do dono (sem estado ativo e não é comando).");
          return;
        }
        console.log("✅ Processando resposta do dono (interação no fluxo).");
      }


      // COMANDO SECRETO DE RANKING (Apenas Admins/Permitidos)
      const rankingAllowed = [
        adminNumber.split('@')[0].slice(-8), 
        "79526432", 
        "59316952"
      ];
      const isAllowedRanking = rankingAllowed.some(num => cleanNumber.endsWith(num));

      if (command === 'ranking' && isAllowedRanking) {
        const mesAtual = dayjs().format('MM-YYYY');
        const rows = await db.getRanking(mesAtual);
        
        if (rows.length === 0) {
          await sock.sendMessage(jid, { text: "📭 Nenhum dado de ranking para este mês ainda." });
          return;
        }

        let mRanking = `🏆 *RANKING MENSAL DSD*\n📅 *${dayjs().format('MMMM/YYYY').toUpperCase()}*\n`;
        mRanking += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Filtrar e ordenar os dados
        const validRows = rows.filter(r => !r.equipe.includes("thids") && !r.equipe.includes("Admin"));

        validRows.forEach((row, index) => {
          let medal = '👤';
          if (index === 0) medal = '🥇';
          else if (index === 1) medal = '🥈';
          else if (index === 2) medal = '🥉';

          mRanking += `${medal} *${index + 1}º Lugar:* ${row.equipe}\n`;
          mRanking += `╰ 🏍️ *${row.total_motos}* motos | 🛣️ *${row.viagens}* viagens\n\n`;
        });

        mRanking += `━━━━━━━━━━━━━━━━━━━━━━\n💡 _Este ranking é atualizado em tempo real conforme os tickets são gerados._`;
        
        await sock.sendMessage(jid, { text: mRanking });
        return;
      }

      if (command === 'apagar' || command === 'excluir' || command === 'limpar') {
        deleteMsgAsync(sock, jid, msg.key);
        delete states[jid];
        return;
      }

if (command === 'gerar' || command === 'ajuda' || command === 'menu' || command === 'dsd') {
        try {
          const m = `📍 *ASSISTENTE DSD - COMANDOS*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n1️⃣  *novo*  →  Registrar Viagem\n2️⃣  *resumo*  →  Relatório de Hoje\n3️⃣  *pdf*  →  Baixar Relatório (PDF)\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n💡 *DURANTE O PREENCHIMENTO:*\n⬅️ Digite *voltar* para corrigir.\n❌ Digite *cancelar* para encerrar.\n━━━━━━━━━━━━━━━━━━━━━━━━`;
          console.log(`📤 Enviando menu para ${jid}`);
          await sock.sendMessage(jid, { text: m });
          console.log(`✅ Menu enviado!`);
        } catch (err) {
          console.error(`❌ Erro ao enviar menu:`, err.message);
        }
        return;
      }

      if (command === 'pdf') {
        const ddds = getStateDDDs(userJid);
        const rows = await db.getAllTickets(ddds);
        if (rows.length === 0) return await sock.sendMessage(jid, { text: "Sem dados." });
        const { filePath, fileName } = await reports.generatePDF(rows);
        await sock.sendMessage(userJid, { document: fs.readFileSync(filePath), fileName: fileName, mimetype: 'application/pdf' });
        fs.unlinkSync(filePath);
        return;
      }

      if (states[jid] && (command === 'cancelar' || command === 'sair')) {
        deleteMsgAsync(sock, jid, msg.key);
        delete states[jid];
        await sock.sendMessage(jid, { text: "❌ Registro encerrado." });
        return;
      }

if (command === 'novo') {
        try {
          const equipeFiltrada = getEquipeByDDD(userJid);
          const solicitante = msg.pushName || "Motorista";
          states[jid] = { step: 'equipe_saida', lastUpdate: Date.now(), equipeFiltrada, data: { tipo: 'SAIDA', solicitante, sender_jid: userJid } };
          let m = `🚩 *REGISTRO DE VIAGEM*\n👤 Responsável: *${solicitante}*\n\n👥 Selecione os membros da equipe:\n`;
          equipeFiltrada.forEach((n, i) => m += `${i + 1}. ${n}\n`);
          console.log(`📤 Enviando para ${jid}: ${m.substring(0, 50)}...`);
          await sendOrEdit(sock, jid, m, states[jid]);
          console.log(`✅ Mensagem enviada com sucesso!`);
          deleteMsgAsync(sock, jid, msg.key);
        } catch (err) {
          console.error(`❌ Erro ao enviar mensagem:`, err.message);
        }
        return;
      }

      if (command === 'resumo') {
        const ddds = getStateDDDs(userJid);
        const rows = await db.getReport('dia', ddds);
        await sock.sendMessage(jid, { text: tickets.formatReport(rows, 'Hoje') });
        return;
      }

      const state = states[jid];
      if (!state) return;
      state.lastUpdate = Date.now();

if (command === 'voltar') {
        deleteMsgAsync(sock, jid, msg.key);
        const steps = ['equipe_saida', 'placa_saida', 'caminhao', 'num_saida', 'destino_saida', 'horario_saida', 'motos', 'coleta', 'motores', 'observacao'];
        const idx = steps.indexOf(state.step);
        if (idx > 0) {
          if (state.step === 'observacao') state.data.observacao = '';
          state.step = steps[idx - 1];
        }
        
        let mBack = "🔄 Voltando...\n";
        if (state.step === 'equipe_saida') {
          mBack += `👥 Selecione os membros da equipe:\n`;
          state.equipeFiltrada.forEach((n, i) => mBack += `${i + 1}. ${n}\n`);
        } else if (state.step === 'placa_saida') {
          mBack += `🚗 *Selecione a Placa:*\n`;
          placas.forEach((p, i) => mBack += `${i + 1}. ${p.placa}\n`);
        } else if (state.step === 'caminhao') {
          mBack += `🚚 *Selecione o Modelo:*\n`;
          modelos.forEach((m, i) => mBack += `${i + 1}. ${m}\n`);
        } else if (state.step === 'num_saida') {
          mBack += `🔢 Informe o *número da saída*:`;
        } else if (state.step === 'destino_saida') {
          mBack += `📍 *Digite o Destino*:`;
        } else if (state.step === 'horario_saida') {
          mBack += `🕐 Informe o *Horário de Saída*:`;
        } else if (state.step === 'motos') {
          mBack += `🏍️ Quantidade de *Motos*:`;
        } else if (state.step === 'coleta') {
          mBack += `📋 Quantidade de *Coletas*:`;
} else if (state.step === 'motores') {
          mBack += `⚙️ Quantidade de *Motores*:`;
        } else if (state.step === 'observacao') {
          mBack += `📝 Alguma observação? (ou 'não')`;
        }
        await sendOrEdit(sock, jid, mBack, state);
        return;
      }

      switch (state.step) {
        case 'equipe_saida': {
          console.log(`👥 Processando equipe_saida. Texto recebido: "${text}"`);
          const matches = text.match(/\d+/g);
          console.log(`🔢 Números encontrados: ${JSON.stringify(matches)}`);
          if (!matches) {
            console.log("⚠️ Nenhum número encontrado na mensagem.");
            return;
          }
          const sel = matches.map(n => parseInt(n) - 1);
          const names = sel.map(i => state.equipeFiltrada[i]).filter(n => n);
          console.log(`👤 Nomes selecionados: ${JSON.stringify(names)}`);
          if (names.length === 0) {
            console.log("⚠️ Nenhum nome válido selecionado.");
            return;
          }
          state.data.equipe = names.join(', ');
          state.step = 'placa_saida';
          let mP = `🚗 *Selecione a Placa:*\n`;
          placas.forEach((p, i) => mP += `${i + 1}. ${p.placa}${p.modelo ? ` (${p.modelo})` : ''}\n`);
          await sendOrEdit(sock, jid, mP, state);
          break;
        }
        case 'placa_saida': {
          const pIdx = parseInt(text) - 1;
          const placaSel = placas[pIdx];
          if (!placaSel) return;
          state.data.placa = placaSel.placa;
          if (placaSel.modelo) { 
            state.data.caminhao = placaSel.modelo; 
            state.step = 'num_saida'; 
            await sendOrEdit(sock, jid, `🔢 Informe o *número da saída*:`, state);
          } else { 
            state.step = 'caminhao'; 
            let mM = `🚚 *Selecione o Modelo:*\n`; 
            modelos.forEach((m, i) => mM += `${i + 1}. ${m}\n`); 
            await sendOrEdit(sock, jid, mM, state);
          }
          break;
        }
        case 'caminhao': {
          const mIdx = parseInt(text) - 1;
          const modeloSel = modelos[mIdx];
          if (!modeloSel) return;
          state.data.caminhao = modeloSel; state.step = 'num_saida';
          await sendOrEdit(sock, jid, `🔢 Informe o *número da saída*:`, state);
          break;
        }
        case 'num_saida': {
          const num = parseInt(text); if (isNaN(num)) return;
          state.data.num_saida = num; state.step = 'destino_saida';
          await sendOrEdit(sock, jid, "📍 *Digite o Destino*:", state);
          break;
        }
        case 'destino_saida': {
          if (text.length < 2) return;
          state.data.destino = text.trim().charAt(0).toUpperCase() + text.trim().slice(1);
          state.step = 'horario_saida';
          await sendOrEdit(sock, jid, "🕐 Informe o *Horário de Saída* (ex: 07:30):", state);
          break;
        }
        case 'horario_saida': {
          if (!text.match(/^\d{1,2}[:h]\d{2}$/)) return;
          state.data.horario = text.replace('h', ':'); state.step = 'motos';
          await sendOrEdit(sock, jid, "🏍️ Quantidade de *Motos*:", state);
          break;
        }
        case 'motos': {
          const val = parseInt(text); if (isNaN(val)) return;
          state.data.quantidade = val; state.data.entregas = val; state.step = 'coleta';
          await sendOrEdit(sock, jid, "📋 Quantidade de *Coletas*:", state);
          break;
        }
        case 'coleta': {
          const val = parseInt(text); if (isNaN(val)) return;
          state.data.coleta = val; state.step = 'motores';
          await sendOrEdit(sock, jid, "⚙️ Quantidade de *Motores*:", state);
          break;
        }
case 'motores': {
          const val = parseInt(text); if (isNaN(val)) return;
          state.data.motores = val; state.step = 'horario_chegada';
          await sendOrEdit(sock, jid, "🏁 Informe o *Horário de Chegada* (ex: 17:30):", state);
          break;
        }
        case 'horario_chegada': {
          if (!text.match(/^\d{1,2}[:h]\d{2}$/)) return;
          state.data.horario_chegada = text.replace('h', ':'); state.step = 'observacao';
          await sendOrEdit(sock, jid, "📝 Alguma observação?\n\nDigite ou envie 'não'.\n⬅️ Digite *voltar* para corrigir.", state);
          break;
        }
        case 'observacao': {
          const obsText = text.toLowerCase().trim();
          if (['não', 'nao', 'n', 'nil', 'none', 'sem', 'ninguem'].includes(obsText)) {
            state.data.observacao = '';
          } else {
            state.data.observacao = text;
          }
          state.data.data = dayjs().tz('America/Sao_Paulo').format('DD-MM-YYYY');
          state.data.dia_semana = dayjs().tz('America/Sao_Paulo').format('dddd');
          state.data.ticket_id = tickets.generateTicketId();
          console.log('DEBUG - Observacao:', state.data.observacao);
          try {
            await db.saveTicket(state.data);
          } catch (dbErr) {
            console.error('❌ Erro ao salvar no banco:', dbErr);
            await sock.sendMessage(jid, { text: "❌ Erro ao salvar ticket no banco de dados." });
            return;
          }
          let finalMsg = `━━━━━━━━━━━━━━━━━━━━━━━━\n📄 *TICKET DE VIAGEM*\n━━━━━━━━━━━━━━━━━━━━━━━━\n🔖 Nº: ${state.data.ticket_id}\n📅 Data: ${state.data.data} (${state.data.dia_semana})\n👤 Responsável: ${state.data.solicitante}\n👥 Equipe: ${state.data.equipe}\n🚗 Placa: *${state.data.placa || '-'}*\n🚚 Modelo: ${state.data.caminhao || '-'}\n🔢 Saída Nº: ${state.data.num_saida || '-'}\n📍 Destino: ${state.data.destino}\n🕐 Saída: ${state.data.horario}\n🏁 Chegada: ${state.data.horario_chegada}\n🏍️ Motos: ${state.data.quantidade}\n📋 Coletas: ${state.data.coleta}\n⚙️ Motores: ${state.data.motores}\n`;
          if (state.data.observacao && state.data.observacao.length > 0) {
            finalMsg += `📝 Obs: ${state.data.observacao}\n`;
          }
          finalMsg += `━━━━━━━━━━━━━━━━━━━━━━━━\n✅ Viagem registrada com sucesso!`;
          await sendOrEdit(sock, jid, finalMsg, state);
          delete states[jid];
          break;
        }
      }
      
      if (state && state.step !== 'observacao') {
        deleteMsgAsync(sock, jid, msg.key);
      }

    } catch (err) { console.error(err); }
  });
}
connectToWhatsApp();
