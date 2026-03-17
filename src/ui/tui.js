/**
 * MinicUrl TUI - Interface Interativa Animada no Terminal
 * Design inspirado em terminais retro-futuristas
 */

import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import boxen from 'boxen';
import inquirer from 'inquirer';
import { setTimeout as sleep } from 'timers/promises';
import { RequestEngine } from '../core/engine.js';
import { HistoryManager } from '../core/history.js';
import { LearningModule } from '../learn/academy.js';
import { TestRunner } from '../core/testRunner.js';
import { displayResult } from './display.js';
import { launchAIChat } from './aiChat.js';

const engine = new RequestEngine();
const history = new HistoryManager();
const academy = new LearningModule();
const testRunner = new TestRunner();

// Paleta de cores cyberpunk/terminal
const COLORS = {
  primary: chalk.hex('#00FFB2'),
  secondary: chalk.hex('#FF6B35'),
  accent: chalk.hex('#7B2FBE'),
  dim: chalk.hex('#4A4A6A'),
  success: chalk.hex('#39FF14'),
  error: chalk.hex('#FF3131'),
  warning: chalk.hex('#FFD700'),
  info: chalk.hex('#00D4FF'),
  white: chalk.white,
  muted: chalk.gray,
};

const minicurlGradient = gradient(['#00FFB2', '#00D4FF', '#7B2FBE']);
const fireGradient = gradient(['#FF6B35', '#FFD700', '#FF3131']);

// ─────────────────────────────────────────────
//  SPLASH SCREEN ANIMADO
// ─────────────────────────────────────────────
async function showSplash() {
  console.clear();

  // Frame 1: linhas de boot
  const bootLines = [
    '  [ SYS ] Inicializando MinicUrl Runtime...',
    '  [ NET ] Carregando módulos HTTP...',
    '  [ TLS ] Verificando certificados SSL...',
    '  [ DB  ] Conectando ao histórico local...',
    '  [ UI  ] Renderizando interface...',
  ];

  for (const line of bootLines) {
    process.stdout.write(COLORS.dim(line));
    await sleep(80);
    process.stdout.write(COLORS.success('  ✓\n'));
    await sleep(60);
  }

  await sleep(200);
  console.clear();

  // Frame 2: ASCII art animado
  const banner = figlet.textSync('MinicUrl', {
    font: 'ANSI Shadow',
    horizontalLayout: 'default',
  });

  const lines = banner.split('\n');

  // Anima linha por linha
  for (let i = 0; i < lines.length; i++) {
    process.stdout.write(minicurlGradient(lines[i]) + '\n');
    await sleep(35);
  }

  await sleep(100);

  // Tagline animada
  const tagline = '  ⚡ HTTP Client · cURL Academy · API Test Runner';
  for (let i = 0; i < tagline.length; i++) {
    process.stdout.write(COLORS.info(tagline[i]));
    await sleep(12);
  }
  console.log('\n');

  // Box de versão/info
  const infoBox = boxen(
    [
      COLORS.primary('v1.0.0') + COLORS.dim('  •  ') + COLORS.muted('Node.js HTTP Playground'),
      COLORS.dim('─'.repeat(38)),
      COLORS.muted('  GET  POST  PUT  PATCH  DELETE  HEAD'),
      COLORS.muted('  JSON · Form · Multipart · Auth · cURL'),
    ].join('\n'),
    {
      padding: { top: 0, bottom: 0, left: 2, right: 2 },
      margin: { left: 2 },
      borderStyle: 'round',
      borderColor: '#7B2FBE',
      dimBorder: false,
    }
  );

  console.log(infoBox);
  await sleep(300);

  // Barra de progresso de "carregamento"
  process.stdout.write('\n  ' + COLORS.dim('Pronto '));
  const bar = '█';
  for (let i = 0; i < 20; i++) {
    process.stdout.write(COLORS.primary(bar));
    await sleep(25);
  }
  console.log(' ' + COLORS.success('✓') + '\n');
  await sleep(200);
}

// ─────────────────────────────────────────────
//  MENU PRINCIPAL
// ─────────────────────────────────────────────
async function mainMenu() {
  const separator = COLORS.dim('  ' + '─'.repeat(50));

  console.log(separator);
  console.log(COLORS.primary('  ▶ MENU PRINCIPAL'));
  console.log(separator + '\n');

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: COLORS.white('O que deseja fazer?'),
      prefix: COLORS.accent('  ◈'),
      choices: [
        {
          name: COLORS.primary('⚡ Nova Requisição') + COLORS.dim('     — GET, POST, PUT, PATCH, DELETE...'),
          value: 'request',
        },
        {
          name: chalk.hex('#A855F7')('🤖 AI Assistant') + COLORS.dim('      — Chat com IA · Agentes Ollama'),
          value: 'ai',
        },
        {
          name: COLORS.info('📚 cURL Academy') + COLORS.dim('       — Aprenda HTTP na prática'),
          value: 'learn',
        },
        {
          name: COLORS.warning('🧪 API Test Runner') + COLORS.dim('    — Execute suites de testes'),
          value: 'test',
        },
        {
          name: COLORS.secondary('📜 Histórico') + COLORS.dim('          — Requisições anteriores'),
          value: 'history',
        },
        {
          name: COLORS.primary('📦 Collections') + COLORS.dim('        — Salvar e organizar requests'),
          value: 'collections',
        },
        {
          name: COLORS.dim('⚙  Configurações') + COLORS.dim('       — Headers padrão, proxy, timeout'),
          value: 'settings',
        },
        new inquirer.Separator(COLORS.dim('  ' + '─'.repeat(45))),
        {
          name: COLORS.error('✕  Sair'),
          value: 'exit',
        },
      ],
    },
  ]);

  return action;
}

// ─────────────────────────────────────────────
//  FLUXO DE NOVA REQUISIÇÃO
// ─────────────────────────────────────────────
async function newRequestFlow() {
  console.log('\n' + COLORS.primary('  ⚡ NOVA REQUISIÇÃO') + '\n');

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: 'Método HTTP:',
      prefix: COLORS.accent('  ◈'),
      choices: methods.map(m => ({
        name: methodColor(m)(m.padEnd(8)) + COLORS.dim(getMethodDesc(m)),
        value: m,
      })),
    },
    {
      type: 'input',
      name: 'url',
      message: 'URL:',
      prefix: COLORS.accent('  ◈'),
      validate: v => {
        try { new URL(v); return true; }
        catch { return 'URL inválida. Exemplo: https://api.exemplo.com/users'; }
      },
    },
    {
      type: 'confirm',
      name: 'hasHeaders',
      message: 'Adicionar headers customizados?',
      prefix: COLORS.accent('  ◈'),
      default: false,
    },
  ]);

  // Headers customizados
  const customHeaders = {};
  if (answers.hasHeaders) {
    let addingHeaders = true;
    while (addingHeaders) {
      const { key, value } = await inquirer.prompt([
        { type: 'input', name: 'key', message: 'Header (ex: Authorization):', prefix: COLORS.accent('    →') },
        { type: 'input', name: 'value', message: 'Valor:', prefix: COLORS.accent('    →') },
      ]);
      customHeaders[key] = value;
      const { more } = await inquirer.prompt([
        { type: 'confirm', name: 'more', message: 'Adicionar outro header?', prefix: COLORS.accent('  ◈'), default: false },
      ]);
      addingHeaders = more;
    }
  }

  // Body (para POST/PUT/PATCH)
  let body = null;
  let contentType = null;

  if (['POST', 'PUT', 'PATCH'].includes(answers.method)) {
    const { bodyType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'bodyType',
        message: 'Tipo do body:',
        prefix: COLORS.accent('  ◈'),
        choices: [
          { name: COLORS.primary('JSON') + COLORS.dim('       — application/json'), value: 'json' },
          { name: COLORS.info('Form Data') + COLORS.dim('  — application/x-www-form-urlencoded'), value: 'form' },
          { name: COLORS.warning('Raw Text') + COLORS.dim('   — text/plain'), value: 'raw' },
          { name: COLORS.dim('Nenhum'), value: 'none' },
        ],
      },
    ]);

    if (bodyType !== 'none') {
      const { rawBody } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'rawBody',
          message: bodyType === 'json'
            ? 'Body JSON (abrirá editor):'
            : 'Body (abrirá editor):',
          prefix: COLORS.accent('  ◈'),
          default: bodyType === 'json' ? '{\n  \n}' : '',
        },
      ]);

      if (bodyType === 'json') {
        try {
          body = JSON.parse(rawBody);
          contentType = 'application/json';
        } catch {
          console.log(COLORS.error('  ✗ JSON inválido, enviando como texto'));
          body = rawBody;
          contentType = 'text/plain';
        }
      } else if (bodyType === 'form') {
        body = rawBody;
        contentType = 'application/x-www-form-urlencoded';
      } else {
        body = rawBody;
        contentType = 'text/plain';
      }
    }
  }

  // Auth
  const { authType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'authType',
      message: 'Autenticação:',
      prefix: COLORS.accent('  ◈'),
      choices: [
        { name: COLORS.dim('Nenhuma'), value: 'none' },
        { name: COLORS.primary('Bearer Token'), value: 'bearer' },
        { name: COLORS.info('Basic Auth'), value: 'basic' },
        { name: COLORS.warning('API Key (header)'), value: 'apikey' },
      ],
    },
  ]);

  if (authType === 'bearer') {
    const { token } = await inquirer.prompt([
      { type: 'password', name: 'token', message: 'Token:', prefix: COLORS.accent('  ◈'), mask: '●' },
    ]);
    customHeaders['Authorization'] = `Bearer ${token}`;
  } else if (authType === 'basic') {
    const { user, pass } = await inquirer.prompt([
      { type: 'input', name: 'user', message: 'Usuário:', prefix: COLORS.accent('  ◈') },
      { type: 'password', name: 'pass', message: 'Senha:', prefix: COLORS.accent('  ◈'), mask: '●' },
    ]);
    customHeaders['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  } else if (authType === 'apikey') {
    const { keyName, keyValue } = await inquirer.prompt([
      { type: 'input', name: 'keyName', message: 'Nome do header (ex: X-API-Key):', prefix: COLORS.accent('  ◈') },
      { type: 'password', name: 'keyValue', message: 'Valor:', prefix: COLORS.accent('  ◈'), mask: '●' },
    ]);
    customHeaders[keyName] = keyValue;
  }

  // Timeout
  const { timeout } = await inquirer.prompt([
    {
      type: 'input',
      name: 'timeout',
      message: 'Timeout (segundos, 0 = sem limite):',
      prefix: COLORS.accent('  ◈'),
      default: '30',
      validate: v => !isNaN(parseInt(v)) || 'Digite um número',
    },
  ]);

  // Executa requisição
  console.log('\n' + COLORS.dim('  ' + '─'.repeat(50)));
  console.log(
    COLORS.primary('  ► ') +
    methodColor(answers.method)(answers.method) +
    COLORS.white(' ' + answers.url)
  );
  console.log(COLORS.dim('  ' + '─'.repeat(50)) + '\n');

  const spinner = createSpinner('Enviando requisição...');
  spinner.start();

  try {
    const result = await engine.request({
      method: answers.method,
      url: answers.url,
      headers: { ...(contentType ? { 'Content-Type': contentType } : {}), ...customHeaders },
      body,
      timeout: parseInt(timeout) * 1000,
    });

    spinner.stop();
    await displayResult(result, answers.method, answers.url, COLORS);

    // Salva no histórico
    await history.add({
      method: answers.method,
      url: answers.url,
      headers: customHeaders,
      body,
      status: result.status,
      duration: result.duration,
    });

    // Opções pós-requisição
    const { postAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'postAction',
        message: 'O que fazer com o resultado?',
        prefix: COLORS.accent('  ◈'),
        choices: [
          { name: COLORS.primary('📋 Copiar cURL equivalente'), value: 'curl' },
          { name: COLORS.info('💾 Salvar em arquivo JSON'), value: 'save' },
          { name: COLORS.warning('🔁 Repetir requisição'), value: 'repeat' },
          { name: COLORS.dim('↩  Voltar ao menu'), value: 'back' },
        ],
      },
    ]);

    if (postAction === 'curl') {
      const curlCmd = engine.toCurl({ method: answers.method, url: answers.url, headers: customHeaders, body });
      console.log('\n' + COLORS.dim('  cURL equivalente:'));
      console.log(boxen(COLORS.success(curlCmd), {
        padding: 1,
        margin: { left: 2 },
        borderStyle: 'round',
        borderColor: '#39FF14',
      }));
    } else if (postAction === 'save') {
      const { filename } = await inquirer.prompt([
        { type: 'input', name: 'filename', message: 'Nome do arquivo:', prefix: COLORS.accent('  ◈'), default: `response_${Date.now()}.json` },
      ]);
      await engine.saveToFile(result, filename);
      console.log(COLORS.success(`  ✓ Salvo em ${filename}`));
    } else if (postAction === 'repeat') {
      return newRequestFlow();
    }

  } catch (err) {
    spinner.stop();
    console.log(COLORS.error(`\n  ✗ Erro: ${err.message}\n`));

    if (err.code === 'ENOTFOUND') {
      console.log(COLORS.warning('  Dica: Verifique se a URL está correta e se há conexão com a internet.'));
    } else if (err.code === 'ECONNREFUSED') {
      console.log(COLORS.warning('  Dica: O servidor recusou a conexão. Servidor online?'));
    } else if (err.code === 'ETIMEDOUT') {
      console.log(COLORS.warning('  Dica: Timeout atingido. Tente aumentar o tempo limite.'));
    }
  }

  await sleep(500);
}

// ─────────────────────────────────────────────
//  HISTÓRICO
// ─────────────────────────────────────────────
async function historyMenu() {
  console.log('\n' + COLORS.secondary('  📜 HISTÓRICO DE REQUISIÇÕES') + '\n');

  const entries = await history.getAll();

  if (entries.length === 0) {
    console.log(COLORS.muted('  Nenhuma requisição no histórico ainda.\n'));
    return;
  }

  const choices = entries.slice(-20).reverse().map((e, i) => ({
    name: [
      methodColor(e.method)(e.method.padEnd(7)),
      statusColor(e.status)(String(e.status).padEnd(5)),
      COLORS.dim(e.duration + 'ms').padEnd(10),
      COLORS.white(e.url.substring(0, 55) + (e.url.length > 55 ? '...' : '')),
    ].join(' '),
    value: e,
  }));

  choices.push(new inquirer.Separator());
  choices.push({ name: COLORS.error('🗑  Limpar histórico'), value: 'clear' });
  choices.push({ name: COLORS.dim('↩  Voltar'), value: 'back' });

  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message: 'Selecione uma entrada:',
      prefix: COLORS.accent('  ◈'),
      choices,
      pageSize: 15,
    },
  ]);

  if (selected === 'back') return;
  if (selected === 'clear') {
    await history.clear();
    console.log(COLORS.success('  ✓ Histórico limpo!\n'));
    return;
  }

  // Re-executa ou exibe
  const { histAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'histAction',
      message: 'O que fazer?',
      prefix: COLORS.accent('  ◈'),
      choices: [
        { name: COLORS.primary('🔁 Re-executar esta requisição'), value: 'rerun' },
        { name: COLORS.info('📋 Ver cURL equivalente'), value: 'curl' },
        { name: COLORS.dim('↩  Voltar'), value: 'back' },
      ],
    },
  ]);

  if (histAction === 'rerun') {
    const spinner = createSpinner('Re-executando...');
    spinner.start();
    try {
      const result = await engine.request(selected);
      spinner.stop();
      await displayResult(result, selected.method, selected.url, COLORS);
    } catch (err) {
      spinner.stop();
      console.log(COLORS.error(`  ✗ ${err.message}`));
    }
  } else if (histAction === 'curl') {
    const curlCmd = engine.toCurl(selected);
    console.log('\n' + boxen(COLORS.success(curlCmd), {
      padding: 1, margin: { left: 2 }, borderStyle: 'round', borderColor: '#39FF14',
    }));
  }
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function methodColor(method) {
  const map = {
    GET: chalk.hex('#39FF14'),
    POST: chalk.hex('#00D4FF'),
    PUT: chalk.hex('#FFD700'),
    PATCH: chalk.hex('#FF6B35'),
    DELETE: chalk.hex('#FF3131'),
    HEAD: chalk.hex('#7B2FBE'),
    OPTIONS: chalk.hex('#FF69B4'),
  };
  return map[method] || chalk.white;
}

function statusColor(status) {
  if (status >= 500) return chalk.hex('#FF3131');
  if (status >= 400) return chalk.hex('#FFD700');
  if (status >= 300) return chalk.hex('#00D4FF');
  if (status >= 200) return chalk.hex('#39FF14');
  return chalk.white;
}

function getMethodDesc(m) {
  const descs = {
    GET: '— Buscar recurso',
    POST: '— Criar recurso',
    PUT: '— Substituir recurso',
    PATCH: '— Atualizar parcialmente',
    DELETE: '— Remover recurso',
    HEAD: '— Apenas headers',
    OPTIONS: '— Ver métodos disponíveis',
  };
  return descs[m] || '';
}

function createSpinner(text) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let timer;
  return {
    start() {
      process.stdout.write('\n');
      timer = setInterval(() => {
        process.stdout.write(`\r  ${COLORS.primary(frames[i % frames.length])} ${COLORS.dim(text)}`);
        i++;
      }, 80);
    },
    stop() {
      clearInterval(timer);
      process.stdout.write(`\r  ${COLORS.success('✓')} ${COLORS.dim(text)}\n`);
    },
  };
}

// ─────────────────────────────────────────────
//  LAUNCH TUI - ENTRY POINT
// ─────────────────────────────────────────────
export async function launchTUI() {
  await showSplash();

  let running = true;
  while (running) {
    try {
      const action = await mainMenu();

      switch (action) {
        case 'request':
          await newRequestFlow();
          break;
        case 'ai':
          await launchAIChat(COLORS);
          break;
        case 'learn':
          await academy.startInteractive(COLORS, inquirer, boxen);
          break;
        case 'test':
          await testRunner.interactiveMenu(COLORS, inquirer);
          break;
        case 'history':
          await historyMenu();
          break;
        case 'collections':
          await collectionsMenu();
          break;
        case 'settings':
          await settingsMenu();
          break;
        case 'exit':
          running = false;
          break;
      }
    } catch (err) {
      if (err.name === 'ExitPromptError') {
        running = false;
      } else {
        console.log(COLORS.error(`\n  ✗ Erro: ${err.message}\n`));
      }
    }
  }

  // Saída animada
  console.log('\n');
  const bye = '  Até logo! Boas requisições 🌐';
  for (const char of bye) {
    process.stdout.write(minicurlGradient(char));
    await sleep(25);
  }
  console.log('\n\n');
  process.exit(0);
}

async function collectionsMenu() {
  console.log('\n' + COLORS.primary('  📦 COLLECTIONS') + '\n');
  console.log(COLORS.muted('  Em breve: salve e organize suas requisições favoritas.\n'));
}

async function settingsMenu() {
  console.log('\n' + COLORS.dim('  ⚙  CONFIGURAÇÕES') + '\n');

  const { setting } = await inquirer.prompt([
    {
      type: 'list',
      name: 'setting',
      message: 'Configuração:',
      prefix: COLORS.accent('  ◈'),
      choices: [
        { name: 'Timeout padrão', value: 'timeout' },
        { name: 'Headers padrão (ex: User-Agent)', value: 'headers' },
        { name: 'Proxy', value: 'proxy' },
        { name: COLORS.dim('↩  Voltar'), value: 'back' },
      ],
    },
  ]);

  if (setting === 'timeout') {
    const { val } = await inquirer.prompt([
      { type: 'input', name: 'val', message: 'Timeout padrão (segundos):', prefix: COLORS.accent('  ◈'), default: '30' },
    ]);
    console.log(COLORS.success(`  ✓ Timeout definido: ${val}s`));
  }
}
