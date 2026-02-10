#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import axios, { AxiosError } from 'axios';
import path from 'path';
import { spawn } from 'child_process';
import { startDaemon, HOST, PORT } from './server';
import { DEFAULT_CONFIG_FILENAME, resolveConfigPath } from './config';
import { ApiResponseEnvelope } from './types';

const EXIT_SUCCESS = 0;
const EXIT_RUNTIME_ERROR = 1;
const EXIT_INVALID_ARGS = 2;
const BASE_URL = `http://${HOST}:${PORT}`;
const HEALTH_ENDPOINT = `${BASE_URL}/health`;
const AUTO_START_TIMEOUT = 8000;

interface NormalizedOptions {
  json: boolean;
  configPath: string;
}

async function main() {
  const argv = process.argv.slice(2);
  const daemonIntent = detectDaemonIntent(argv);
  if (daemonIntent.active) {
    if (daemonIntent.remaining.length > 0) {
      emitEarlyError('The --daemon flag cannot be combined with other commands.', daemonIntent.wantsJson, true);
    }
    const configPath = resolveConfigPath(daemonIntent.configOverride);
    await startDaemon({ configPath });
    return;
  }

  const program = new Command();
  program
    .name('agentwallet')
    .description('Agent-friendly Ethereum wallet CLI')
    .option('--config <path>', 'Path to config file', DEFAULT_CONFIG_FILENAME)
    .option('--json', 'Output machine-readable JSON envelope', false)
    .configureHelp({ sortSubcommands: true })
    .showHelpAfterError('(use --help for usage information)');

  program.exitOverride((err: CommanderError) => {
    if (err.code === 'commander.helpDisplayed') {
      process.exit(EXIT_SUCCESS);
    }
    const wantsJson = detectJsonFlag(process.argv.slice(2));
    emitEarlyError(err.message, wantsJson, true);
  });

  program
    .command('version')
    .description('Show AgentWallet daemon version')
    .action(async function (this: Command) {
      await executeCommand(this, async () => apiGet<{ version: string }>('/version'), (payload) => `AgentWallet v${payload.version}`);
    });

  program
    .command('build-info')
    .description('Return build metadata for diagnostics')
    .action(async function (this: Command) {
      await executeCommand(this, async () => apiGet('/build-info'), (payload) => renderKeyValues(payload));
    });

  program
    .command('networks')
    .description('List configured networks')
    .action(async function (this: Command) {
      await executeCommand(
        this,
        async () => apiGet<{ networks: Array<{ name: string; rpcUrl: string }> }>('/networks'),
        ({ networks }) => renderList(networks.map((n) => `${n.name} -> ${n.rpcUrl}`))
      );
    });

  const account = program.command('account').description('Wallet account management');

  account
    .command('list')
    .description('List managed accounts')
    .action(async function (this: Command) {
      await executeCommand(
        this,
        async () => apiGet<{ accounts: Array<{ address: string; label: string; networks: string[] }> }>('/accounts'),
        ({ accounts }) => renderList(accounts.map((acc) => `${acc.label}: ${acc.address} (${acc.networks.join(', ')})`))
      );
    });

  program
    .command('balance')
    .description('Return balance for an address on a network')
    .requiredOption('--address <address>', 'Target address')
    .requiredOption('--network <network>', 'Network name (eip155:<id>)')
    .action(async function (this: Command) {
      const local = this.opts();
      await executeCommand(
        this,
        async () => apiGet('/balance', { address: local.address, network: local.network }),
        (payload) => `${payload.address} on ${payload.network}: ${payload.balanceEth} ETH`
      );
    });

  program
    .command('send')
    .description('Send a mocked transaction')
    .requiredOption('--network <network>', 'Network name (eip155:<id>)')
    .requiredOption('--from <address>', 'Sender address')
    .option('--to <address>', 'Recipient address')
    .option('--contract <address>', 'Contract address')
    .option('--nonce <number>', 'Optional nonce', (value) => Number(value))
    .option('--value <eth>', 'ETH amount as string')
    .option('--data <hex>', 'Hex payload')
    .option('--gas-price <wei>', 'Gas price in wei string')
    .action(async function (this: Command) {
      const local = this.opts();
      await executeCommand(
        this,
        async () =>
          apiPost('/tx/send', {
            network: local.network,
            from: local.from,
            to: local.to,
            contract: local.contract,
            nonce: local.nonce,
            value: local.value,
            data: local.data,
            gasPrice: local.gasPrice
          }),
        (payload) => `Submitted transaction ${payload.guid} (${payload.status})`
      );
    });

  program
    .command('tx')
    .description('Transaction utilities')
    .command('status')
    .description('Check transaction status by GUID')
    .requiredOption('--guid <guid>', 'Transaction GUID from send result')
    .action(async function (this: Command) {
      const local = this.opts();
      await executeCommand(
        this,
        async () => apiGet('/tx/status', { guid: local.guid }),
        (payload) => `${payload.guid}: ${payload.status}`
      );
    });

  const wc = program.command('wc').description('WalletConnect session operations');

  wc
    .command('status')
    .description('List WalletConnect sessions')
    .action(async function (this: Command) {
      await executeCommand(
        this,
        async () => apiGet('/wc/sessions'),
        (payload) =>
          payload.sessions.length === 0
            ? 'No WalletConnect sessions'
            : renderList(payload.sessions.map((s: any) => `${s.id}: ${s.address} on ${s.network} (${s.status})`))
      );
    });

  wc
    .command('connect')
    .description('Create a new WalletConnect session')
    .requiredOption('--network <network>', 'Network identifier')
    .requiredOption('--address <address>', 'Active address')
    .requiredOption('--uri <wc-uri>', 'WalletConnect URI')
    .action(async function (this: Command) {
      const local = this.opts();
      await executeCommand(
        this,
        async () => apiPost('/wc/connect', { network: local.network, address: local.address, uri: local.uri }),
        (payload) => `WalletConnect session ${payload.id} connected`
      );
    });

  wc
    .command('switch')
    .description('Switch session address or network')
    .requiredOption('--session <id>', 'Session id to mutate')
    .option('--address <address>', 'New address')
    .option('--network <network>', 'New network')
    .action(async function (this: Command) {
      const local = this.opts();
      await executeCommand(
        this,
        async () => apiPost('/wc/switch', { session: local.session, address: local.address, network: local.network }),
        (payload) => `Session ${payload.id} switched to ${payload.address} on ${payload.network}`
      );
    });

  wc
    .command('disconnect')
    .description('Disconnect a session')
    .requiredOption('--session <id>', 'Session id to close')
    .action(async function (this: Command) {
      const local = this.opts();
      await executeCommand(
        this,
        async () => apiPost('/wc/disconnect', { session: local.session }),
        (payload) => `Session ${payload.id} disconnected`
      );
    });

  await program.parseAsync(process.argv);
}

async function executeCommand<T>(command: Command, runner: (opts: NormalizedOptions) => Promise<T>, formatter?: (payload: T) => string) {
  const opts = extractOptions(command);
  try {
    await ensureDaemonRunning(opts.configPath);
    const data = await runner(opts);
    emitSuccess(opts, data, formatter);
  } catch (error) {
    handleCommandError(opts, error);
  }
}

function extractOptions(command: Command): NormalizedOptions {
  const opts = command.optsWithGlobals();
  const configPath = resolveConfigPath(opts.config);
  return { json: Boolean(opts.json), configPath };
}

function handleCommandError(opts: NormalizedOptions, error: unknown): never {
  if (axios.isAxiosError(error)) {
    const invalidArgs = isInvalidArgsError(error);
    const message = extractAxiosMessage(error);
    return emitError(opts, message, invalidArgs);
  }
  if (error instanceof Error) {
    return emitError(opts, error.message, false);
  }
  return emitError(opts, 'Unknown error', false);
}

function extractAxiosMessage(error: AxiosError): string {
  if (error.response?.data && typeof error.response.data === 'object') {
    const body = error.response.data as Record<string, any>;
    if (typeof body.error === 'string') {
      return body.error;
    }
  }
  if (typeof error.message === 'string') {
    return error.message;
  }
  return 'Request failed';
}

function isInvalidArgsError(error: AxiosError): boolean {
  const status = error.response?.status ?? 0;
  return status === 400 || status === 422;
}

async function ensureDaemonRunning(configPath: string): Promise<void> {
  if (await isDaemonHealthy()) {
    return;
  }
  await spawnDaemonProcess(configPath);
  const expiry = Date.now() + AUTO_START_TIMEOUT;
  while (Date.now() < expiry) {
    if (await isDaemonHealthy()) {
      return;
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for AgentWallet daemon to start.');
}

async function isDaemonHealthy(): Promise<boolean> {
  try {
    await axios.get(HEALTH_ENDPOINT, { timeout: 500 });
    return true;
  } catch (_err) {
    return false;
  }
}

async function spawnDaemonProcess(configPath: string): Promise<void> {
  const entryScript = path.resolve(process.argv[1] ?? __filename);
  const child = spawn(process.execPath, [entryScript, '--daemon', '--config', configPath], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  await delay(250);
}

async function apiGet<T = any>(path: string, params?: Record<string, unknown>): Promise<T> {
  const response = await axios.get<T>(`${BASE_URL}${path}`, { params, timeout: 5000 });
  return response.data;
}

async function apiPost<T = any>(path: string, data: Record<string, unknown>): Promise<T> {
  const response = await axios.post<T>(`${BASE_URL}${path}`, data, { timeout: 5000 });
  return response.data;
}

function emitSuccess<T>(opts: NormalizedOptions, data: T, formatter?: (payload: T) => string): void {
  if (opts.json) {
    const envelope: ApiResponseEnvelope<T> = { success: true, data, error: null };
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }
  if (formatter) {
    console.log(formatter(data));
  } else {
    console.log(renderKeyValues(data as Record<string, unknown>));
  }
}

function emitError(opts: NormalizedOptions, message: string, invalidArgs: boolean): never {
  const envelope: ApiResponseEnvelope<null> = {
    success: false,
    data: null,
    error: { code: invalidArgs ? 'INVALID_ARGS' : 'RUNTIME_ERROR', message }
  };
  if (opts.json) {
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.error(message);
  }
  process.exit(invalidArgs ? EXIT_INVALID_ARGS : EXIT_RUNTIME_ERROR);
}

function emitEarlyError(message: string, wantsJson: boolean, invalidArgs: boolean): never {
  const envelope: ApiResponseEnvelope<null> = {
    success: false,
    data: null,
    error: { code: invalidArgs ? 'INVALID_ARGS' : 'RUNTIME_ERROR', message }
  };
  if (wantsJson) {
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.error(message);
  }
  process.exit(invalidArgs ? EXIT_INVALID_ARGS : EXIT_RUNTIME_ERROR);
}

function renderKeyValues(data: Record<string, any>): string {
  return Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join('\n');
}

function renderList(rows: string[]): string {
  return rows.map((row) => `- ${row}`).join('\n');
}

function detectDaemonIntent(argv: string[]) {
  let active = false;
  let configOverride: string | undefined;
  const remaining: string[] = [];
  const wantsJson = detectJsonFlag(argv);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--daemon') {
      active = true;
      continue;
    }
    if (token === '--config') {
      configOverride = argv[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith('--config=')) {
      configOverride = token.slice('--config='.length);
      continue;
    }
    if (token === '--json') {
      continue;
    }
    remaining.push(token);
  }
  return { active, configOverride, remaining, wantsJson };
}

function detectJsonFlag(argv: string[]): boolean {
  return argv.some((token) => token === '--json');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  const wantsJson = detectJsonFlag(process.argv.slice(2));
  const message = err instanceof Error ? err.message : 'Unexpected error';
  emitEarlyError(message, wantsJson, false);
});
