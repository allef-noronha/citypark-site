import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const cwd = fileURLToPath(new URL('.', import.meta.url));
const env = {...process.env, GCLOUD_PROJECT: 'demo-citypark-reserva', GOOGLE_CLOUD_PROJECT: 'demo-citypark-reserva'};
delete env.GOOGLE_APPLICATION_CREDENTIALS;
if (process.platform === 'win32') {
  const socketDirectory = path.join(cwd, '.emulator-tmp');
  mkdirSync(socketDirectory, {recursive: true});
  env.JAVA_TOOL_OPTIONS = `${env.JAVA_TOOL_OPTIONS || ''} "-Djdk.net.unixdomain.tmpdir=${socketDirectory}"`.trim();
}

const report = [];
function run(args) {
  const result = spawnSync(process.execPath, args, {cwd, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  const output = `${result.stdout || ''}${result.stderr || ''}${result.error ? String(result.error) : ''}`;
  process.stdout.write(output);
  report.push(output);
  writeFileSync(path.join(cwd, 'resultado-testes.txt'), report.join('\n'));
  return result.status ?? 1;
}

const fixtures = run(['--test', 'tests/fixtures.test.mjs', '../tests/detalhes-proposta.test.cjs', '../tests/tabela-admin.test.cjs', '../tests/disponibilidade-publica.test.cjs']);
if (fixtures !== 0) process.exit(fixtures);
process.exit(run([
  require.resolve('firebase-tools/lib/bin/firebase.js'),
  'emulators:exec', '--only', 'firestore', '--project', 'demo-citypark-reserva',
  '--config', 'firebase.json', process.argv.includes('--commercial') ? 'node --test tests/comercial.test.mjs' : 'node --test --test-concurrency=1 tests/reserva.test.mjs tests/comercial.test.mjs'
]));
