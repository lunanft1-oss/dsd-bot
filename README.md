# WhatsApp Trip Manager Bot

Protótipo funcional de um bot para gestão de viagens e logística.

## Funcionalidades
1.  **Registro de Viagem**: Comando `novo` inicia o fluxo de coleta de dados (equipe, quantidade, destino, horário e observação).
2.  **Geração de Ticket**: Ticket formatado enviado automaticamente após o preenchimento.
3.  **Relatórios**: Comandos `relatorio dia`, `relatorio semana` ou `relatorio geral` para consultar dados salvos no SQLite.

## Como Instalar e Rodar

### Pré-requisitos
- Node.js instalado (v16 ou superior).
- Um smartphone com WhatsApp para escanear o QR Code.

### Instalação
1. Abra o terminal na pasta do projeto.
2. Execute o comando para instalar as dependências:
   ```bash
   npm install
   ```

### Iniciando o Bot
1. No terminal, execute:
   ```bash
   npm start
   ```
2. Um QR Code será gerado no terminal.
3. No seu WhatsApp, vá em **Aparelhos Conectados** > **Conectar um Aparelho** e escaneie o código.
4. O bot estará ativo! Mande a palavra `novo` para começar.

## Estrutura de Arquivos
- `index.js`: Lógica principal e conexão.
- `database.js`: Operações com SQLite3.
- `tickets.js`: Formatação de textos e tickets.
- `dados.js`: Configuração de nomes da equipe e municípios.
