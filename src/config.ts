import fs from 'fs';
import path from 'path';
import { NetworkConfig, WalletConfig } from './types';

export const DEFAULT_CONFIG_FILENAME = 'wallet.conf.json';

const DEFAULT_CONFIG: WalletConfig = {
  networks: [
    { name: 'eip155:1', rpcUrl: 'https://rpc.ankr.com/eth' },
    { name: 'eip155:11155111', rpcUrl: 'https://rpc.ankr.com/eth_sepolia' }
  ]
};

const NETWORK_NAME_PATTERN = /^eip155:\d+$/i;

export function resolveConfigPath(configPath?: string): string {
  const target = configPath?.trim().length ? configPath : DEFAULT_CONFIG_FILENAME;
  return path.resolve(process.cwd(), target);
}

export function loadConfig(configPath: string): WalletConfig {
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse config at ${configPath}: ${(err as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as any).networks)) {
    throw new Error('Config file must contain a "networks" array.');
  }

  const networks: NetworkConfig[] = (parsed as any).networks.map((net: any) => {
    if (!net || typeof net !== 'object') {
      throw new Error('Network entries must be objects.');
    }
    const name = String(net.name ?? '').trim();
    const rpcUrl = String(net.rpcUrl ?? '').trim();
    if (!NETWORK_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid network name "${name}". Expected EIP-155 format like eip155:1.`);
    }
    if (!rpcUrl) {
      throw new Error(`Network ${name} must include rpcUrl.`);
    }
    return { name, rpcUrl };
  });

  return { networks };
}

export function listNetworkNames(config: WalletConfig): string[] {
  return config.networks.map((n) => n.name);
}
