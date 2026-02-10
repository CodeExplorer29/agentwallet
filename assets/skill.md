# AgentWallet Skill Card

Use AgentWallet to script mocked Ethereum wallet flows with deterministic responses. Always pass `--json` in automation and enforce exit codes (`0` success, `1` runtime error, `2` invalid args).

## Install & Build
```bash
npm install
npm run build
npm link   # optional; exposes the agentwallet binary
```
Requires Node.js 18+. Keep `wallet.conf.json` next to your scripts or provide `--config /path/to/file`.

## Run Modes
- **Daemon:** `agentwallet --daemon [--config wallet.conf.json]` launches an HTTP server on `127.0.0.1:6756`.
- **Client (default):** any command (e.g., `agentwallet networks`) contacts the daemon. If the daemon is missing, the CLI auto-starts it using the same `--config` path.

## Essential Commands (always add `--json`)
- `agentwallet version --json`
- `agentwallet build-info --json`
- `agentwallet networks --json`
- `agentwallet account list --json`
- `agentwallet balance --address <0x...> --network eip155:<id> --json`
- `agentwallet send --network <...> --from <0x...> [--to <0x...>] [--value <eth>] --json`
- `agentwallet tx status --guid <guid> --json`
- `agentwallet wc status|connect|switch|disconnect ... --json`

## JSON Envelope
Every command returns:
```json
{
  "success": true|false,
  "data": { ... } | null,
  "error": null | { "code": "INVALID_ARGS"|"RUNTIME_ERROR", "message": "..." }
}
```
Validate `success` and branch on `error.code`. Values are mocked but deterministic.

## Pitfalls
- Network names MUST be `eip155:<chainId>`; validation errors exit with code `2`.
- Addresses must be 0x-prefixed, 40-hex strings.
- WalletConnect URIs must start with `wc:`.
- Balances, transactions, and sessions exist only in daemon memory; restarting the daemon clears state.
- Daemon auto-start waits ~8s; handle failures by retrying and inspecting `success` / exit code.
- When sharing scripts, bundle a `wallet.conf.json` or pass `--config` explicitly to keep environments deterministic.
