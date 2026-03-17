/**
 * MinicUrl Request Engine - Motor de requisições HTTP
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs/promises';

export class RequestEngine {
  constructor() {
    this.defaultTimeout = 30000;
    this.defaultHeaders = {
      'User-Agent': 'MinicUrl/1.0.0 (HTTP Client)',
    };
  }

  async request({ method, url, headers = {}, body = null, timeout, followRedirects = true }) {
    const start = Date.now();
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';

    const options = {
      method: method.toUpperCase(),
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: { ...this.defaultHeaders, ...headers },
      timeout: timeout ?? this.defaultTimeout,
    };

    // Serializa body
    let bodyBuffer = null;
    if (body !== null && body !== undefined) {
      if (typeof body === 'object') {
        bodyBuffer = Buffer.from(JSON.stringify(body), 'utf8');
        if (!options.headers['Content-Type']) {
          options.headers['Content-Type'] = 'application/json';
        }
      } else {
        bodyBuffer = Buffer.from(String(body), 'utf8');
      }
      options.headers['Content-Length'] = bodyBuffer.length;
    }

    return new Promise((resolve, reject) => {
      const lib = isHttps ? https : http;

      const req = lib.request(options, (res) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const duration = Date.now() - start;
          const rawBody = Buffer.concat(chunks);
          const bodyStr = rawBody.toString('utf8');
          const size = rawBody.length;

          let data;
          const ct = res.headers['content-type'] || '';
          if (ct.includes('application/json')) {
            try { data = JSON.parse(bodyStr); } catch { data = bodyStr; }
          } else {
            data = bodyStr;
          }

          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            data,
            duration,
            size,
            raw: bodyStr,
          });
        });

        res.on('error', reject);
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        const err = new Error(`Timeout após ${(timeout ?? this.defaultTimeout) / 1000}s`);
        err.code = 'ETIMEDOUT';
        reject(err);
      });

      if (bodyBuffer) req.write(bodyBuffer);
      req.end();
    });
  }

  /**
   * Converte uma requisição para o comando cURL equivalente
   */
  toCurl({ method, url, headers = {}, body = null }) {
    const parts = [`curl -X ${method} '${url}'`];

    for (const [k, v] of Object.entries(headers)) {
      parts.push(`  -H '${k}: ${v}'`);
    }

    if (body !== null && body !== undefined) {
      const bodyStr = typeof body === 'object' ? JSON.stringify(body) : String(body);
      parts.push(`  -d '${bodyStr.replace(/'/g, "\\'")}'`);
    }

    return parts.join(' \\\n');
  }

  /**
   * Salva resultado em arquivo JSON
   */
  async saveToFile(result, filename) {
    const output = {
      timestamp: new Date().toISOString(),
      status: result.status,
      headers: result.headers,
      body: result.data,
      duration: result.duration,
    };
    await fs.writeFile(filename, JSON.stringify(output, null, 2), 'utf8');
  }

  /**
   * Envia múltiplas requisições em paralelo
   */
  async batch(requests) {
    return Promise.allSettled(requests.map(r => this.request(r)));
  }
}
