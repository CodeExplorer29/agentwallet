export interface NetworkConfig {
  name: string; // eip155: chain id
  rpcUrl: string;
}

export interface WalletConfig {
  networks: NetworkConfig[];
}

export interface AccountRecord {
  address: string;
  label: string;
  networks: string[];
}

export interface BalanceResult {
  address: string;
  network: string;
  balanceEth: string;
  updatedAt: string;
}

export interface TxSendRequest {
  network: string;
  from: string;
  to?: string;
  contract?: string;
  nonce?: number;
  value?: string;
  data?: string;
  gasPrice?: string;
}

export interface TxRecord extends TxSendRequest {
  guid: string;
  status: 'PENDING' | 'CONFIRMED';
  createdAt: number; // unix ms
}

export interface TxStatusResponse {
  guid: string;
  status: 'PENDING' | 'CONFIRMED' | 'UNKNOWN';
  updatedAt: string;
}

export interface WalletConnectSession {
  id: string;
  address: string;
  network: string;
  uri: string;
  status: 'CONNECTED' | 'DISCONNECTED';
  connectedAt: string;
}

export interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: 'INVALID_ARGS' | 'RUNTIME_ERROR'; message: string } | null;
}
