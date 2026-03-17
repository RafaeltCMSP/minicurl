#!/usr/bin/env node

/**
 * MinicUrl - CLI Entry Point
 * Ponto de entrada com splash screen animado
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importações dinâmicas para ESM
async function bootstrap() {
  const args = process.argv.slice(2);

  // Se não há argumentos, abre o modo interativo (TUI)
  if (args.length === 0 || args[0] === 'ui' || args[0] === '--ui') {
    const { launchTUI } = await import('../src/ui/tui.js');
    await launchTUI();
  } else if (args[0] === 'ai') {
    // Módulo de IA com Ollama
    const { runAICLI } = await import('../src/ai/aiCLI.js');
    await runAICLI(args.slice(1));
  } else {
    // Modo CLI direto (GET, POST, etc.)
    const { runCLI } = await import('../src/cli.js');
    await runCLI();
  }
}

bootstrap().catch(err => {
  console.error('\x1b[31mErro fatal:\x1b[0m', err.message);
  process.exit(1);
});
