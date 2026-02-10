You are working in a new repo to build a SMALL but REALISTIC “agent-friendly” Ethereum wallet CLI called AgentWallet.

Goal
- Create a Node.js (TypeScript) project that provides a command-line wallet interface designed for AI agents.
- The implementation can be mostly mocked (no need to implement real blockchain signing or real WalletConnect), but the CLI/daemon architecture, stable command set, JSON output, exit codes, and docs must be real and consistent.

Key Design Requirements
1) Script-friendly CLI
- Every feature is controlled by flags/subcommands (no interactive UI).
- Support --json for machine-readable output on ALL commands.
- stdin/stdout/stderr are used correctly.
- Clear exit codes: 0 success, 1 runtime error, 2 invalid arguments.

2) Daemon + Client architecture (single binary/entry)
- The program has two modes:
  - Daemon/server mode: runs an HTTP server on 127.0.0.1:6756 when started with --daemon.
  - Client/CLI mode: default mode; runs one-shot commands by calling the daemon over HTTP.
- Auto-start behavior:
  - If the daemon is NOT listening on localhost:6756, any client command should auto-start it (equivalent to launching "agentwallet --daemon" in the background), then retry the command after healthcheck succeeds.

3) Configuration
- Support a config file (default: ./wallet.conf.json unless overridden by --config).
- Config contains networks: list of { name, rpcUrl }.
- Network names MUST be EIP-155 style, e.g. "eip155:1", "eip155:11155111".
- The networks command returns the configured networks.

4) Features to implement (OK to mock data)
Client commands (all work via daemon):
A. agentwallet version
B. agentwallet build-info   (platform, node version, build time, git commit if available)
C. agentwallet networks     (from config)
D. agentwallet account list (return list of wallet addresses + supported networks; may be mocked)
E. agentwallet balance --address <0x...> --network <eip155:...>
   - can be mocked; just return deterministic fake values, but validate inputs
F. agentwallet send --network <eip155:...> --from <0x...> [--to <0x...>] [--nonce N] [--contract <0x...>] [--value <eth>] [--data <0x...>] [--gas-price <wei>]
   - Return a unique GUID string.
   - Store tx state in memory in daemon keyed by guid.
G. agentwallet tx status --guid <guid>
   - Return status for that guid (e.g., PENDING -> CONFIRMED after some time, or always PENDING is fine, but deterministic).
H. WalletConnect session management (mock)
   - agentwallet wc status
   - agentwallet wc connect --network <eip155:...> --address <0x...> --uri "wc:..."
   - agentwallet wc switch --session <id> [--address <0x...>] [--network <eip155:...>]
   - agentwallet wc disconnect --session <id>
   - Store sessions in memory in daemon.

5) HTTP API (daemon)
Implement an internal HTTP JSON API on 127.0.0.1:6756, at least:
- GET  /health
- GET  /version
- GET  /build-info
- GET  /networks
- GET  /accounts
- GET  /balance?address=...&network=...
- POST /tx/send
- GET  /tx/status?guid=...
- GET  /wc/sessions
- POST /wc/connect
- POST /wc/switch
- POST /wc/disconnect

6) Output format
When --json is enabled, output an envelope on stdout:
{
  "success": true,
  "data": {...},
  "error": null
}
On error:
{
  "success": false,
  "data": null,
  "error": { "code": "INVALID_ARGS" | "RUNTIME_ERROR", "message": "..." }
}
In non-json mode, output a human-friendly summary.

7) Documentation deliverables
- Write an English README.md explaining:
  - what AgentWallet is, why it’s agent-friendly
  - install/run instructions
  - daemon auto-start behavior
  - command list with examples
  - JSON output examples
  - exit codes
  - config file format and defaults
- Create assets/skill.md:
  - concise “tool manual for AI agents”
  - include: how to install, how to run, essential commands, JSON schema, pitfalls
  - emphasize: always use --json for automation and check exit codes

8) Project scaffolding
- Use TypeScript.
- Use a standard CLI library (commander or yargs).
- Use a lightweight HTTP framework (fastify or express).
- Provide npm scripts:
  - npm run build
  - npm run start (CLI)
  - npm run daemon (start server)
  - npm test (optional)
- Include minimal, helpful comments in code (English), not too many.

9) Acceptance tests (manual)
After implementation, these should work:
- agentwallet version
- agentwallet build-info
- agentwallet networks
- agentwallet account list
- agentwallet balance --address 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --network eip155:1
- agentwallet send --network eip155:1 --from 0x1111111111111111111111111111111111111111 --to 0x2222222222222222222222222222222222222222 --value 0.01
- agentwallet tx status --guid <printed-guid>
- agentwallet wc connect --network eip155:1 --address 0x111... --uri "wc:example"
- agentwallet wc status
- agentwallet wc disconnect --session <id>

Work Plan (do this in order)
1) Scaffold repo (package.json, tsconfig, src layout).
2) Implement daemon server + in-memory stores + /health.
3) Implement CLI root + ensureDaemon() + one command (version) end-to-end.
4) Add remaining commands incrementally, keeping JSON stable.
5) Write README.md + assets/skill.md + sample wallet.conf.json.
6) Run the manual acceptance commands and fix any issues.

Important Constraints
- Do not implement real chain signing or real WalletConnect. Mock is acceptable.
- Focus on CLI stability, documentation clarity, and daemon/client behavior.
- Avoid interactive prompts; everything must be flags/subcommands.
- Keep changes minimal and clean, with readable code.

Now implement the repo accordingly.
