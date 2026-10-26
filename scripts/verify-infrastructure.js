// Local operator-only tool: never bundle into or expose through the public Worker.
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { verifyInfrastructure } from '../src/infrastructure.js';
const execute = promisify(execFile);
const root = new URL('../', import.meta.url);
process.chdir(fileURLToPath(root));
let config;
try { config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8')); } catch { /* sanitized below */ }
const binding = config?.d1_databases?.find(db => db.binding === 'DB');
const bindingValid = binding?.database_name === 'market-research-db'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(binding.database_id ?? '');
// Only generated test messages enter SQL. Never pass the FMP key to Wrangler.
const db = bindingValid ? {
  prepare(sql) {
    return { bind(message) {
      if (!/^infrastructure-check-[0-9a-f-]+$/.test(message)) throw new Error('Invalid test message');
      const command = sql.replace('?', `'${message}'`);
      const query = async () => {
        const childEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
        delete childEnv.FMP_API_KEY;
        const { stdout } = await execute(process.execPath, [
          'node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'market-research-db',
          '--remote', '--config', 'wrangler.jsonc', '--command', command, '--json',
        ], { env: childEnv, timeout: 60000, maxBuffer: 1024 * 1024 });
        const data = JSON.parse(stdout);
        if (!Array.isArray(data) || data.length !== 1 || data[0].success !== true) throw new Error('D1 command failed');
        return data[0].results;
      };
      return { run: query, first: async () => (await query())?.[0] };
    } };
  },
} : undefined;
try {
  const results = await verifyInfrastructure({ DB: db, FMP_API_KEY: process.env.FMP_API_KEY }, {
    configurationValid: config?.name === 'market-analysis' && config?.main === 'src/index.js' && bindingValid,
    approveD1Write: process.argv.includes('--approve-d1-write'),
    approveFmpRequest: process.argv.includes('--approve-fmp-request'),
  });
  for (const [label, result] of Object.entries(results)) console.log(`${label}: ${result.status}${result.error ? ` — ${result.error}` : ''}`);
  if (Object.values(results).some(result => result.status === 'FAIL')) process.exitCode = 1;
} catch {
  console.error('Verification could not complete. Check local configuration and tooling.');
  process.exitCode = 1;
}
