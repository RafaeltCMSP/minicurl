/**
 * MinicUrl Display - Renderização bonita das respostas HTTP
 */

import chalk from 'chalk';
import boxen from 'boxen';

export async function displayResult(result, method, url, COLORS) {
  const { status, statusText, headers, data, duration, size } = result;

  // Status bar
  const statusBg = getStatusBg(status);
  const statusLine = [
    statusBg(` ${status} ${statusText} `),
    COLORS.dim(`  ${duration}ms`),
    COLORS.dim(`  ${formatBytes(size)}`),
  ].join('');

  console.log('\n' + '  ' + statusLine + '\n');

  // Headers da resposta
  if (headers && Object.keys(headers).length > 0) {
    console.log(COLORS.dim('  ┌─ Response Headers'));
    const importantHeaders = ['content-type', 'content-length', 'cache-control', 'x-request-id', 'x-ratelimit-remaining'];
    for (const [k, v] of Object.entries(headers)) {
      if (importantHeaders.includes(k.toLowerCase())) {
        console.log(COLORS.dim('  │  ') + COLORS.info(k) + COLORS.dim(': ') + COLORS.white(v));
      }
    }
    console.log(COLORS.dim('  └─\n'));
  }

  // Body
  if (data !== null && data !== undefined) {
    let formatted;
    const ct = (headers?.['content-type'] || '').toLowerCase();

    if (ct.includes('application/json') || typeof data === 'object') {
      try {
        const json = typeof data === 'string' ? JSON.parse(data) : data;
        formatted = syntaxHighlightJSON(JSON.stringify(json, null, 2));
      } catch {
        formatted = COLORS.white(String(data));
      }
    } else if (ct.includes('text/html')) {
      formatted = COLORS.dim('[HTML] ') + COLORS.white(String(data).substring(0, 500)) +
        (String(data).length > 500 ? COLORS.dim('\n  ... (truncado)') : '');
    } else {
      formatted = COLORS.white(String(data).substring(0, 1000));
    }

    const lines = formatted.split('\n');
    const maxLines = 40;
    const displayed = lines.slice(0, maxLines);

    console.log(COLORS.dim('  ┌─ Response Body'));
    for (const line of displayed) {
      console.log(COLORS.dim('  │  ') + line);
    }
    if (lines.length > maxLines) {
      console.log(COLORS.dim(`  │  ... +${lines.length - maxLines} linhas`));
    }
    console.log(COLORS.dim('  └─\n'));
  } else {
    console.log(COLORS.muted('  (sem body)\n'));
  }

  // Performance insights
  printPerformanceInsight(duration, COLORS);
}

function syntaxHighlightJSON(json) {
  return json
    .replace(/"([^"]+)":/g, (_, k) => chalk.hex('#00D4FF')(`"${k}"`) + chalk.gray(':'))
    .replace(/: "([^"]*)"/g, (_, v) => chalk.gray(': ') + chalk.hex('#FFD700')(`"${v}"`))
    .replace(/: (true|false)/g, (_, v) => chalk.gray(': ') + chalk.hex('#FF6B35')(v))
    .replace(/: (null)/g, (_, v) => chalk.gray(': ') + chalk.hex('#7B2FBE')(v))
    .replace(/: (-?\d+\.?\d*)/g, (_, v) => chalk.gray(': ') + chalk.hex('#39FF14')(v));
}

function getStatusBg(status) {
  if (status >= 500) return chalk.bgRed.white.bold;
  if (status >= 400) return chalk.bgHex('#FF6B35').black.bold;
  if (status >= 300) return chalk.bgHex('#00D4FF').black.bold;
  if (status >= 200) return chalk.bgHex('#39FF14').black.bold;
  return chalk.bgGray.white.bold;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function printPerformanceInsight(duration, COLORS) {
  let insight = '';
  if (duration < 100) insight = COLORS.success('  ⚡ Resposta muito rápida');
  else if (duration < 500) insight = COLORS.primary('  ✓ Resposta dentro do normal');
  else if (duration < 1500) insight = COLORS.warning('  ⚠ Resposta um pouco lenta');
  else insight = COLORS.error('  ✗ Resposta lenta — verifique o servidor');

  console.log(insight + COLORS.dim(` (${duration}ms)\n`));
}
