/**
 * MinicUrl AI — Interface de Chat Cline-style
 * Layout centralizado, status bar, streaming, memória integrada.
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { setTimeout as sleep } from 'timers/promises';
import { orchestrator } from '../ai/agents/orchestrator.js';
import { configManager } from '../ai/config.js';
import { memoryManager } from '../ai/memory.js';
import { CodeAnalyzerAgent } from '../ai/agents/codeAnalyzerAgent.js';
import {
  THEME, renderMarkdown, printAssistantMessage, printUserMessage,
  printAIHeader, printStatusBar, createSpinner, termWidth, separator, center, infoBox,
} from './renderer.js';
import { displayResult } from './display.js';

// ─────────────────────────────────────────────
//  ESTADO DA SESSÃO
// ─────────────────────────────────────────────
const session = {
  requests: 0,
  testsGenerated: 0,
  messageCount: 0,
  startTime: Date.now(),
};

// ─────────────────────────────────────────────
//  COMANDOS ESPECIAIS
// ─────────────────────────────────────────────
async function handleSpecialCommand(input, cfg) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  // ── /help ─────────────────────────────────
  if (cmd === '/help') {
    const w = Math.min(termWidth() - 4, 72);
    console.log('\n' + infoBox([
      THEME.primary('Comandos disponíveis:'),
      '',
      `  ${THEME.accent('/help')}                    Mostra este painel`,
      `  ${THEME.accent('/config')}                  Ver configuração atual`,
      `  ${THEME.accent('/config url <url>')}         Trocar URL do Ollama`,
      `  ${THEME.accent('/config model <m>')}         Trocar modelo`,
      `  ${THEME.accent('/config key <k>')}            Definir API key`,
      `  ${THEME.accent('/config streaming on|off')}   Ativar/desativar streaming`,
      `  ${THEME.accent('/models')}                  Listar modelos instalados`,
      `  ${THEME.accent('/status')}                  Status do Ollama`,
      `  ${THEME.accent('/analyze <pasta>')}          Analisar código de um projeto`,
      `  ${THEME.accent('/memory')}                  Ver resumo da memória`,
      `  ${THEME.accent('/memory clear')}             Limpar memória persistente`,
      `  ${THEME.accent('/history')}                 Log de agentes ativados`,
      `  ${THEME.accent('/clear')}                   Limpar histórico da sessão`,
      `  ${THEME.accent('/sair')}                    Voltar ao menu principal`,
      '',
      THEME.dim('Dicas:'),
      `  ${THEME.muted('"Faça um POST para https://api.com com body {name: test}"')}`,
      `  ${THEME.muted('"Gere testes para esta API REST"')}`,
      `  ${THEME.muted('"Por que recebi 401?"')}`,
      `  ${THEME.muted('"Explique o resultado da última requisição"')}`,
    ], { width: w }));
    console.log('');
    return true;
  }

  // ── /config ───────────────────────────────
  if (cmd === '/config') {
    const sub = parts[1];
    if (!sub || sub === 'show') {
      const c = await configManager.get();
      console.log('\n' + infoBox([
        THEME.primary('⚙️  Configuração atual:'),
        '',
        `  ${THEME.dim('URL Ollama:')}   ${THEME.accent(c.ollamaUrl)}`,
        `  ${THEME.dim('Modelo:')}       ${THEME.accent(c.model)}`,
        `  ${THEME.dim('API Key:')}      ${c.apiKey ? THEME.muted('***' + c.apiKey.slice(-4)) : THEME.dim('(não definida)')}`,
        `  ${THEME.dim('Streaming:')}    ${c.streaming ? THEME.success('ativo') : THEME.muted('inativo')}`,
        `  ${THEME.dim('Temperatura:')} ${THEME.muted(String(c.temperature))}`,
        `  ${THEME.dim('Arquivo:')}      ${THEME.dim(configManager.getConfigPath())}`,
      ]));
      console.log('');
      return true;
    }

    const keyMap = { url: 'ollamaUrl', model: 'model', key: 'apiKey', streaming: 'streaming', temp: 'temperature' };
    const configKey = keyMap[sub];
    if (configKey) {
      let value = parts.slice(2).join(' ');
      if (sub === 'streaming') value = (value === 'on' || value === 'true');
      if (sub === 'temp') value = parseFloat(value) || 0.7;
      await configManager.set({ [configKey]: value });
      console.log(THEME.success(`\n  ✓ ${sub} → ${value}\n`));
    } else {
      console.log(THEME.warning(`  ⚠ Use: /config url|model|key|streaming|temp <valor>\n`));
    }
    return true;
  }

  // ── /models ───────────────────────────────
  if (cmd === '/models') {
    const spin = createSpinner('Consultando Ollama...');
    spin.start();
    try {
      const models = await orchestrator.client?.listModels() || [];
      spin.stop();
      if (!models.length) {
        console.log(THEME.warning('\n  Nenhum modelo. Use: ollama pull llama3\n'));
        return true;
      }
      const active = cfg.model;
      console.log('\n' + THEME.primary('  📦 Modelos disponíveis:\n'));
      for (const m of models) {
        const size = m.size ? THEME.dim(` (${(m.size / 1e9).toFixed(1)}GB)`) : '';
        const cur = m.name === active ? THEME.success(' ◀ ativo') : '';
        console.log(`  ${THEME.accent('▸')} ${THEME.white(m.name)}${size}${cur}`);
      }
      console.log(THEME.dim('\n  /config model <nome> para trocar\n'));
    } catch (e) {
      spin.stop();
      console.log(THEME.error(`\n  ✗ ${e.message}\n`));
    }
    return true;
  }

  // ── /status ───────────────────────────────
  if (cmd === '/status') {
    const spin = createSpinner('Verificando Ollama...');
    spin.start();
    const st = await orchestrator.checkOllama();
    spin.stop();
    const icon = st.online ? THEME.success('●') : THEME.error('●');
    console.log(`\n  ${icon} Ollama: ${st.online ? THEME.success('Online') : THEME.error('Offline')}`);
    if (st.online && st.models?.length) console.log(THEME.dim(`  Modelos: ${st.models.join(', ')}`));
    if (!st.online) console.log(THEME.dim('  Execute: ollama serve'));
    const mem = await memoryManager.getSummary();
    console.log(`\n  ${THEME.dim('Memória:')}  ${mem.sessions} sessões · ${mem.patterns} padrões · ${mem.projects} projetos`);
    console.log(`  ${THEME.dim('Sessão:')}   ${session.messageCount} msgs · ${session.requests} req · ${session.testsGenerated} testes\n`);
    return true;
  }

  // ── /analyze ──────────────────────────────
  if (cmd === '/analyze') {
    const folderPath = parts.slice(1).join(' ').replace(/['"]/g, '').trim();
    if (!folderPath) {
      console.log(THEME.warning('\n  Informe o caminho: /analyze <pasta>\n'));
      return true;
    }
    const currentCfg = await configManager.get();
    const analyzer = new CodeAnalyzerAgent(orchestrator.client, orchestrator.bus);
    try {
      const result = await analyzer.analyzeFolder(folderPath, currentCfg.model);
      console.log('');

      const rendered = renderMarkdown(result.content);
      console.log(THEME.dim('  ╭─ ') + THEME.success('🔭 Analisador de Código'));
      console.log(THEME.dim('  │'));
      for (const line of rendered) {
        console.log(THEME.dim('  │') + ' ' + line.trimStart());
      }
      console.log(THEME.dim('  ╰─'));
      console.log('');

      // Oferta de salvar suite
      if (result.action === 'save_suite' && result.data?.suite) {
        const filename = result.data.filename || `suite-${Date.now()}.json`;
        const { save } = await inquirer.prompt([{
          type: 'confirm', name: 'save',
          message: THEME.white(`Salvar suite como "${filename}"?`),
          prefix: THEME.accent('  ◈'), default: true,
        }]);
        if (save) {
          const fs = await import('fs/promises');
          await fs.default.writeFile(filename, JSON.stringify(result.data.suite, null, 2), 'utf8');
          console.log(THEME.success(`\n  ✓ Suite salva: ${filename}`));
          console.log(THEME.dim(`  Execute com: minicurl → 🧪 API Test Runner → Carregar suite\n`));
          session.testsGenerated += result.data.suite.tests?.length || 0;
        }
      }
      orchestrator.bus.addAssistantMessage(result.content);
      session.messageCount++;
    } catch (err) {
      console.log(THEME.error(`\n  ✗ Erro na análise: ${err.message}\n`));
    }
    return true;
  }

  // ── /memory ───────────────────────────────
  if (cmd === '/memory') {
    const sub = parts[1];
    if (sub === 'clear') {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm', name: 'confirm',
        message: THEME.white('Limpar toda a memória persistente?'),
        prefix: THEME.accent('  ◈'), default: false,
      }]);
      if (confirm) {
        await memoryManager.reset();
        console.log(THEME.success('\n  ✓ Memória apagada.\n'));
      }
      return true;
    }
    const mem = await memoryManager.getSummary();
    const m = await memoryManager.get();
    console.log('\n' + infoBox([
      THEME.primary('🧠 Memória Persistente:'),
      '',
      `  ${THEME.dim('Sessões:')}   ${mem.sessions} sessões salvas`,
      `  ${THEME.dim('Padrões:')}   ${mem.patterns} APIs aprendidas`,
      `  ${THEME.dim('Projetos:')}  ${mem.projects} projetos analisados`,
      `  ${THEME.dim('Total req:')} ${mem.stats.totalRequestsMade}`,
      `  ${THEME.dim('Testes:')}    ${mem.stats.totalTestsGenerated} suites geradas`,
      `  ${THEME.dim('Arquivo:')}   ${mem.path}`,
      `  ${THEME.dim('Atualiz.:')} ${mem.updatedAt ? new Date(mem.updatedAt).toLocaleString('pt-BR') : 'nunca'}`,
      '',
      ...(m.sessions.slice(0, 3).map((s, i) =>
        `  ${THEME.dim((i + 1) + '.')} ${THEME.muted(new Date(s.date).toLocaleDateString('pt-BR'))} ${THEME.dim(s.summary.substring(0, 50))}`
      )),
    ]));
    console.log('');
    return true;
  }

  // ── /history ──────────────────────────────
  if (cmd === '/history') {
    const log = orchestrator.getAgentLog();
    if (!log.length) { console.log(THEME.muted('\n  Nenhum agente ativado.\n')); return true; }
    console.log('\n' + THEME.primary('  📋 Agentes na sessão:\n'));
    for (const e of log) {
      const time = new Date(e.ts).toLocaleTimeString('pt-BR');
      console.log(`  ${THEME.dim(time)} ${THEME.accent(e.intent)} ${THEME.muted(e.preview || '')}`);
    }
    console.log('');
    return true;
  }

  // ── /clear ────────────────────────────────
  if (cmd === '/clear') {
    orchestrator.clearSession();
    console.log(THEME.success('\n  ✓ Histórico da sessão limpo.\n'));
    return true;
  }

  return false; // não foi comando especial
}

// ─────────────────────────────────────────────
//  EXECUTA AÇÃO RETORNADA PELO AGENTE
// ─────────────────────────────────────────────
async function handleAgentAction(action, data, COLORS) {
  if (!action || !data) return;

  if (action === 'execute_request' || action === 'execute_fixed_request') {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm', name: 'confirm',
      message: THEME.white(`Executar  ${data.method} ${data.url}?`),
      prefix: THEME.accent('  ◈'), default: true,
    }]);
    if (!confirm) return;

    const spin = createSpinner('Executando requisição...');
    spin.start();
    try {
      const { RequestAgent } = await import('../ai/agents/requestAgent.js');
      const reqAgent = new RequestAgent(orchestrator.client, orchestrator.bus);
      const result = await reqAgent.executeRequest({
        method: data.method, url: data.url,
        headers: data.headers || {}, body: data.body || null,
      });
      spin.stop();
      session.requests++;
      await displayResult(result, data.method, data.url, COLORS || THEME);

      const { explain } = await inquirer.prompt([{
        type: 'confirm', name: 'explain',
        message: THEME.white('A IA explica este resultado?'),
        prefix: THEME.accent('  ◈'), default: false,
      }]);
      if (explain) {
        orchestrator.bus.addUserMessage('Explique este resultado.');
        await runChatTurn('Explique este resultado.', COLORS);
      }
    } catch (err) {
      spin.stop();
      console.log(THEME.error(`\n  ✗ ${err.message}\n`));
    }
  }

  if (action === 'save_suite' && data.suite && data.filename) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm', name: 'confirm',
      message: THEME.white(`Salvar suite como "${data.filename}"?`),
      prefix: THEME.accent('  ◈'), default: true,
    }]);
    if (confirm) {
      const fs = await import('fs/promises');
      await fs.default.writeFile(data.filename, JSON.stringify(data.suite, null, 2), 'utf8');
      console.log(THEME.success(`\n  ✓ Suite salva: ${data.filename}\n`));
      session.testsGenerated += data.suite.tests?.length || 0;
    }
  }
}

// ─────────────────────────────────────────────
//  TURNO DE CHAT PRINCIPAL
// ─────────────────────────────────────────────
async function runChatTurn(userMessage, COLORS) {
  const cfg = await configManager.get();
  session.messageCount++;

  if (cfg.streaming) {
    // STREAMING — saída token a token ─────────
    console.log('');
    console.log(THEME.dim('  ╭─ ') + THEME.primary('🧠 Processando...'));
    console.log(THEME.dim('  │'));
    process.stdout.write(THEME.dim('  │ '));

    let fullContent = '';
    let response;
    try {
      response = await orchestrator.chat(userMessage, (token) => {
        process.stdout.write(THEME.agents[response?.agentUsed] ? THEME.agents[response.agentUsed](token) : THEME.primary(token));
        fullContent += token;
      });
    } catch (err) {
      response = { content: `⚠️ Erro: ${err.message}`, agentUsed: 'error-handler', stats: {} };
      process.stdout.write(THEME.error(response.content));
      fullContent = response.content;
    }

    // Fecha bloco
    const agentColor = THEME.agents[response?.agentUsed] || THEME.primary;
    console.log('');
    console.log(THEME.dim('  │'));

    const statParts = [];
    if (response?.stats?.responseTokens) statParts.push(`${response.stats.responseTokens} tk`);
    if (response?.stats?.durationMs) statParts.push(`${response.stats.durationMs}ms`);
    const agentLabel = {
      'orchestrator': '🧠 Orquestrador', 'request-agent': '⚡ Req.',
      'test-agent': '🧪 Testes', 'explain-agent': '📚 Explicador',
      'debug-agent': '🔍 Debugger', 'code-analyzer': '🔭 Analisador',
    }[response?.agentUsed] || '🤖 IA';
    console.log(THEME.dim(`  ╰─ ${agentLabel}`) + (statParts.length ? THEME.dim(` · ${statParts.join(' · ')}`) : ''));
    console.log('');

    if (response?.action) await handleAgentAction(response.action, response.data, COLORS);

  } else {
    // SEM STREAMING — spinner ──────────────────
    const spin = createSpinner('Processando...');
    spin.start();
    let response;
    try {
      response = await orchestrator.chat(userMessage, null);
    } catch (err) {
      response = { content: `⚠️ Erro: ${err.message}`, agentUsed: 'error-handler', stats: {} };
    }
    spin.stop();

    // Renderiza a resposta com markdown
    const rendered = renderMarkdown(response.content);
    const agentLabel = {
      'orchestrator': '🧠 Orquestrador', 'request-agent': '⚡ Agente de Requisições',
      'test-agent': '🧪 Agente de Testes', 'explain-agent': '📚 Agente Explicador',
      'debug-agent': '🔍 Agente Debugger', 'code-analyzer': '🔭 Analisador de Código',
    }[response?.agentUsed] || '🤖 IA';

    const agentColor = THEME.agents[response?.agentUsed] || THEME.primary;
    console.log('');
    console.log(THEME.dim('  ╭─ ') + agentColor(agentLabel));
    console.log(THEME.dim('  │'));
    for (const line of rendered) {
      if (line.trim() === '') {
        console.log(THEME.dim('  │'));
      } else {
        console.log(THEME.dim('  │') + ' ' + line.trimStart());
      }
    }
    console.log(THEME.dim('  │'));
    const statParts = [];
    if (response?.stats?.responseTokens) statParts.push(`${response.stats.responseTokens} tokens`);
    if (response?.stats?.durationMs) statParts.push(`${response.stats.durationMs}ms`);
    console.log(THEME.dim(`  ╰─` + (statParts.length ? ` · ${statParts.join(' · ')}` : '')));
    console.log('');

    if (response?.action) await handleAgentAction(response.action, response.data, COLORS);
  }
}

// ─────────────────────────────────────────────
//  SPLASH CLINE-STYLE
// ─────────────────────────────────────────────
async function showSplash(cfg, ollamaStatus) {
  console.clear();
  const w = termWidth();

  // Animação de boot
  const bootLines = [
    [THEME.dim('  [ MEM ]'), THEME.primary(' Carregando memória de sessões...')],
    [THEME.dim('  [ AGT ]'), THEME.primary(' Inicializando agentes (5 ativos)...')],
    [THEME.dim('  [ LLM ]'), THEME.primary(` Conectando ao Ollama · ${cfg.model}...`)],
    [THEME.dim('  [ NET ]'), THEME.primary(` ${cfg.ollamaUrl}...`)],
  ];

  for (const [prefix, text] of bootLines) {
    process.stdout.write(prefix + text);
    await sleep(90);
    const status = bootLines[bootLines.indexOf([prefix, text])] !== undefined
      ? (ollamaStatus.online ? THEME.success('  ✓') : THEME.warning('  ⚠'))
      : THEME.success('  ✓');
    console.log(THEME.success('  ✓'));
    await sleep(50);
  }

  await sleep(150);
  console.clear();

  // Header centralizado
  printAIHeader(cfg.model, cfg.ollamaUrl);

  // Status box
  const memSummary = await memoryManager.getSummary();
  const statusLines = [];

  if (ollamaStatus.online) {
    statusLines.push(THEME.success('  ● Ollama Online') + THEME.dim(` · ${ollamaStatus.models?.length || 0} modelo(s)`));
  } else {
    statusLines.push(THEME.error('  ● Ollama Offline') + THEME.warning(' — Execute: ollama serve'));
  }

  statusLines.push(THEME.dim(`  🧠 Memória: ${memSummary.sessions} sessões · ${memSummary.patterns} APIs aprendidas · ${memSummary.projects} projetos`));
  statusLines.push('');
  statusLines.push(THEME.dim('  Agentes: ') +
    THEME.primary('🧠 Orq') + THEME.dim(' · ') +
    THEME.accent('⚡ Req') + THEME.dim(' · ') +
    THEME.warning('🧪 Test') + THEME.dim(' · ') +
    THEME.secondary('📚 Explain') + THEME.dim(' · ') +
    THEME.error('🔍 Debug') + THEME.dim(' · ') +
    THEME.success('🔭 Analyze')
  );
  statusLines.push('');
  statusLines.push(THEME.dim('  Comandos: ') + THEME.primary('/help') + THEME.dim(' · ') +
    THEME.primary('/config') + THEME.dim(' · ') + THEME.primary('/analyze <pasta>') + THEME.dim(' · ') +
    THEME.primary('/memory') + THEME.dim(' · ') + THEME.primary('/sair'));

  console.log(infoBox(statusLines, { width: Math.min(w - 4, 78) }));
  console.log('');

  if (!ollamaStatus.online) {
    console.log(center(THEME.warning('⚠️  Ollama offline — modo limitado. Execute: ollama serve'), w));
    console.log('');
  }
}

// ─────────────────────────────────────────────
//  ENTRY POINT
// ─────────────────────────────────────────────
export async function launchAIChat(COLORS) {
  // Init
  await orchestrator.init();
  const cfg = await configManager.get();
  const [ollamaStatus, memSummary] = await Promise.all([
    orchestrator.checkOllama(),
    memoryManager.getSummary(),
  ]);

  await showSplash(cfg, ollamaStatus);

  const sessionStartTime = Date.now();
  let running = true;

  while (running) {
    try {
      const w = termWidth();

      // Status bar antes do input
      const msgs = orchestrator.bus.getHistory().length;
      const sessionTime = Math.round((Date.now() - sessionStartTime) / 1000);
      const timeStr = sessionTime < 60 ? `${sessionTime}s` : `${Math.floor(sessionTime / 60)}m`;
      printStatusBar(cfg.model, {
        messages: msgs,
        memory: `${memSummary.sessions}s`,
      });

      // Input
      const { userInput } = await inquirer.prompt([{
        type: 'input',
        name: 'userInput',
        message: '',
        prefix: THEME.user('  ›'),
      }]);

      const input = userInput.trim();
      if (!input) continue;

      // Comandos especiais
      if (input.startsWith('/')) {
        const isExit = input.toLowerCase() === '/sair' || input.toLowerCase() === '/exit';
        if (isExit) {
          running = false;
          break;
        }
        const handled = await handleSpecialCommand(input, cfg);
        if (!handled) {
          console.log(THEME.warning(`  ⚠ Comando desconhecido. Use /help\n`));
        }
        continue;
      }

      // Mensagem normal
      printUserMessage(input);

      try {
        await runChatTurn(input, COLORS);
      } catch (err) {
        console.log(THEME.error(`\n  ✗ ${err.message}`));
        if (err.message.includes('Ollama') || err.message.includes('ECONNREFUSED')) {
          console.log(THEME.dim('  Execute: ollama serve\n'));
        }
      }

    } catch (err) {
      if (err.name === 'ExitPromptError') {
        running = false;
      } else {
        console.log(THEME.error(`  ✗ ${err.message}`));
      }
    }
  }

  // Salva sessão na memória ao sair
  try {
    const messages = orchestrator.bus.getHistory();
    if (messages.length > 0) {
      await memoryManager.saveSession(messages, {
        requests: session.requests,
        testsGenerated: session.testsGenerated,
        duration: Date.now() - session.startTime,
      });
    }
  } catch { /* silencioso */ }

  console.log('\n' + center(THEME.primary('← Voltando ao menu...'), termWidth()) + '\n');
}
