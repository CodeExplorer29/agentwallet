import express, { Request, Response } from 'express';
import { execSync } from 'child_process';
import { Server } from 'http';
import { randomUUID } from 'crypto';
import { loadConfig, listNetworkNames } from './config';
import {
  AccountRecord,
  BalanceResult,
  TxRecord,
  TxSendRequest,
  TxStatusResponse,
  WalletConnectSession,
  WalletConfig
} from './types';
import packageInfo from '../package.json';

export const HOST = '127.0.0.1';
export const PORT = 6756;

interface BuildInfo {
  version: string;
  platform: string;
  node: string;
  buildTime: string;
  gitCommit?: string;
}

export interface DaemonOptions {
  configPath: string;
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const HEX_DATA_REGEX = /^0x[a-fA-F0-9]*$/;
const NETWORK_REGEX = /^eip155:\d+$/i;
const MOCK_ACCOUNTS = [
  { address: '0x1111111111111111111111111111111111111111', label: 'Agent Primary' },
  { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Research Wallet' },
  { address: '0x2222222222222222222222222222222222222222', label: 'Automation Vault' }
];
const CONFIRM_DELAY_MS = 5_000;

export async function startDaemon(options: DaemonOptions): Promise<void> {
  const state = new DaemonState(options.configPath);
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSec: state.getUptimeSeconds() });
  });

  app.get('/version', (_req, res) => {
    res.json({ version: state.buildInfo.version });
  });

  app.get('/build-info', (_req, res) => {
    res.json(state.buildInfo);
  });

  app.get('/networks', (_req, res) => {
    res.json({ networks: state.config.networks });
  });

  app.get('/accounts', (_req, res) => {
    res.json({ accounts: state.accounts });
  });

  app.get('/balance', (req, res) => {
    const address = String(req.query.address ?? '');
    const network = String(req.query.network ?? '');
    if (!isValidAddress(address) || !state.isKnownNetwork(network)) {
      return respondError(res, 400, 'address and network must be provided as valid values.');
    }
    const payload = state.getBalance(address, network);
    res.json(payload);
  });

  app.post('/tx/send', (req, res) => {
    try {
      const record = state.createTransaction(req.body ?? {});
      res.json({ guid: record.guid, status: record.status });
    } catch (err) {
      respondError(res, 400, (err as Error).message);
    }
  });

  app.get('/tx/status', (req, res) => {
    const guid = String(req.query.guid ?? '').trim();
    if (!guid) {
      return respondError(res, 400, 'guid is required.');
    }
    const status = state.getTransactionStatus(guid);
    res.json(status);
  });

  app.get('/wc/sessions', (_req, res) => {
    res.json({ sessions: state.listSessions() });
  });

  app.post('/wc/connect', (req, res) => {
    try {
      const session = state.connectSession(req.body ?? {});
      res.json(session);
    } catch (err) {
      respondError(res, 400, (err as Error).message);
    }
  });

  app.post('/wc/switch', (req, res) => {
    try {
      const session = state.switchSession(req.body ?? {});
      res.json(session);
    } catch (err) {
      respondError(res, 400, (err as Error).message);
    }
  });

  app.post('/wc/disconnect', (req, res) => {
    try {
      const session = state.disconnectSession(req.body ?? {});
      res.json(session);
    } catch (err) {
      respondError(res, 400, (err as Error).message);
    }
  });

  app.use((err: Error, _req: Request, res: Response, _next: () => void) => {
    if (err instanceof SyntaxError) {
      respondError(res, 400, 'Invalid JSON payload.');
      return;
    }
    respondError(res, 500, err.message || 'Internal server error');
  });

  await holdServer(app);
}

async function holdServer(app: express.Express): Promise<void> {
  const server: Server = app.listen(PORT, HOST);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => {
      console.log(`AgentWallet daemon listening on http://${HOST}:${PORT}`);
      resolve();
    });
    server.once('error', reject);
  });
  const closeSignals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  closeSignals.forEach((signal) => {
    process.on(signal, () => server.close(() => process.exit(0)));
  });
  await new Promise(() => {
    /* keep server alive until killed */
  });
}

class DaemonState {
  readonly config: WalletConfig;
  readonly accounts: AccountRecord[];
  readonly buildInfo: BuildInfo;
  private readonly txStore = new Map<string, TxRecord>();
  private readonly sessions = new Map<string, WalletConnectSession>();
  private readonly startedAt = Date.now();

  constructor(configPath: string) {
    this.config = loadConfig(configPath);
    this.accounts = MOCK_ACCOUNTS.map((account) => ({
      ...account,
      networks: listNetworkNames(this.config)
    }));
    this.buildInfo = this.computeBuildInfo();
  }

  getUptimeSeconds(): number {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }

  isKnownNetwork(network: string): boolean {
    return this.config.networks.some((net) => net.name === network);
  }

  getBalance(address: string, network: string): BalanceResult {
    const amount = computeMockBalance(address, network);
    return {
      address,
      network,
      balanceEth: amount,
      updatedAt: new Date().toISOString()
    };
  }

  createTransaction(payload: TxSendRequest): TxRecord {
    validateTransactionPayload(payload, this);
    const record: TxRecord = {
      ...payload,
      guid: randomUUID(),
      status: 'PENDING',
      createdAt: Date.now()
    };
    this.txStore.set(record.guid, record);
    return record;
  }

  getTransactionStatus(guid: string): TxStatusResponse {
    const record = this.txStore.get(guid);
    if (!record) {
      return { guid, status: 'UNKNOWN', updatedAt: new Date().toISOString() };
    }
    const now = Date.now();
    if (record.status === 'PENDING' && now - record.createdAt > CONFIRM_DELAY_MS) {
      record.status = 'CONFIRMED';
      this.txStore.set(guid, record);
    }
    return { guid, status: record.status, updatedAt: new Date().toISOString() };
  }

  listSessions(): WalletConnectSession[] {
    return Array.from(this.sessions.values());
  }

  connectSession(data: any): WalletConnectSession {
    const address = normalizeAddress(data.address);
    const network = String(data.network ?? '').trim();
    const uri = String(data.uri ?? '').trim();
    if (!isValidAddress(address) || !NETWORK_REGEX.test(network) || !uri.startsWith('wc:')) {
      throw new Error('network, address, and uri must be provided for WalletConnect.');
    }
    if (!this.isKnownNetwork(network)) {
      throw new Error(`Unknown network ${network}.`);
    }
    const session: WalletConnectSession = {
      id: randomUUID(),
      address,
      network,
      uri,
      status: 'CONNECTED',
      connectedAt: new Date().toISOString()
    };
    this.sessions.set(session.id, session);
    return session;
  }

  switchSession(data: any): WalletConnectSession {
    const id = String(data.session ?? '').trim();
    if (!id || !this.sessions.has(id)) {
      throw new Error('session must reference an existing session id.');
    }
    const existing = this.sessions.get(id)!;
    const nextAddress = data.address ? normalizeAddress(data.address) : existing.address;
    const nextNetwork = data.network ? String(data.network).trim() : existing.network;
    if (data.address && !isValidAddress(nextAddress)) {
      throw new Error('address must be a valid hex string.');
    }
    if (data.network && !this.isKnownNetwork(nextNetwork)) {
      throw new Error(`Unknown network ${nextNetwork}.`);
    }
    const updated: WalletConnectSession = {
      ...existing,
      address: nextAddress,
      network: nextNetwork
    };
    this.sessions.set(id, updated);
    return updated;
  }

  disconnectSession(data: any): WalletConnectSession {
    const id = String(data.session ?? '').trim();
    if (!id || !this.sessions.has(id)) {
      throw new Error('session must reference an existing session id.');
    }
    const existing = this.sessions.get(id)!;
    const updated: WalletConnectSession = {
      ...existing,
      status: 'DISCONNECTED'
    };
    this.sessions.set(id, updated);
    return updated;
  }

  private computeBuildInfo(): BuildInfo {
    return {
      version: packageInfo.version ?? '0.0.0',
      platform: `${process.platform} ${process.arch}`,
      node: process.version,
      buildTime: new Date().toISOString(),
      gitCommit: detectGitCommit()
    };
  }
}

function detectGitCommit(): string | undefined {
  const envCommit = process.env.AGENTWALLET_GIT_COMMIT || process.env.GIT_COMMIT;
  if (envCommit) {
    return envCommit;
  }
  try {
    const output = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return output || undefined;
  } catch (err) {
    return undefined;
  }
}

function computeMockBalance(address: string, network: string): string {
  const addrPart = BigInt('0x' + address.slice(2, 10));
  const networkPart = BigInt(network.split(':')[1] ?? '0');
  const raw = Number((addrPart + networkPart) % BigInt(500000));
  return (raw / 1000).toFixed(6);
}

function validateTransactionPayload(payload: TxSendRequest, state: DaemonState): void {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Transaction payload must be an object.');
  }
  const network = String(payload.network ?? '').trim();
  const from = normalizeAddress(payload.from);
  const to = payload.to ? normalizeAddress(payload.to) : undefined;
  const contract = payload.contract ? normalizeAddress(payload.contract) : undefined;
  if (!NETWORK_REGEX.test(network) || !state.isKnownNetwork(network)) {
    throw new Error('network must be provided using eip155:<id> format.');
  }
  if (!isValidAddress(from)) {
    throw new Error('from must be a valid hex address.');
  }
  if (to && !isValidAddress(to)) {
    throw new Error('to must be a valid hex address.');
  }
  if (contract && !isValidAddress(contract)) {
    throw new Error('contract must be a valid hex address.');
  }
  if (payload.nonce !== undefined) {
    if (typeof payload.nonce !== 'number' || !Number.isFinite(payload.nonce) || payload.nonce < 0) {
      throw new Error('nonce must be a non-negative number when provided.');
    }
  }
  if (payload.value !== undefined && typeof payload.value !== 'string') {
    throw new Error('value must be a string representing ETH.');
  }
  if (payload.data && !HEX_DATA_REGEX.test(payload.data)) {
    throw new Error('data must be a hex string.');
  }
  if (payload.gasPrice && typeof payload.gasPrice !== 'string') {
    throw new Error('gas-price must be a string representing wei.');
  }
  payload.network = network;
  payload.from = from;
  if (to) payload.to = to;
  if (contract) payload.contract = contract;
}

function normalizeAddress(value?: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidAddress(value: string): boolean {
  return ADDRESS_REGEX.test(value);
}

function respondError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}
