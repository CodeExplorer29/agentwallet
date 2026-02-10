---
title: AgentWallet Unified Skill
description: Complete guide to operating the AgentWallet CLI/daemon for wallets, transactions, and WalletConnect flows.
when_to_use:
  - "Need to query AgentWallet version/build info/networks/accounts/balances"
  - "Need to submit mocked transactions and track their status"
  - "Need to list/connect/switch/disconnect WalletConnect sessions"
---

## 1. Skill Overview
AgentWallet is a Node.js CLI that auto-starts a daemon on `http://127.0.0.1:6756`. Every CLI command supports `--json` and returns a consistent envelope so agents can parse responses deterministically. Use this unified skill whenever a workflow requires interacting with AgentWallet state via CLI or direct HTTP calls.

## 2. Capabilities & Commands
Global flags: `--json` for machine output, `--config <path>` to override `wallet.conf.json`. Exit codes: `0` success, `1` runtime error, `2` invalid args.

| Command | Description | Required Flags | Optional Flags | CLI Example | Sample JSON Output |
| --- | --- | --- | --- | --- | --- |
| `agentwallet version` | Show daemon version. | none | `--json` | `agentwallet version --json` | `{ "success": true, "data": { "version": "0.1.0" }, "error": null }` |
| `agentwallet build-info` | Platform, node version, build time, git commit. | none | `--json` | `agentwallet build-info --json` | Contains `platform`, `node`, `buildTime`, `gitCommit?` |
| `agentwallet networks` | Networks from config. | none | `--json` | `agentwallet networks --json` | `data.networks` array of `{ name, rpcUrl }` |
| `agentwallet account list` | Mocked accounts + supported networks. | none | `--json` | `agentwallet account list --json` | `data.accounts` array |
| `agentwallet balance` | Deterministic balance lookup. | `--address <0x...>`, `--network <eip155:id>` | `--json` | `agentwallet balance --address 0xd8dA... --network eip155:1 --json` | `data` object with `balanceEth`, `updatedAt` |
| `agentwallet send` | Submit mocked tx, returns GUID. | `--network`, `--from` | `--to`, `--contract`, `--nonce`, `--value`, `--data`, `--gas-price`, `--json` | `agentwallet send --network eip155:1 --from 0x111... --to 0x222... --value 0.01 --json` | `data` includes `guid`, initial `status"PENDING"` |
| `agentwallet tx status` | Check tx status by GUID. | `--guid <uuid>` | `--json` | `agentwallet tx status --guid <GUID> --json` | `data` includes `status` (`PENDING`, `CONFIRMED`, `UNKNOWN`) |
| `agentwallet wc status` | List WalletConnect sessions. | none | `--json` | `agentwallet wc status --json` | `data.sessions` array |
| `agentwallet wc connect` | Create WC session. | `--network`, `--address`, `--uri`, `uri` must start `wc:` | `--json` | `agentwallet wc connect --network eip155:1 --address 0x111... --uri wc:example --json` | `data` contains session object |
| `agentwallet wc switch` | Update session network/address. | `--session <id>` | `--address`, `--network`, `--json` | `agentwallet wc switch --session <id> --network eip155:11155111 --json` | Updated session JSON |
| `agentwallet wc disconnect` | Mark session disconnected. | `--session <id>` | `--json` | `agentwallet wc disconnect --session <id> --json` | Session with `status: "DISCONNECTED"` |

## 3. HTTP API Reference
Prefer CLI for auto-start and envelope. Use HTTP only when operating inside tooling that sends HTTP requests directly.

| Method & Path | Purpose | Params | Response |
| --- | --- | --- | --- |
| `GET /health` | Check daemon availability. | none | `{ "status": "ok", "uptimeSec": 5 }` |
| `GET /version` | Version info. | none | `{ "version": "0.1.0" }` |
| `GET /build-info` | Build metadata. | none | `{ "version": "0.1.0", "platform": "darwin arm64", ... }` |
| `GET /networks` | Network config. | none | `{ "networks": [ { "name": "eip155:1", "rpcUrl": "..." }, ... ] }` |
| `GET /accounts` | Account list. | none | `{ "accounts": [ { "label": "Agent Primary", "address": "0x111...", "networks": ["eip155:1", ...] } ] }` |
| `GET /balance` | Balance lookup. | Query: `address`, `network` | `{ "address": "0x...", "network": "eip155:1", "balanceEth": "193.139000", "updatedAt": "ISO" }` |
| `POST /tx/send` | Submit tx. | Body matches CLI flags. | `{ "guid": "...", "status": "PENDING" }` |
| `GET /tx/status` | Tx status by GUID. | Query: `guid` | `{ "guid": "...", "status": "PENDING"|"CONFIRMED"|"UNKNOWN", "updatedAt": "ISO" }` |
| `GET /wc/sessions` | List sessions. | none | `{ "sessions": [ WalletConnectSession ] }` |
| `POST /wc/connect` | Create session. | `{ network, address, uri }` (`uri` must start `wc:`) | `WalletConnectSession` |
| `POST /wc/switch` | Update session. | `{ session, address?, network? }` | `WalletConnectSession` |
| `POST /wc/disconnect` | Disconnect session. | `{ session }` | `WalletConnectSession` (status becomes `DISCONNECTED`) |

## 4. Examples & Recipes
### 4.1 Check Balance
- Natural prompt: "What’s the mainnet balance for 0xd8dA…6045?"
- Command: `agentwallet balance --address 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --network eip155:1 --json`
- Parse `data.balanceEth`.

### 4.2 Send Transaction & Track Status
1. `agentwallet send --network eip155:1 --from 0x1111111111111111111111111111111111111111 --to 0x2222222222222222222222222222222222222222 --value 0.01 --json`
2. Store `GUID=$(jq -r '.data.guid')`.
3. Poll `agentwallet tx status --guid "$GUID" --json` until `data.status` is `CONFIRMED` (approx 5s).

### 4.3 List WalletConnect Sessions
- `agentwallet wc status --json` → enumerate `data.sessions`.

### 4.4 Connect and Disconnect a Session
1. `agentwallet wc connect --network eip155:1 --address 0x111... --uri wc:example --json` → capture `sessionId`.
2. Optional switch: `agentwallet wc switch --session $sessionId --network eip155:11155111 --json`.
3. Disconnect: `agentwallet wc disconnect --session $sessionId --json`.

### 4.5 Mapping Natural Queries to Commands
| Query | Translation |
| --- | --- |
| "List supported networks" | `agentwallet networks --json` |
| "Show all wallet addresses" | `agentwallet account list --json` |
| "Ping the agentwallet daemon" | `curl http://127.0.0.1:6756/health` (or rely on CLI auto-start) |
| "Submit tx with payload 0xdead" | `agentwallet send --network eip155:<id> --from <address> --data 0xdead --json` |

## 5. Best Practices
- **Always** add `--json` for automation; inspect `success` before trusting `data`.
- The CLI auto-starts `agentwallet --daemon` if `/health` fails, so you typically don’t need manual daemon management. For HTTP-only workflows, ensure the daemon is running first.
- Exit codes: `0` success, `2` invalid arguments (bad address/network, missing flags), `1` runtime errors (daemon unreachable, internal failure).
- Persist GUIDs and WalletConnect session IDs externally if you restart the daemon; in-memory state is lost on restart.
- Validate addresses (`0x` + 40 hex) and networks (`eip155:<id>`) before calling commands to avoid exit code `2`.
- For repeated polling (e.g., `tx status`), add delays (~2–3 seconds) to give the daemon time to mark transactions `CONFIRMED`.

## 6. Machine-readable Schemas
```json
// Generic CLI envelope
{
  "type": "object",
  "required": ["success", "data", "error"],
  "properties": {
    "success": { "type": "boolean" },
    "data": { "type": ["object", "array", "null"] },
    "error": {
      "type": ["object", "null"],
      "properties": {
        "code": { "type": "string", "enum": ["INVALID_ARGS", "RUNTIME_ERROR"] },
        "message": { "type": "string" }
      }
    }
  }
}

// Network object
{
  "type": "object",
  "required": ["name", "rpcUrl"],
  "properties": {
    "name": { "type": "string", "pattern": "^eip155:\\d+$" },
    "rpcUrl": { "type": "string" }
  }
}

// Account object
{
  "type": "object",
  "required": ["label", "address", "networks"],
  "properties": {
    "label": { "type": "string" },
    "address": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
    "networks": { "type": "array", "items": { "type": "string", "pattern": "^eip155:\\d+$" } }
  }
}

// Balance result
{
  "type": "object",
  "required": ["address", "network", "balanceEth", "updatedAt"],
  "properties": {
    "address": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
    "network": { "type": "string", "pattern": "^eip155:\\d+$" },
    "balanceEth": { "type": "string" },
    "updatedAt": { "type": "string", "format": "date-time" }
  }
}

// Transaction request
{
  "type": "object",
  "required": ["network", "from"],
  "properties": {
    "network": { "type": "string", "pattern": "^eip155:\\d+$" },
    "from": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
    "to": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
    "contract": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
    "nonce": { "type": "number", "minimum": 0 },
    "value": { "type": "string" },
    "data": { "type": "string", "pattern": "^0x[a-fA-F0-9]*$" },
    "gasPrice": { "type": "string" }
  }
}

// Transaction status
{
  "type": "object",
  "required": ["guid", "status", "updatedAt"],
  "properties": {
    "guid": { "type": "string", "format": "uuid" },
    "status": { "type": "string", "enum": ["PENDING", "CONFIRMED", "UNKNOWN"] },
    "updatedAt": { "type": "string", "format": "date-time" }
  }
}

// WalletConnect session
{
  "type": "object",
  "required": ["id", "address", "network", "uri", "status", "connectedAt"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "address": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
    "network": { "type": "string", "pattern": "^eip155:\\d+$" },
    "uri": { "type": "string", "pattern": "^wc:.+" },
    "status": { "type": "string", "enum": ["CONNECTED", "DISCONNECTED"] },
    "connectedAt": { "type": "string", "format": "date-time" }
  }
}
```
