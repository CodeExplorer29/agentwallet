# AgentWallet

AgentWallet is a small but realistic Ethereum wallet command-line interface that is tailored for automation. It ships as a single Node.js binary that can run as a daemon (**`agentwallet --daemon`**) or as a client CLI that proxies all commands to the daemon over HTTP. All commands support deterministic JSON envelopes (`--json`) and clean exit codes so AI agents and shell scripts can rely on it.

## Why agent-friendly?
- **Strict flag-based CLI** – every action is exposed via subcommands and options. No prompts.
- **Daemon auto-start** – client commands will transparently launch the local daemon on `127.0.0.1:6756` if it is not running.
- **Structured responses** – opt into JSON envelopes with `--json` and inspect exit codes (`0` success, `1` runtime error, `2` invalid arguments).
- **Deterministic mocks** – balances, transactions, and WalletConnect sessions are mocked but stable, so stateful scripts can be written without a live chain.

## Installation
```bash
npm install
npm run build
npm link   # optional, exposes the `agentwallet` binary in your PATH
```

You need Node.js 18+.

## Configuration
AgentWallet reads a configuration file that lists EIP-155 networks. The default path is `./wallet.conf.json`, but you can override it with `--config <path>` in both daemon and client modes.

Example `wallet.conf.json`:
```json
{
  "networks": [
    { "name": "eip155:1", "rpcUrl": "https://mainnet.rpc.agentwallet.local" },
    { "name": "eip155:11155111", "rpcUrl": "https://sepolia.rpc.agentwallet.local" }
  ]
}
```
Each `name` must follow `eip155:<chainId>` and `rpcUrl` can point to any mock or real RPC endpoint.

## Running the daemon
```bash
# start foreground daemon
agentwallet --daemon [--config wallet.conf.json]

# or during development
npm run daemon
```
The daemon exposes:
- `GET /health`
- `GET /version`
- `GET /build-info`
- `GET /networks`
- `GET /accounts`
- `GET /balance?address=...&network=...`
- `POST /tx/send`
- `GET /tx/status?guid=...`
- `GET /wc/sessions`
- `POST /wc/connect`
- `POST /wc/switch`
- `POST /wc/disconnect`

## Auto-start behavior
When you run any CLI command (e.g., `agentwallet networks`), the client checks `http://127.0.0.1:6756/health`. If no daemon is listening, the CLI spawns `agentwallet --daemon --config <path>` in the background, waits for the `/health` endpoint to respond, then retries the pending command.

## Command guide
Always add `--json` when scripting to receive the envelope:
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```
On error:
```json
{
  "success": false,
  "data": null,
  "error": { "code": "INVALID_ARGS" | "RUNTIME_ERROR", "message": "..." }
}
```

Selected commands (all accept `--json` and `--config <file>`):

| Command | Description | Example |
| --- | --- | --- |
| `agentwallet version` | Print daemon version. | `agentwallet version --json` |
| `agentwallet build-info` | Platform, Node.js version, build timestamp, git commit. | `agentwallet build-info` |
| `agentwallet networks` | List configured networks from the config file. | `agentwallet networks --json` |
| `agentwallet account list` | List mocked wallet accounts. | `agentwallet account list` |
| `agentwallet balance --address <0x...> --network <eip155:...>` | Return deterministic mock balance. | `agentwallet balance --address 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --network eip155:1` |
| `agentwallet send --network <...> --from <0x...> [--to <0x...>] [...options]` | Queue a mocked transaction and return a GUID. | `agentwallet send --network eip155:1 --from 0x111... --to 0x222... --value 0.01` |
| `agentwallet tx status --guid <guid>` | Inspect mocked transaction status. | `agentwallet tx status --guid 1234-...` |
| `agentwallet wc status` | List WalletConnect sessions. | `agentwallet wc status --json` |
| `agentwallet wc connect --network <...> --address <0x...> --uri wc:...` | Create a mock WalletConnect session. | `agentwallet wc connect --network eip155:1 --address 0x111... --uri wc:example` |
| `agentwallet wc switch --session <id> [--address ...] [--network ...]` | Update a session. | `agentwallet wc switch --session <id> --network eip155:11155111` |
| `agentwallet wc disconnect --session <id>` | Mark a session as disconnected. | `agentwallet wc disconnect --session <id>` |

### Exit codes
- `0` – success
- `1` – runtime/server error (e.g., daemon unavailable, unexpected failure)
- `2` – invalid usage or validation error (missing flags, malformed address, unknown network)

## Example workflow
```bash
agentwallet version
agentwallet networks --json
agentwallet balance --address 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --network eip155:1 --json
GUID=$(agentwallet send --network eip155:1 --from 0x111... --to 0x222... --value 0.01 --json | jq -r '.data.guid')
agentwallet tx status --guid "$GUID"
```
All commands work even if the daemon is not running; the CLI will auto-start it using the same `--config` file.

## Development scripts
- `npm run build` – compile TypeScript to `dist/`
- `npm run start` – build and run the CLI entry point (client mode)
- `npm run daemon` – build and run the daemon directly
- `npm test` – placeholder

PRs or experiments should keep JSON output stable and avoid interactive prompts so AgentWallet remains scriptable.
