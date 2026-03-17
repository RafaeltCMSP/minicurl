/**
 * MinicUrl AI — Módulo CLI
 * Trata: minicurl ai [prompt]
 *         minicurl ai config [flags]
 *         minicurl ai analyze <url>            — Analisa uma URL com IA
 *         minicurl ai analyze-code <pasta>     — Escaneia pasta por chamadas de API
 *         minicurl ai models | status | memory
 */

import chalk from 'chalk';
import { configManager } from './config.js';
import { OllamaClient } from './ollamaClient.js';
import { orchestrator } from './agents/orchestrator.js';
import { memoryManager } from './memory.js';

const C = {
  primary: chalk.hex('#A855F7'),
  accent: chalk.hex('#06B6D4'),
  success: chalk.hex('#39FF14'),
  error: chalk.hex('#FF3131'),
  warning: chalk.hex('#FFD700'),
  dim: chalk.gray,
  white: chalk.white,
  ai: chalk.hex('#C084FC'),
};

export async function runAICLI(args) {
  const subCmd = args[0];

  // ─── minicurl ai config ───────────────────────
  if (subCmd === 'config') {
    await handleConfig(args.slice(1));
    return;
  }

  // ─── minicurl ai models ───────────────────────
  if (subCmd === 'models') {
    await handleModels();
    return;
  }

  // ─── minicurl ai status ───────────────────────
  if (subCmd === 'status') {
    await handleStatus();
    return;
  }

  // ─── minicurl ai analyze <url> ───────────────
  if (subCmd === 'analyze') {
    await handleAnalyze(args.slice(1));
    return;
  }

  // ─── minicurl ai analyze-code <pasta> ────────
  if (subCmd === 'analyze-code') {
    await handleAnalyzeCode(args.slice(1));
    return;
  }

  // ─── minicurl ai memory ───────────────────────
  if (subCmd === 'memory') {
    await handleMemory(args.slice(1));
    return;
  }

  // ─── minicurl ai <prompt direto> ─────────────
  // Se não é um subcomando, trata como prompt único não-interativo
  const prompt = args.join(' ');
  if (!prompt || subCmd === '--help' || subCmd === '-h') {
    showAIHelp();
    return;
  }

  await handlePrompt(prompt);
}

// ─────────────────────────────────────────────
//  HANDLERS
// ─────────────────────────────────────────────

async function handleConfig(args) {
  // Parse flags: --url, --model, --key, --streaming, --show, --reset
  const flags = parseFlags(args);

  if (flags['--reset']) {
    await configManager.reset();
    console.log(C.success('  ✓ Configuração resetada para defaults.'));
    await printCurrentConfig();
    return;
  }

  if (flags['--show'] || Object.keys(flags).length === 0) {
    await printCurrentConfig();
    return;
  }

  const updates = {};

  if (flags['--url']) {
    try {
      new URL(flags['--url']);
      updates.ollamaUrl = flags['--url'];
    } catch {
      console.log(C.error(`  ✗ URL inválida: ${flags['--url']}`));
      process.exit(1);
    }
  }

  if (flags['--model']) updates.model = flags['--model'];
  if (flags['--key'])   updates.apiKey = flags['--key'];
  if (flags['--streaming'] !== undefined) {
    updates.streaming = flags['--streaming'] === 'on' || flags['--streaming'] === 'true';
  }
  if (flags['--temp']) updates.temperature = parseFloat(flags['--temp']) || 0.7;
  if (flags['--max-tokens']) updates.maxTokens = parseInt(flags['--max-tokens']) || 2048;

  if (Object.keys(updates).length === 0) {
    console.log(C.warning('  Nenhuma opção reconhecida. Use --show para ver opções.'));
    await printCurrentConfig();
    return;
  }

  const { current } = await configManager.set(updates);

  console.log(C.success('\n  ✓ Configuração atualizada:\n'));
  for (const [k, v] of Object.entries(updates)) {
    const key = k.replace('--', '');
    const display = key === 'apiKey' && v ? '***' + String(v).slice(-4) : v;
    console.log(`  ${C.dim(key.padEnd(12))} ${C.accent(String(display))}`);
  }
  console.log(`\n  ${C.dim('Arquivo:')} ${C.dim(configManager.getConfigPath())}\n`);
}

async function handleModels() {
  const cfg = await configManager.get();
  const client = new OllamaClient(cfg.ollamaUrl, cfg.apiKey);

  process.stdout.write(C.dim('  Consultando Ollama... '));
  try {
    const models = await client.listModels();
    console.log(C.success('✓\n'));

    if (models.length === 0) {
      console.log(C.warning('  Nenhum modelo encontrado.'));
      console.log(C.dim('  Instale com: ollama pull llama3\n'));
      return;
    }

    console.log(C.primary('  📦 Modelos instalados:\n'));
    for (const m of models) {
      const current = m.name === cfg.model;
      const star = current ? C.success(' ◀ atual') : '';
      const size = m.size ? C.dim(` (${(m.size / 1e9).toFixed(1)}GB)`) : '';
      console.log(`  ${C.accent('▸')} ${C.white(m.name)}${size}${star}`);
    }
    console.log();
    console.log(C.dim(`  Use: minicurl ai config --model <nome> para trocar\n`));
  } catch (err) {
    console.log(C.error('✗'));
    console.log(C.error(`\n  ✗ ${err.message}\n`));
    process.exit(1);
  }
}

async function handleStatus() {
  const cfg = await configManager.get();
  const client = new OllamaClient(cfg.ollamaUrl, cfg.apiKey);

  console.log(C.primary('\n  🔍 MinicUrl AI — Status\n'));

  process.stdout.write(C.dim(`  Conectando a ${cfg.ollamaUrl}... `));
  const status = await client.checkConnection();

  if (status.online) {
    console.log(C.success('● Online'));
    if (status.models?.length) {
      console.log(C.dim(`  Modelos: ${status.models.join(', ')}`));
    }
  } else {
    console.log(C.error('● Offline'));
    console.log(C.warning(`  Erro: ${status.error}`));
    console.log(C.dim('  Para iniciar: ollama serve'));
  }

  console.log();
  console.log(C.dim(`  Modelo ativo: ${cfg.model}`));
  console.log(C.dim(`  Streaming: ${cfg.streaming ? 'ativo' : 'inativo'}`));
  console.log(C.dim(`  Config: ${configManager.getConfigPath()}`));
  const mem = await memoryManager.getSummary();
  console.log(C.dim(`  Memória: ${mem.sessions} sessões · ${mem.patterns} APIs · ${mem.projects} projetos\n`));
}

async function handleAnalyzeCode(args) {
  const folderPath = args.join(' ').replace(/['"/]/g, '').trim();
  if (!folderPath) {
    console.log(C.error('  ✗ Informe uma pasta: minicurl ai analyze-code ./src'));
    console.log(C.dim('  Exemplo: minicurl ai analyze-code D:\\MeuProjeto'));
    return;
  }

  const cfg = await configManager.get();
  const client = new OllamaClient(cfg.ollamaUrl, cfg.apiKey);
  const { CodeAnalyzerAgent } = await import('./agents/codeAnalyzerAgent.js');
  const analyzer = new CodeAnalyzerAgent(client, null);

  try {
    const result = await analyzer.analyzeFolder(folderPath, cfg.model);
    console.log();
    const lines = result.content.split('\n');
    for (const line of lines) {
      console.log('  ' + C.ai(line));
    }

    if (result.action === 'save_suite' && result.data?.suite) {
      const fs = await import('fs/promises');
      const fname = result.data.filename || `test-suite.json`;
      await fs.default.writeFile(fname, JSON.stringify(result.data.suite, null, 2), 'utf8');
      console.log(C.success(`\n  ✓ Suite salva: ${fname}\n`));
    }
  } catch (err) {
    console.log(C.error(`\n  ✗ ${err.message}\n`));
    process.exit(1);
  }
}

async function handleMemory(args) {
  const sub = args[0];
  if (sub === 'clear') {
    await memoryManager.reset();
    console.log(C.success('  ✓ Memória resetada.'));
    return;
  }
  const mem = await memoryManager.getSummary();
  console.log(C.primary('\n  🧠 MinicUrl AI — Memória Persistente:\n'));
  console.log(C.dim(`  Arquivo:      ${mem.path}`));
  console.log(C.dim(`  Atualizado:   ${mem.updatedAt ? new Date(mem.updatedAt).toLocaleString('pt-BR') : 'nunca'}`));
  console.log(C.dim(`  Sessões:      ${mem.sessions}  (${mem.stats.totalMessages} mensagens total)`));
  console.log(C.dim(`  APIs aprendidas: ${mem.patterns}`));
  console.log(C.dim(`  Projetos analisados: ${mem.projects}`));
  console.log(C.dim(`  Requisições feitas: ${mem.stats.totalRequestsMade}`));
  console.log(C.dim(`  Testes gerados: ${mem.stats.totalTestsGenerated}\n`));
  console.log(C.dim('  Use: minicurl ai memory clear   para resetar\n'));
}

async function handleAnalyze(args) {
  const url = args[0];
  if (!url) {
    console.log(C.error('  ✗ Informe uma URL: minicurl ai analyze https://api.exemplo.com/users'));
    return;
  }

  try { new URL(url); } catch {
    console.log(C.error(`  ✗ URL inválida: ${url}`));
    return;
  }

  const cfg = await configManager.get();
  const client = new OllamaClient(cfg.ollamaUrl, cfg.apiKey);

  const connCheck = await client.checkConnection();
  if (!connCheck.online) {
    console.log(C.error(`  ✗ Ollama offline: ${connCheck.error}`));
    console.log(C.dim('  Execute: ollama serve'));
    return;
  }

  console.log(C.primary(`\n  🔍 Analisando ${url}...\n`));

  // Faz um GET e pede ao IA para analisar
  const { RequestEngine } = await import('../core/engine.js');
  const { ExplainAgent } = await import('./agents/explainAgent.js');

  const engine = new RequestEngine();
  const explainAgent = new ExplainAgent(client, null);

  try {
    process.stdout.write(C.dim('  Executando GET... '));
    const result = await engine.request({ method: 'GET', url });
    console.log(C.success(`${result.status} (${result.duration}ms)\n`));

    process.stdout.write(C.dim('  Analisando com IA '));
    const frames = ['◐', '◓', '◑', '◒'];
    let i = 0;
    const spin = setInterval(() => {
      process.stdout.write(`\r  ${C.primary(frames[i++ % 4])} ${C.dim('Analisando com IA...')}`);
    }, 100);

    const explanation = await explainAgent.explainResult(result, { method: 'GET', url }, cfg.model);
    clearInterval(spin);
    process.stdout.write('\r' + ' '.repeat(40) + '\r');

    console.log(C.dim('  ' + '─'.repeat(54)));
    console.log(C.primary('  📊 Análise da IA:\n'));
    const lines = explanation.split('\n');
    for (const line of lines) {
      console.log('  ' + C.ai(line));
    }
    console.log(C.dim('\n  ' + '─'.repeat(54) + '\n'));
  } catch (err) {
    console.log(C.error(`\n  ✗ ${err.message}\n`));
    process.exit(1);
  }
}

async function handlePrompt(prompt) {
  const cfg = await configManager.get();

  const connCheck = await (new OllamaClient(cfg.ollamaUrl, cfg.apiKey)).checkConnection();
  if (!connCheck.online) {
    console.log(C.error(`\n  ✗ Ollama offline. Execute: ollama serve\n`));
    process.exit(1);
  }

  await orchestrator.init();

  console.log(C.dim('\n  ' + '─'.repeat(54)));
  console.log(C.primary(`  🤖 MinicUrl AI`) + C.dim(` · ${cfg.model}`));
  console.log(C.dim('  ' + '─'.repeat(54) + '\n'));

  console.log(C.dim('  Você: ') + C.white(prompt));
  console.log();
  process.stdout.write(C.dim('  IA: '));

  if (cfg.streaming) {
    await orchestrator.chat(prompt, (token) => {
      process.stdout.write(C.ai(token));
    });
    console.log('\n');
  } else {
    const frames = ['◐', '◓', '◑', '◒'];
    let i = 0;
    const spin = setInterval(() => {
      process.stdout.write(`\r  ${C.primary(frames[i++ % 4])} ${C.dim('Processando...')}`);
    }, 100);

    const response = await orchestrator.chat(prompt, null);
    clearInterval(spin);
    process.stdout.write('\r' + ' '.repeat(40) + '\r');
    console.log(C.dim('  IA:\n'));
    const lines = response.content.split('\n');
    for (const line of lines) {
      console.log('  ' + C.ai(line));
    }
    console.log();
  }

  console.log(C.dim('  ' + '─'.repeat(54) + '\n'));
}

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────

function parseFlags(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      result[args[i]] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return result;
}

async function printCurrentConfig() {
  const cfg = await configManager.get();
  const display = [
    '',
    C.primary('  ⚙️  MinicUrl AI — Configuração atual:'),
    '',
    `  ${C.dim('URL Ollama:  ')} ${C.accent(cfg.ollamaUrl)}`,
    `  ${C.dim('Modelo:      ')} ${C.accent(cfg.model)}`,
    `  ${C.dim('API Key:     ')} ${cfg.apiKey ? C.dim('***' + cfg.apiKey.slice(-4)) : C.dim('(não definida)')}`,
    `  ${C.dim('Streaming:   ')} ${cfg.streaming ? C.success('ativo') : C.dim('inativo')}`,
    `  ${C.dim('Temperatura: ')} ${C.dim(String(cfg.temperature))}`,
    `  ${C.dim('Max Tokens:  ')} ${C.dim(String(cfg.maxTokens))}`,
    `  ${C.dim('Arquivo:     ')} ${C.dim(configManager.getConfigPath())}`,
    '',
    C.dim('  Alterar:'),
    `  ${C.dim('minicurl ai config --url <url> --model <modelo> --key <api-key>')}`,
    `  ${C.dim('minicurl ai config --streaming on|off --temp 0.7 --max-tokens 2048')}`,
    `  ${C.dim('minicurl ai config --reset')}`,
    '',
  ];
  console.log(display.join('\n'));
}

function showAIHelp() {
  console.log(`
${C.primary('  MinicUrl AI')} ${C.dim('— Agentes de IA integrados ao Ollama')}

${C.warning('  CHAT INTERATIVO (TUI):')}
  ${C.accent('minicurl')}                    ${C.dim('→ Menu principal → 🤖 AI Assistant')}

${C.warning('  CLI DIRETO:')}
  ${C.accent('minicurl ai')} ${C.primary('<prompt>')}               ${C.dim('— Pergunta única (não-interativo)')}
  ${C.accent('minicurl ai analyze')} ${C.primary('<url>')}          ${C.dim('— Analisa URL com IA')}
  ${C.accent('minicurl ai analyze-code')} ${C.primary('<pasta>')}   ${C.dim('— Escaneia pasta por chamadas de API')}
  ${C.accent('minicurl ai models')}                 ${C.dim('— Lista modelos Ollama instalados')}
  ${C.accent('minicurl ai status')}                 ${C.dim('— Verifica Ollama e memória')}
  ${C.accent('minicurl ai memory')}                 ${C.dim('— Ver memória de sessões')}
  ${C.accent('minicurl ai memory clear')}           ${C.dim('— Resetar memória')}

${C.warning('  CONFIGURAÇÃO:')}
  ${C.accent('minicurl ai config')}            ${C.dim('— Ver configuração atual')}
  ${C.accent('minicurl ai config')} ${C.primary('--url')} ${C.dim('<url>')}  ${C.dim('— URL do Ollama')}
  ${C.accent('minicurl ai config')} ${C.primary('--model')} ${C.dim('<m>')} ${C.dim('— Modelo (ex: llama3, mistral)')}
  ${C.accent('minicurl ai config')} ${C.primary('--key')} ${C.dim('<k>')}   ${C.dim('— API Key (opcional)')}
  ${C.accent('minicurl ai config')} ${C.primary('--reset')}          ${C.dim('— Reseta para defaults')}

${C.warning('  EXEMPLOS:')}
  ${C.accent('minicurl ai')} "Como fazer um POST com Bearer token?"
  ${C.accent('minicurl ai analyze')} https://api.github.com/users/octocat
  ${C.accent('minicurl ai analyze-code')} ./src
  ${C.accent('minicurl ai config')} --url http://localhost:11434 --model llama3

${C.warning('  AGENTES DISPONÍVEIS:')}
  ${C.primary('🧠')} ${C.white('Orquestrador')}   — Fala com você, roteia entre os agentes
  ${C.accent('⚡')} ${C.white('Requisições')}    — Gera e executa requisições HTTP
  ${C.warning('🧪')} ${C.white('Testes')}         — Cria suites de teste para APIs
  ${C.dim('📚')} ${C.white('Explicador')}     — Documenta e explica respostas HTTP
  ${C.error('🔍')} ${C.white('Debugger')}       — Diagnostica erros e sugere correções
  ${C.success('🔭')} ${C.white('Analisador')}    — Escaneia projetos e gera testes de API
`);
}
