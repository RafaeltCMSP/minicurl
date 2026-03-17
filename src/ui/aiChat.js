/**
 * MinicUrl AI — Interface de Chat no Terminal
 * Chat interativo com streaming de tokens, comandos especiais e gestão de sessão.
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import boxen from 'boxen';
import { setTimeout as sleep } from 'timers/promises';
import { orchestrator } from '../ai/agents/orchestrator.js';
import { configManager } from '../ai/config.js';
import { RequestAgent } from '../ai/agents/requestAgent.js';
import { displayResult } from './display.js';

// ─────────────────────────────────────────────
//  PALETA DE CORES — AI Theme (cyberpunk-purple)
// ─────────────────────────────────────────────
const AI = {
  primary: chalk.hex('#A855F7'),     // violeta
  secondary: chalk.hex('#EC4899'),   // pink
  accent: chalk.hex('#06B6D4'),      // ciano
  user: chalk.hex('#00FFB2'),        // verde neon (usuário)
  ai: chalk.hex('#C084FC'),          // lilás (IA)
  dim: chalk.hex('#4A4A6A'),
  success: chalk.hex('#39FF14'),
  error: chalk.hex('#FF3131'),
  warning: chalk.hex('#FFD700'),
  muted: chalk.gray,
  white: chalk.white,
  bold: chalk.bold,
};

// ─────────────────────────────────────────────
//  BADGES DE AGENTES
// ─────────────────────────────────────────────
const AGENT_BADGES = {
  'orchestrator': AI.primary('🧠 Orquestrador'),
  'request-agent': AI.accent('⚡ Agente de Requisições'),
  'test-agent': AI.warning('🧪 Agente de Testes'),
  'explain-agent': AI.secondary('📚 Agente Explicador'),
  'debug-agent': AI.error('🔍 Agente Debugger'),
  'config-agent': AI.dim('⚙️  Config'),
  'error-handler': AI.error('⚠️  Error'),
};

// ─────────────────────────────────────────────
//  COMANDOS ESPECIAIS DO CHAT
// ─────────────────────────────────────────────
const SPECIAL_COMMANDS = {
  '/help': showChatHelp,
  '/clear': clearSession,
  '/config': showConfig,
  '/models': listModels,
  '/status': checkStatus,
  '/history': showAgentLog,
  '/sair': null,   // tratado por loop
  '/exit': null,
};

// ─────────────────────────────────────────────
//  SPLASH DA IA
// ─────────────────────────────────────────────
async function showAISplash(cfg, ollamaStatus) {
  console.log('\n');

  const lines = [
    AI.primary('  ╔══════════════════════════════════════════╗'),
    AI.primary('  ║') + AI.bold('         🤖  MinicUrl AI Assistant         ') + AI.primary('║'),
    AI.primary('  ║') + AI.dim('    Powered by Ollama · Sistema de Agentes  ') + AI.primary('║'),
    AI.primary('  ╚══════════════════════════════════════════╝'),
  ];

  for (const line of lines) {
    console.log(line);
    await sleep(60);
  }

  console.log();

  // Status do Ollama
  const statusStr = ollamaStatus.online
    ? AI.success(`● Online`) + AI.muted(` — ${ollamaStatus.models?.length || 0} modelo(s) disponíve${ollamaStatus.models?.length === 1 ? 'l' : 'is'}`)
    : AI.error(`● Offline`) + AI.warning(` — Execute: ollama serve`);

  const modelStr = AI.accent(`🤖 ${cfg.model}`);

  const infoLines = [
    `  ${AI.dim('Modelo:')}      ${modelStr}`,
    `  ${AI.dim('Ollama:')}      ${statusStr}`,
    `  ${AI.dim('URL:')}         ${AI.muted(cfg.ollamaUrl)}`,
    `  ${AI.dim('Streaming:')}   ${cfg.streaming ? AI.success('ativo') : AI.muted('inativo')}`,
    '',
    `  ${AI.dim('Comandos:')} ${AI.primary('/help')} ${AI.dim('·')} ${AI.primary('/config')} ${AI.dim('·')} ${AI.primary('/models')} ${AI.dim('·')} ${AI.primary('/clear')} ${AI.dim('·')} ${AI.primary('/sair')}`,
  ];

  const box = boxen(infoLines.join('\n'), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { left: 2 },
    borderStyle: 'round',
    borderColor: '#A855F7',
  });

  console.log(box);
  console.log();

  if (!ollamaStatus.online) {
    console.log(AI.warning('  ⚠️  Ollama não detectado. O chat ficará em modo limitado.'));
    console.log(AI.dim('  Instale e inicie: https://ollama.ai → ollama serve\n'));
  }
}

// ─────────────────────────────────────────────
//  RENDER — mensagens no terminal
// ─────────────────────────────────────────────
function printSeparator() {
  console.log(AI.dim('  ' + '─'.repeat(54)));
}

function printUserMessage(text) {
  console.log('\n' + AI.dim('  ┌── ') + AI.user('Você'));
  const lines = text.split('\n');
  for (const line of lines) {
    console.log(AI.dim('  │ ') + AI.white(line));
  }
  console.log(AI.dim('  └─────'));
}

function printAgentHeader(agentUsed) {
  const badge = AGENT_BADGES[agentUsed] || AI.primary(`🤖 ${agentUsed}`);
  console.log('\n' + AI.dim('  ┌── ') + badge);
  console.log(AI.dim('  │'));
}

function printAgentToken(token) {
  // Streaming: escrevemos token a token sem quebra de linha
  process.stdout.write(AI.ai(token));
}

function printAgentEnd() {
  console.log('\n' + AI.dim('  └─────'));
}

function printStats(stats) {
  if (!stats || !stats.responseTokens) return;
  const parts = [];
  if (stats.responseTokens) parts.push(`${stats.responseTokens} tokens`);
  if (stats.durationMs) parts.push(`${stats.durationMs}ms`);
  if (stats.model) parts.push(stats.model);
  console.log(AI.dim(`  · ${parts.join(' · ')}`));
}

// ─────────────────────────────────────────────
//  SPINNER
// ─────────────────────────────────────────────
function createAISpinner(text = 'Pensando...') {
  const frames = ['◐', '◓', '◑', '◒'];
  let i = 0;
  let timer;
  return {
    start() {
      process.stdout.write('\n');
      timer = setInterval(() => {
        process.stdout.write(`\r  ${AI.primary(frames[i % frames.length])} ${AI.dim(text)}`);
        i++;
      }, 100);
    },
    stop() {
      clearInterval(timer);
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    },
  };
}

// ─────────────────────────────────────────────
//  COMANDOS ESPECIAIS
// ─────────────────────────────────────────────
async function showChatHelp() {
  const box = boxen(
    [
      AI.primary('Comandos disponíveis no chat:'),
      '',
      `  ${AI.accent('/help')}            ${AI.muted('— Esta ajuda')}`,
      `  ${AI.accent('/config')}          ${AI.muted('— Ver/editar configuração')}`,
      `  ${AI.accent('/config url <url>')}${AI.muted(' — Trocar URL do Ollama')}`,
      `  ${AI.accent('/config model <m>')}${AI.muted(' — Trocar modelo')}`,
      `  ${AI.accent('/config key <k>')}  ${AI.muted('— Definir API key')}`,
      `  ${AI.accent('/models')}          ${AI.muted('— Listar modelos locais')}`,
      `  ${AI.accent('/status')}          ${AI.muted('— Status do Ollama')}`,
      `  ${AI.accent('/history')}         ${AI.muted('— Log de agentes ativados')}`,
      `  ${AI.accent('/clear')}           ${AI.muted('— Limpar histórico da sessão')}`,
      `  ${AI.accent('/sair')}            ${AI.muted('— Voltar ao menu principal')}`,
      '',
      AI.dim('Dicas de uso:'),
      `  ${AI.muted('"Crie um POST para https://api.com/users com JSON"')}`,
      `  ${AI.muted('"Gere uma suite de testes para esta API"')}`,
      `  ${AI.muted('"Explique o erro 401 que acabei de ver"')}`,
      `  ${AI.muted('"Por que minha requisição falhou?"')}`,
    ].join('\n'),
    {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { left: 2 },
      borderStyle: 'round',
      borderColor: '#06B6D4',
    }
  );
  console.log('\n' + box);
}

async function clearSession() {
  orchestrator.clearSession();
  console.log(AI.success('\n  ✓ Histórico da sessão limpo.\n'));
}

async function showConfig(args, cfg) {
  const [, subCmd, ...rest] = args;

  if (!subCmd || subCmd === 'show') {
    const current = await configManager.get();
    const lines = [
      AI.primary('⚙️  Configuração atual:'),
      '',
      `  ${AI.dim('URL Ollama:')}   ${AI.accent(current.ollamaUrl)}`,
      `  ${AI.dim('Modelo:')}       ${AI.accent(current.model)}`,
      `  ${AI.dim('API Key:')}      ${current.apiKey ? AI.muted('***' + current.apiKey.slice(-4)) : AI.muted('(não definida)')}`,
      `  ${AI.dim('Streaming:')}    ${current.streaming ? AI.success('ativo') : AI.muted('inativo')}`,
      `  ${AI.dim('Temperatura:')}  ${AI.muted(String(current.temperature))}`,
      `  ${AI.dim('Max Tokens:')}   ${AI.muted(String(current.maxTokens))}`,
      `  ${AI.dim('Arquivo:')}      ${AI.muted(configManager.getConfigPath())}`,
    ];
    console.log('\n' + boxen(lines.join('\n'), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { left: 2 }, borderStyle: 'round', borderColor: '#A855F7',
    }) + '\n');
    return;
  }

  const value = rest.join(' ');
  const keyMap = { url: 'ollamaUrl', model: 'model', key: 'apiKey', streaming: 'streaming', temp: 'temperature' };
  const configKey = keyMap[subCmd];

  if (!configKey) {
    console.log(AI.error(`  ✗ Opção desconhecida: ${subCmd}`));
    console.log(AI.dim('  Use: /config url|model|key|streaming|temp <valor>'));
    return;
  }

  let configValue = value;
  if (subCmd === 'streaming') configValue = value === 'on' || value === 'true';
  if (subCmd === 'temp') configValue = parseFloat(value) || 0.7;

  await configManager.set({ [configKey]: configValue });
  console.log(AI.success(`\n  ✓ ${subCmd} → ${configValue}\n`));
}

async function listModels(client) {
  const spinner = createAISpinner('Consultando modelos...');
  spinner.start();
  try {
    const models = await client.listModels();
    spinner.stop();
    if (models.length === 0) {
      console.log(AI.warning('\n  Nenhum modelo encontrado. Use: ollama pull llama3\n'));
      return;
    }
    console.log('\n' + AI.primary('  📦 Modelos disponíveis:'));
    for (const m of models) {
      const size = m.size ? ` ${AI.muted('(' + Math.round(m.size / 1e9 * 10) / 10 + 'GB)')}` : '';
      console.log(`  ${AI.accent('▸')} ${AI.white(m.name)}${size}`);
    }
    console.log(AI.dim('\n  Use /config model <nome> para trocar\n'));
  } catch (err) {
    spinner.stop();
    console.log(AI.error(`\n  ✗ ${err.message}\n`));
  }
}

async function checkStatus(client) {
  const spinner = createAISpinner('Verificando Ollama...');
  spinner.start();
  const status = await client.checkConnection();
  spinner.stop();

  if (status.online) {
    console.log(AI.success('\n  ● Ollama Online'));
    if (status.models?.length) {
      console.log(AI.muted(`  Modelos: ${status.models.join(', ')}`));
    }
  } else {
    console.log(AI.error(`\n  ● Ollama Offline: ${status.error}`));
    console.log(AI.dim('  Execute: ollama serve'));
  }
  console.log();
}

async function showAgentLog() {
  const log = orchestrator.getAgentLog();
  if (log.length === 0) {
    console.log(AI.muted('\n  Nenhum agente ativado ainda.\n'));
    return;
  }
  console.log('\n' + AI.primary('  📋 Agentes ativados nesta sessão:'));
  for (const entry of log) {
    const time = new Date(entry.ts).toLocaleTimeString('pt-BR');
    const badge = AGENT_BADGES[entry.intent] || AI.dim(entry.intent);
    console.log(`  ${AI.dim(time)} ${badge} ${AI.muted(entry.preview || '')}`);
  }
  console.log();
}

// ─────────────────────────────────────────────
//  EXECUÇÃO DE AÇÃO ESPECIAL (request, suite, etc.)
// ─────────────────────────────────────────────
async function handleAction(action, data, COLORS) {
  if (!action || !data) return;

  if (action === 'execute_request' || action === 'execute_fixed_request') {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: AI.white(`Executar  ${data.method} ${data.url}?`),
        prefix: AI.accent('  ◈'),
        default: true,
      },
    ]);

    if (!confirm) return;

    const reqAgent = new RequestAgent(orchestrator.client, orchestrator.bus);
    const spinner = createAISpinner('Executando requisição...');
    spinner.start();

    try {
      const result = await reqAgent.executeRequest({
        method: data.method,
        url: data.url,
        headers: data.headers || {},
        body: data.body || null,
      });
      spinner.stop();
      await displayResult(result, data.method, data.url, COLORS || AI);

      // Oferece explicação imediata
      const { explain } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'explain',
          message: AI.white('Quer que a IA explique este resultado?'),
          prefix: AI.accent('  ◈'),
          default: false,
        },
      ]);

      if (explain) {
        // Injeta no histórico e dispara explain
        orchestrator.bus.addUserMessage('Explique este resultado de requisição.');
        await runChatTurn('Explique este resultado de requisição.', COLORS);
      }
    } catch (err) {
      spinner.stop();
      console.log(AI.error(`\n  ✗ ${err.message}\n`));
    }
  }

  if (action === 'save_suite' && data.suite && data.filename) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: AI.white(`Salvar suite em "${data.filename}"?`),
        prefix: AI.accent('  ◈'),
        default: true,
      },
    ]);
    if (confirm) {
      const fs = await import('fs/promises');
      await fs.default.writeFile(data.filename, JSON.stringify(data.suite, null, 2), 'utf8');
      console.log(AI.success(`\n  ✓ Suite salva: ${data.filename}\n`));
    }
  }
}

// ─────────────────────────────────────────────
//  LOOP DE CHAT — um turno
// ─────────────────────────────────────────────
async function runChatTurn(userMessage, COLORS) {
  const cfg = await configManager.get();
  let fullContent = '';

  if (cfg.streaming) {
    // Streaming: mostra tokens em tempo real
    printAgentHeader('orchestrator');  // temporário, atualiza depois
    process.stdout.write(AI.dim('  │ '));

    let headerPrinted = false;

    const response = await orchestrator.chat(userMessage, (token) => {
      if (!headerPrinted) { headerPrinted = true; }
      process.stdout.write(AI.ai(token));
      fullContent += token;
    });

    printAgentEnd();

    if (response.agentUsed && response.agentUsed !== 'orchestrator') {
      // Reescreve cabeçalho com agente correto (já impresso, só nota abaixo)
      console.log(AI.dim(`  · via: ${AGENT_BADGES[response.agentUsed] || response.agentUsed}`));
    }
    printStats(response.stats);

    // Lida com ações especiais
    if (response.action) {
      await handleAction(response.action, response.data, COLORS);
    }
  } else {
    // Sem streaming: spinner enquanto espera
    const spinner = createAISpinner('Processando...');
    spinner.start();
    const response = await orchestrator.chat(userMessage, null);
    spinner.stop();

    printAgentHeader(response.agentUsed || 'orchestrator');
    // Imprime o conteúdo linha a linha
    const lines = response.content.split('\n');
    for (const line of lines) {
      console.log(AI.dim('  │ ') + AI.ai(line));
    }
    printAgentEnd();
    printStats(response.stats);

    if (response.action) {
      await handleAction(response.action, response.data, COLORS);
    }
  }
}

// ─────────────────────────────────────────────
//  LANÇA O CHAT — ENTRY POINT
// ─────────────────────────────────────────────
export async function launchAIChat(COLORS) {
  // Init e verificação do Ollama
  await orchestrator.init();
  const cfg = await configManager.get();
  const ollamaStatus = await orchestrator.checkOllama();

  await showAISplash(cfg, ollamaStatus);

  let running = true;

  while (running) {
    try {
      printSeparator();

      const { userInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'userInput',
          message: '',
          prefix: AI.user('  Você ›'),
        },
      ]);

      const input = userInput.trim();
      if (!input) continue;

      // Comandos especiais
      if (input.startsWith('/')) {
        const parts = input.split(' ');
        const cmd = parts[0].toLowerCase();

        if (cmd === '/sair' || cmd === '/exit') {
          running = false;
          console.log(AI.primary('\n  ← Voltando ao menu...\n'));
          break;
        }

        if (cmd === '/help') { await showChatHelp(); continue; }
        if (cmd === '/clear') { await clearSession(); continue; }
        if (cmd === '/config') { await showConfig(parts, cfg); continue; }
        if (cmd === '/models') { await listModels(orchestrator.client); continue; }
        if (cmd === '/status') { await checkStatus(orchestrator.client); continue; }
        if (cmd === '/history') { await showAgentLog(); continue; }

        console.log(AI.warning(`  ⚠ Comando desconhecido: ${cmd}. Use /help para ver todos.\n`));
        continue;
      }

      // Mensagem normal — envia para o orquestrador
      printUserMessage(input);

      try {
        await runChatTurn(input, COLORS);
      } catch (err) {
        console.log(AI.error(`\n  ✗ ${err.message}`));
        if (err.message.includes('Ollama')) {
          console.log(AI.dim('  Execute: ollama serve\n'));
        }
      }

    } catch (err) {
      if (err.name === 'ExitPromptError') {
        running = false;
      } else {
        console.log(AI.error(`\n  ✗ Erro: ${err.message}\n`));
      }
    }
  }
}
