const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const qrcodeImage = require('qrcode');
const pino = require('pino');
const { getEquipeByDDD, placas, modelos } = require('./dados');
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

console.log('******************************************');
console.log('🏁 DSD BOT: INICIANDO PROCESSO...');
console.log('******************************************');

const states = {};
const msgCache = new Set();

// NÚMEROS AUTORIZADOS (Admin e Gestores)
const adminNumber = "5511963534626@s.whatsapp.net";
const allowedNumbers = [
  adminNumber, 
  "5511959316952@s.whatsapp.net", // Lucas
  "5511979526432@s.whatsapp.net", // Bruno
  "5511981090174@s.whatsapp.net"  // Adilson
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
    if (state) {
      state.lastBotMsgKey = sent.key;
      if (!state.msgKeys) state.msgKeys = [];
      state.msgKeys.push(sent.key);
    }
    return sent.key;
  } catch (err) {
    console.error(`❌ Erro ao enviar mensagem para ${jid}:`, err.message);
    throw err;
  }
}

async function clearFlow(sock, jid, msgKeys) {
  if (!msgKeys || msgKeys.length === 0) return;
  console.log(`🧹 Limpando fluxo: apagando ${msgKeys.length} mensagens...`);
  for (const key of msgKeys) {
    try {
      await sock.sendMessage(jid, { delete: key });
    } catch (e) {
      // Ignora erros se a mensagem já foi apagada ou não encontrada
    }
  }
}

function deleteMsgAsync(sock, jid, key) {
  sock.sendMessage(jid, { delete: key }).catch(() => {});
}

async function connectToWhatsApp() {
  console.log('\n' + '='.repeat(50));
  console.log('🤖 DSD BOT: INICIANDO CONEXÃO...');
  console.log('--------------------------------------------------');
  console.log('🔍 Verificando variáveis de ambiente:');
  console.log(`   - RESET_SESSION: "${process.env.RESET_SESSION}"`);
  console.log(`   - PAIRING_NUMBER: "${process.env.PAIRING_NUMBER || 'Padrão'}"`);
  console.log('--------------------------------------------------');

  // Se a variável RESET_SESSION for true, apaga a pasta de autenticação de forma agressiva
  if (String(process.env.RESET_SESSION).toLowerCase().trim() === 'true') {
    console.log('🧹 [RESET] Detectado! Limpando dados da sessão...');
    const pathsToClean = ['./data/auth_info_baileys', 'data/auth_info_baileys', './auth_info_baileys'];
    
    pathsToClean.forEach(p => {
      try {
        if (fs.existsSync(p)) {
          fs.rmSync(p, { recursive: true, force: true });
          console.log(`   ✅ Pasta removida: ${p}`);
        }
      } catch (e) {
        console.log(`   ❌ Erro ao remover ${p}: ${e.message}`);
      }
    });
  }

  const sessionDir = 'data/auth_info_baileys';
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`📡 Versão do WhatsApp Web: ${version.join('.')}`);
  console.log('==================================================\n');

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['DSD Transportes', 'Chrome', '20.0.04'],
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    printQRInTerminal: false // Vamos gerenciar o QR manualmente para ser mais limpo
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
    
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n==================================================');
      console.log('📌 NOVO QR CODE GERADO!');
      console.log('--------------------------------------------------');
      console.log(`👉 LINK PARA SCAN (Copie e cole no navegador):`);
      console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
      console.log('--------------------------------------------------');
      
      // Gera no terminal
      qrcode.generate(qr, {small: true});
      
      // Salva em arquivo para visualização fácil
      await qrcodeImage.toFile('./qrcode.png', qr);
      console.log('💾 Arquivo "qrcode.png" gerado na raiz.');
      console.log('==================================================\n');

      const envNumber = process.env.PAIRING_NUMBER;
      let phoneNumber = envNumber || "5511963534626";
      phoneNumber = phoneNumber.replace(/\D/g, '');
      
      if (!sock.authState.creds.registered && !isReconnecting) {
          console.log(`\n💡 DICA: Se o QR Code não aparecer no log, o link acima é a melhor opção.`);
          console.log(`🚀 Ou aguarde 30s para o CÓDIGO DE PAREAMENTO aparecer...`);
          
          if (!global.pairingTimeout) {
            global.pairingTimeout = setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log(`\n************************************`);
                    console.log(`🔥 CÓDIGO PARA PAREAMENTO: ${code}`);
                    console.log(`👉 Use este código no WhatsApp em 'Conectar com número de telefone'`);
                    console.log(`************************************\n`);
                } catch (err) {
                    console.log("❌ Erro ao gerar código:", err.message);
                }
            }, 10000); // Reduzi para 10s para ser mais rápido
          }
      }
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
      
      // Notifica o admin que o bot subiu
      try {
        await sock.sendMessage(adminNumber, { text: `✅ *DSD BOT ONLINE!* \n🚀 O sistema foi reiniciado e está pronto para uso.\n\nDigite *menu* para começar.` });
      } catch (e) {
        console.log("⚠️ Não foi possível enviar msg de início (normal se for a 1ª vez).");
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      console.log(`📡 Novo evento de mensagem (Tipo: ${type}) - Total: ${messages.length}`);
      const msg = messages[0];
      const jid = msg.key.remoteJid;
      const userJid = msg.key.participant || jid;

      console.log(`📡 Evento de mensagem [${type}] de: ${userJid}`);
      
      // CACHE DE MENSAGENS PARA EVITAR DUPLICIDADE
      const msgId = msg.key.id;
      if (msgCache.has(msgId)) {
          console.log(`♻️ Ignorando mensagem duplicada: ${msgId}`);
          return;
      }
      msgCache.add(msgId);
      if (msgCache.size > 500) {
          const first = msgCache.values().next().value;
          msgCache.delete(first);
      }

      if (!msg.message) return;
      
      // LIMPEZA DE JID (Remove sufixos :1, :2 etc)
      const senderJid = userJid.split(':')[0].split('@')[0] + '@s.whatsapp.net';
      const cleanNumber = senderJid.split('@')[0];
      
      console.log(`--- EVENTO RECEBIDO ---`);
      console.log(`JID (Chat): ${jid}`);
      console.log(`Sender (Pessoa): ${senderJid}`);
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

      let text = (
        msg.message.conversation || 
        msg.message.extendedTextMessage?.text || 
        msg.message.buttonsResponseMessage?.selectedButtonId ||
        msg.message.listResponseMessage?.singleSelectReply?.selectedRowId || 
        ""
      ).trim();
      
      const caption = (msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "").toLowerCase().trim();
      let command = (text.toLowerCase().trim() || caption);

      // MAPEAMENTO DE NÚMEROS DO MENU PARA COMANDOS
      if (command === '1') command = 'novo';
      if (command === '2') command = 'resumo';
      if (command === '3') command = 'pdf';
      if (command === '4') command = 'ranking';
      if (command === '5') command = 'ranking horas';
      if (command === '6') command = 'info';

      console.log(`📌 Command detectado: "${command}" (Original: "${text}")`);

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

      // 1. SE FOR UM PROMPT DO BOT (MENSAGEM AUTOMÁTICA), IGNORA SEMPRE
      if (msg.key.fromMe && isBotPrompt) {
        return;
      }

      // 2. COMANDOS DE TESTE E EMERGÊNCIA (FUNCIONAM SEMPRE)
      if (command === 'ping') {
        await sock.sendMessage(jid, { text: '🏓 PONG! O bot está online e processando comandos.' });
        return;
      }

      // 3. COMANDOS INICIAIS (NOVO, MENU, ETC) - PRIORIDADE MÁXIMA
      const validCommands = ['novo', 'resumo', 'pdf', 'menu', 'gerar', 'ajuda', 'dsd', 'ranking', 'info', 'voltar', 'cancelar', 'sair'];
      const primaryCommand = command.split(' ')[0];
      const isInitialCommand = validCommands.includes(primaryCommand);

      // 4. SE FOR DO DONO E NÃO FOR UM COMANDO NEM ESTIVER NO MEIO DE UM FLUXO, IGNORA
      if (msg.key.fromMe && !isInitialCommand && !states[jid]) {
        console.log(`ℹ️ Ignorando mensagem do dono (não é comando e sem estado ativo).`);
        return;
      }


      if (command === 'resumo') {
        const ddds = getStateDDDs(userJid);
        const rows = await db.getReport('dia', ddds);
        await sock.sendMessage(jid, { text: tickets.formatReport(rows, 'Hoje') });
        return;
      }

      // COMANDO DE RANKING E INFORMAÇÕES (Prioridade sobre o fluxo)
      const isAllowedRanking = allowedNumbers.some(num => senderJid.includes(num.split('@')[0]));
      if (isAllowedRanking) {
        const [cmd, ...args] = command.split(' ');
        
        if (cmd === 'ranking') {
          const mesAtual = dayjs().format('MM-YYYY');
          let tipo = 'motos';
          let modo = 'individual';

          if (args.some(a => ['horas', 'extra', 'hora'].includes(a))) tipo = 'horas';
          else if (args.some(a => ['coleta', 'coletas'].includes(a))) tipo = 'coletas';
          else if (args.some(a => ['motor', 'motores'].includes(a))) tipo = 'motores';

          if (args.some(a => ['equipe', 'equipes', 'time'].includes(a))) modo = 'equipe';
          if (args.some(a => ['individual', 'pessoa', 'geral'].includes(a))) modo = 'individual';

          console.log(`📊 Consultando Ranking: ${mesAtual}, Tipo: ${tipo}, Modo: ${modo}`);
          const rows = await db.getRanking(mesAtual, tipo, modo);
          
          if (rows.length === 0) {
            await sock.sendMessage(jid, { text: "📭 Nenhum dado para este mês ainda." });
            return;
          }

          let title = "🏍️ RANKING DE MOTOS";
          let unit = "motos";
          let field = `total_${tipo}`;

          if (tipo === 'horas') { title = "🕒 RANKING DE HORAS EXTRAS"; unit = "h extras"; }
          if (tipo === 'coletas') { title = "📋 RANKING DE COLETAS"; unit = "coletas"; }
          if (tipo === 'motores') { title = "⚙️ RANKING DE MOTORES"; unit = "motores"; }

          const modeTitle = modo === 'equipe' ? "(POR EQUIPE)" : "(INDIVIDUAL)";
          let mRanking = `🏆 *${title}*\n📊 *${modeTitle}*\n📅 *${dayjs().format('MMMM/YYYY').toUpperCase()}*\n`;
          mRanking += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

          const validRows = rows.filter(r => {
            const eq = (r.equipe || '').toLowerCase();
            return !eq.includes("thids") && !eq.includes("admin") && !eq.includes("bot");
          });

          validRows.forEach((row, index) => {
            let medal = '👤';
            if (index === 0) medal = '🥇';
            else if (index === 1) medal = '🥈';
            else if (index === 2) medal = '🥉';

            const valor = tipo === 'horas' ? (row[field] || 0).toFixed(1) : (row[field] || 0);
            mRanking += `${medal} *${index + 1}º:* ${row.equipe}\n`;
            mRanking += `╰ 👉 *${valor}* ${unit} | 🛣️ *${row.viagens}* viag.\n\n`;
          });

          mRanking += `━━━━━━━━━━━━━━━━━━━━━━\n💡 _Dica: "ranking [tipo] equipe"_`;
          await sock.sendMessage(jid, { text: mRanking });
          return;
        }

        if (cmd === 'info' && args.length > 0) {
          const nomeBusca = args.join(' ');
          const mesAtual = dayjs().format('MM-YYYY');
          const stats = await db.getColaboradorStats(nomeBusca, mesAtual);
          
          if (!stats) {
            await sock.sendMessage(jid, { text: `❌ Nenhuma informação encontrada para "${nomeBusca}" este mês.` });
            return;
          }

          const details = await db.getColaboradorDetails(nomeBusca, mesAtual, 5);

          let mInfo = `📊 *INDICADORES: ${stats.equipe.toUpperCase()}*\n📅 Mês: *${dayjs().format('MMMM/YYYY')}*\n`;
          mInfo += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
          mInfo += `🏍️ Motos Transportadas: *${stats.total_motos}*\n`;
          mInfo += `📋 Coletas Realizadas: *${stats.total_coletas}*\n`;
          mInfo += `⚙️ Motores Coletados: *${stats.total_motores}*\n`;
          mInfo += `🕒 Horas Extras (7h-17h): *${stats.total_horas.toFixed(1)}h*\n`;
          mInfo += `🛣️ Total de Viagens: *${stats.total_viagens}*\n\n`;
          
          mInfo += `📜 *HISTÓRICO RECENTE (Últimas 5):*\n`;
          details.forEach(t => {
            mInfo += `• ${t.data}: ${t.destino} (${t.quantidade} mot | ${t.coleta} col)\n`;
          });

          mInfo += `\n━━━━━━━━━━━━━━━━━━━━━━\n✅ _Dados extraídos do banco DSD._`;
          await sock.sendMessage(jid, { text: mInfo });
          return;
        }
      }

      // COMANDOS GERAIS
      if (command === 'apagar' || command === 'excluir' || command === 'limpar') {
        deleteMsgAsync(sock, jid, msg.key);
        delete states[jid];
        return;
      }

      if (command === 'gerar' || command === 'ajuda' || command === 'menu' || command === 'dsd') {
        try {
          const m = `📍 *ASSISTENTE DSD - COMANDOS*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n1️⃣  *novo*  →  Registrar Viagem\n2️⃣  *resumo*  →  Relatório de Hoje\n3️⃣  *pdf*  →  Baixar Relatório (PDF)\n4️⃣  *ranking*  →  Ver Ranking de Motos\n5️⃣  *ranking horas* → Ranking de Horas Extras\n6️⃣  *info [nome]* → Detalhes de um Colaborador\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n💡 *DURANTE O PREENCHIMENTO:*\n⬅️ Digite *voltar* para corrigir.\n❌ Digite *cancelar* para encerrar.\n━━━━━━━━━━━━━━━━━━━━━━━━`;
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
        const flowKeys = states[jid].msgKeys || [];
        flowKeys.push(msg.key);
        await clearFlow(sock, jid, flowKeys);
        delete states[jid];
        await sock.sendMessage(jid, { text: "❌ Registro encerrado." });
        return;
      }

      if (command === 'novo') {
        try {
          const equipeFiltrada = getEquipeByDDD(senderJid);
          const solicitante = msg.pushName || "Motorista";
          states[jid] = { 
            step: 'equipe_saida', 
            lastUpdate: Date.now(), 
            equipeFiltrada, 
            msgKeys: [msg.key],
            data: { tipo: 'SAIDA', solicitante, sender_jid: senderJid } 
          };
          let m = `🚩 *REGISTRO DE VIAGEM*\n👤 Responsável: *${solicitante}*\n\n👥 Selecione os membros da equipe:\n`;
          equipeFiltrada.forEach((n, i) => m += `${i + 1}. ${n}\n`);
          console.log(`📤 Enviando para ${jid}: ${m.substring(0, 50)}...`);
          await sendOrEdit(sock, jid, m, states[jid]);
          console.log(`✅ Mensagem enviada com sucesso!`);
        } catch (err) {
          console.error(`❌ Erro ao enviar mensagem:`, err.message);
        }
        return;
      }

      const state = states[jid];
      if (!state) return;
      state.lastUpdate = Date.now();
      if (!state.msgKeys) state.msgKeys = [];
      
      // FIX: Não adicionamos as mensagens do próprio bot (prompts) ao msgKeys aqui,
      // pois elas já são adicionadas no sendOrEdit se necessário.
      // E não adicionamos o Ticket Final (que é enviado sem 'state').
      if (!msg.key.fromMe) {
          state.msgKeys.push(msg.key);
      }

      if (command === 'voltar') {
        const steps = ['equipe_saida', 'placa_saida', 'caminhao', 'num_saida', 'destino_saida', 'horario_saida', 'motos', 'coleta', 'motores', 'observacao'];
        const idx = steps.indexOf(state.step);
        if (idx > 0) {
          if (state.step === 'observacao') state.data.observacao = '';
          state.step = steps[idx - 1];
        
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
        }
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

          // CÁLCULO DE HORAS EXTRAS (Base: Turno de 10h - 07:00 às 17:00)
          if (state.data.horario && state.data.horario_chegada) {
            const hSaida = dayjs(`${state.data.data} ${state.data.horario}`, "DD-MM-YYYY HH:mm");
            let hChegada = dayjs(`${state.data.data} ${state.data.horario_chegada}`, "DD-MM-YYYY HH:mm");
            
            if (hChegada.isBefore(hSaida)) {
              hChegada = hChegada.add(1, 'day'); // Caso vire a noite
            }
            
            const totalHoras = hChegada.diff(hSaida, 'hour', true);
            // Turno de 7h às 17h = 10 horas totais
            const extras = totalHoras > 10 ? totalHoras - 10 : 0;
            state.data.horas_extras = extras;
          } else {
            state.data.horas_extras = 0;
          }

          console.log('DEBUG - Observacao:', state.data.observacao);
          try {
            await db.saveTicket(state.data);
          } catch (dbErr) {
            console.error('❌ Erro ao salvar no banco:', dbErr);
            await sock.sendMessage(jid, { text: "❌ Erro ao salvar ticket no banco de dados." });
            return;
          }
          let finalMsg = `━━━━━━━━━━━━━━━━━━━━━━━━\n📄 *TICKET DE VIAGEM*\n━━━━━━━━━━━━━━━━━━━━━━━━\n🔖 Nº: ${state.data.ticket_id}\n📅 Data: ${state.data.data} (${state.data.dia_semana})\n👤 Responsável: ${state.data.solicitante}\n👥 Equipe: ${state.data.equipe}\n🚗 Placa: *${state.data.placa || '-'}*\n🚚 Modelo: ${state.data.caminhao || '-'}\n🔢 Saída Nº: ${state.data.num_saida || '-'}\n📍 Destino: ${state.data.destino}\n🕐 Saída: ${state.data.horario}\n🏁 Chegada: ${state.data.horario_chegada}\n🕒 Horas Extras: *${state.data.horas_extras.toFixed(1)}h*\n🏍️ Motos: ${state.data.quantidade}\n📋 Coletas: ${state.data.coleta}\n⚙️ Motores: ${state.data.motores}\n`;
          if (state.data.observacao && state.data.observacao.length > 0) {
            finalMsg += `📝 Obs: ${state.data.observacao}\n`;
          }
          finalMsg += `━━━━━━━━━━━━━━━━━━━━━━━━\n✅ Viagem registrada com sucesso!`;
          const flowKeys = [...(state.msgKeys || [])];
          await sendOrEdit(sock, jid, finalMsg); // Não passa 'state' para não incluir esta mensagem na limpeza
          await clearFlow(sock, jid, flowKeys);
          delete states[jid];
          break;
        }
      }
      
    } catch (err) { console.error(err); }
  });
}
connectToWhatsApp();
