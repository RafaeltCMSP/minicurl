/**
 * MinicUrl AI — Renderer
 * Renderizador de Markdown no terminal.
 * Centraliza textos, formata código, headers, listas.
 * Estilo visual Cline-inspired com tema cyberpunk.
 */

import chalk from 'chalk';

// ─────────────────────────────────────────────
//  TEMA GLOBAL
// ─────────────────────────────────────────────
export const THEME = {
  // Cores base
  primary:    chalk.hex('#A855F7'),   // violeta  — AI output
  secondary:  chalk.hex('#EC4899'),   // pink     — títulos
  accent:     chalk.hex('#06B6D4'),   // ciano    — destaques
  user:       chalk.hex('#00FFB2'),   // verde    — mensagens do usuário
  dim:        chalk.hex('#555577'),   // dim      — separadores
  muted:      chalk.gray,
  white:      chalk.white,
  bold:       chalk.bold,

  // Status
  success:    chalk.hex('#39FF14'),
  error:      chalk.hex('#FF3131'),
  warning:    chalk.hex('#FFD700'),
  info:       chalk.hex('#00D4FF'),

  // Agentes
  agents: {
    orchestrator:   chalk.hex('#A855F7'),
    'request-agent':chalk.hex('#06B6D4'),
    'test-agent':   chalk.hex('#FFD700'),
    'explain-agent':chalk.hex('#EC4899'),
    'debug-agent':  chalk.hex('#FF3131'),
    'code-analyzer':chalk.hex('#39FF14'),
    'config-agent': chalk.gray,
  },
};

// ─────────────────────────────────────────────
//  HELPERS DE LAYOUT
// ─────────────────────────────────────────────

/** Largura efetiva da janela do terminal (com margem) */
export function termWidth() {
  return Math.min(process.stdout.columns || 100, 110);
}

/** Centraliza uma string no terminal */
export function center(text, width) {
  const w = width || termWidth();
  const stripped = stripAnsi(text);
  const pad = Math.max(0, Math.floor((w - stripped.length) / 2));
  return ' '.repeat(pad) + text;
}

/** Remove códigos ANSI para calcular comprimento real */
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

/** Linha horizontal centralizada */
export function separator(char = '─', color = THEME.dim) {
  const w = termWidth();
  return color(char.repeat(w));
}

/** Margem esquerda padrão */
const MARGIN = '  ';

// ─────────────────────────────────────────────
//  MARKDOWN RENDERER
// ─────────────────────────────────────────────

/**
 * Renderiza texto Markdown para o terminal com cores e formatação
 * @param {string} markdown
 * @returns {string[]}  — linhas renderizadas prontas para console.log
 */
export function renderMarkdown(markdown) {
  const lines = markdown.split('\n');
  const output = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Code blocks ──────────────────────────
    if (line.match(/^```/)) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.slice(3).trim().toLowerCase();
        codeLines = [];
      } else {
        // Fecha o bloco
        inCodeBlock = false;
        output.push(...renderCodeBlock(codeLines, codeLang));
        codeLines = [];
        codeLang = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // ── Headings ──────────────────────────────
    if (line.startsWith('### ')) {
      output.push('');
      output.push(MARGIN + THEME.accent('◆ ') + THEME.accent(chalk.bold(line.slice(4))));
      output.push('');
      continue;
    }
    if (line.startsWith('## ')) {
      output.push('');
      output.push(MARGIN + THEME.secondary(chalk.bold('▌ ' + line.slice(3))));
      output.push('');
      continue;
    }
    if (line.startsWith('# ')) {
      output.push('');
      output.push(MARGIN + THEME.primary(chalk.bold('█ ' + line.slice(2))));
      output.push('');
      continue;
    }

    // ── Horizontal rules ──────────────────────
    if (line.match(/^---+$/) || line.match(/^\*\*\*+$/)) {
      output.push(separator());
      continue;
    }

    // ── Bullet lists ──────────────────────────
    if (line.match(/^(\s*)[-*] /)) {
      const indent = line.match(/^(\s*)/)[1];
      const text = line.replace(/^(\s*)[-*] /, '');
      const level = Math.floor(indent.length / 2);
      const bullet = level === 0 ? THEME.accent('  ▸ ') : THEME.dim('    · ');
      output.push(bullet + inlineFormat(text));
      continue;
    }

    // ── Numbered lists ────────────────────────
    if (line.match(/^\d+\. /)) {
      const num = line.match(/^(\d+)\./)[1];
      const text = line.replace(/^\d+\. /, '');
      output.push(MARGIN + THEME.accent(num + '. ') + inlineFormat(text));
      continue;
    }

    // ── Blockquotes / Alerts ──────────────────
    if (line.startsWith('> ')) {
      const text = line.slice(2);
      output.push(THEME.dim('  │ ') + THEME.muted(inlineFormat(text)));
      continue;
    }

    // ── Empty line ────────────────────────────
    if (line.trim() === '') {
      output.push('');
      continue;
    }

    // ── Normal text ───────────────────────────
    output.push(MARGIN + inlineFormat(line));
  }

  // Fecha bloco de código aberto sem fechar
  if (inCodeBlock && codeLines.length > 0) {
    output.push(...renderCodeBlock(codeLines, codeLang));
  }

  return output;
}

/**
 * Formata inline: **bold**, *italic*, `code`, links
 */
function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, (_, t) => chalk.bold(t))
    .replace(/\*(.+?)\*/g, (_, t) => chalk.italic(t))
    .replace(/`([^`]+)`/g, (_, t) => chalk.bgHex('#1A1A2E')(THEME.accent(t)))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, (_, t) => THEME.info(t) + THEME.dim(' ↗'));
}

/**
 * Renderiza bloco de código com moldura
 */
function renderCodeBlock(lines, lang) {
  const output = [];
  const w = Math.min(termWidth() - 4, 80);
  const langLabel = lang ? THEME.dim(` ${lang} `) : '';
  const topBorder = THEME.dim('  ┌' + langLabel + '─'.repeat(Math.max(0, w - langLabel.length - 1)) + '┐');
  const botBorder = THEME.dim('  └' + '─'.repeat(w) + '┘');

  output.push('');
  output.push(topBorder);

  for (const line of lines) {
    const truncated = line.length > w - 2 ? line.substring(0, w - 5) + '...' : line;
    output.push(THEME.dim('  │ ') + syntaxHighlight(truncated, lang) + THEME.dim(' │'));
  }

  output.push(botBorder);
  output.push('');
  return output;
}

/**
 * Syntax highlighting básico por linguagem
 */
function syntaxHighlight(line, lang) {
  if (lang === 'bash' || lang === 'sh') {
    return line
      .replace(/^(curl|node|npm|git|mkdir|cd|ls|echo)(\s)/, (m, cmd, sp) => THEME.success(cmd) + sp)
      .replace(/(-[Hd]\s|--\w+)/g, m => THEME.warning(m))
      .replace(/(https?:\/\/[^\s'"]+)/g, m => THEME.info(m))
      .replace(/('[^']*'|"[^"]*")/g, m => THEME.accent(m));
  }
  if (lang === 'json') {
    return line
      .replace(/"([^"]+)":/g, (m, k) => THEME.secondary(`"${k}"`) + ':')
      .replace(/:\s*"([^"]+)"/g, (m, v) => ': ' + THEME.accent(`"${v}"`))
      .replace(/:\s*(\d+)/g, (m, n) => ': ' + THEME.warning(n))
      .replace(/:\s*(true|false|null)/g, (m, b) => ': ' + THEME.info(b));
  }
  if (lang === 'js' || lang === 'javascript' || lang === 'ts' || lang === 'typescript') {
    return line
      .replace(/\b(import|export|const|let|var|function|async|await|return|if|else|for|class)\b/g,
        m => THEME.primary(m))
      .replace(/('([^']*)'|"([^"]*)")/g, m => THEME.accent(m))
      .replace(/(\/\/.*)/g, m => THEME.dim(m));
  }
  return THEME.white(line);
}

// ─────────────────────────────────────────────
//  COMPONENTES DE UI
// ─────────────────────────────────────────────

/**
 * Imprime o header da IA (logo centralizado)
 */
export function printAIHeader(model, ollamaUrl) {
  const w = termWidth();
  console.log('');

  // Logo compacto
  const logo = [
    '    ╔╦╗  ╦  ╔╗╔  ╦  ╔═╗  ╦ ╦  ╦═╗  ╦     ',
    '    ║║║  ║  ║║║  ║  ║    ║ ║  ╠╦╝  ║     ',
    '    ╩ ╩  ╩  ╝╚╝  ╩  ╚═╝  ╚═╝  ╩╚═  ╩═╝   ',
    '          A I   A S S I S T A N T          ',
  ];

  for (const line of logo) {
    console.log(center(THEME.primary(line), w));
  }

  console.log('');
  const sub = `  ⬡ ${model}  ·  ${ollamaUrl}  `;
  console.log(center(THEME.dim(sub), w));
  console.log('');
  console.log(separator('═'));
  console.log('');
}

/**
 * Badge de agente colorido
 */
export function agentBadge(agentId) {
  const badges = {
    'orchestrator':   '🧠 Orquestrador',
    'request-agent':  '⚡ Req. HTTP',
    'test-agent':     '🧪 Testes',
    'explain-agent':  '📚 Explicador',
    'debug-agent':    '🔍 Debugger',
    'code-analyzer':  '🔭 Analisador',
    'config-agent':   '⚙️  Config',
    'error-handler':  '⚠️  Erro',
  };
  const label = badges[agentId] || `🤖 ${agentId}`;
  const color = THEME.agents[agentId] || THEME.primary;
  return color(label);
}

/**
 * Renderiza mensagem completa do assistente no terminal
 */
export function printAssistantMessage(content, agentUsed, stats) {
  const badge = agentBadge(agentUsed || 'orchestrator');
  const color = THEME.agents[agentUsed] || THEME.primary;

  // Cabeçalho da mensagem
  console.log('');
  console.log(THEME.dim('  ╭─ ') + badge);
  console.log(THEME.dim('  │'));

  // Renderiza markdown
  const rendered = renderMarkdown(content);
  for (const line of rendered) {
    const prefix = line.trim() === '' ? '' : THEME.dim('  │') + ' ';
    console.log(line.trim() === '' ? '' : THEME.dim('  │') + ' ' + line.trimStart());
  }

  // Rodapé com stats
  console.log(THEME.dim('  │'));
  const statParts = [];
  if (stats?.responseTokens) statParts.push(`${stats.responseTokens} tokens`);
  if (stats?.durationMs) statParts.push(`${stats.durationMs}ms`);
  if (statParts.length) {
    console.log(THEME.dim('  ╰─ · ') + THEME.dim(statParts.join(' · ')));
  } else {
    console.log(THEME.dim('  ╰─'));
  }
  console.log('');
}

/**
 * Renderiza mensagem do usuário
 */
export function printUserMessage(text) {
  console.log('');
  console.log(THEME.dim('  ╭─ ') + THEME.user('Você'));
  const lines = text.split('\n');
  for (const line of lines) {
    console.log(THEME.dim('  │ ') + THEME.white(line));
  }
  console.log(THEME.dim('  ╰─'));
  console.log('');
}

/**
 * Status bar na parte inferior — modelo, sessão, stats
 */
export function printStatusBar(model, sessionInfo = {}) {
  const w = termWidth();
  const left = ` ● ${model} `;
  const mid = sessionInfo.messages ? `${sessionInfo.messages} msgs` : '';
  const right = sessionInfo.memory ? ` 🧠 mem: ${sessionInfo.memory}` : '';

  const bar = THEME.dim(left) + ' '.repeat(Math.max(0, w - left.length - mid.length - right.length - 2)) +
              THEME.dim(mid) + THEME.dim(right);
  console.log(separator('─'));
  console.log(bar);
}

/**
 * Spinner animado
 */
export function createSpinner(text = 'Pensando...') {
  const frames = ['◐', '◓', '◑', '◒'];
  let i = 0;
  let timer;
  return {
    start() {
      process.stdout.write('\n');
      timer = setInterval(() => {
        process.stdout.write(`\r  ${THEME.primary(frames[i++ % 4])} ${THEME.dim(text)}`);
      }, 100);
    },
    stop() {
      clearInterval(timer);
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    },
  };
}

/**
 * Box de destaque para informação importante
 */
export function infoBox(lines, opts = {}) {
  const w = opts.width || Math.min(70, termWidth() - 4);
  const color = opts.color || THEME.dim;
  const output = [];
  output.push('  ' + color('╔' + '═'.repeat(w) + '╗'));
  for (const line of lines) {
    const stripped = stripAnsi(line);
    const pad = w - stripped.length - 1;
    output.push('  ' + color('║ ') + line + ' '.repeat(Math.max(0, pad)) + color('║'));
  }
  output.push('  ' + color('╚' + '═'.repeat(w) + '╝'));
  return output.join('\n');
}
