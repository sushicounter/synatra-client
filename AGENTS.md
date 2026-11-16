# AGENTS.md

Guide for AI agents working on or with `synatra-client`, the JavaScript SDK for the Synatra
staking program on Solana. Humans are welcome too.

## What this is

One ES module, `SynatraClient.js`, plus the program IDL `synatra-idl.json`. It wraps the
mainnet program `synatfE5AvWtbDT9sSvDsF9gmeqR9qeq3FA84bhxWur` (IDL v2.1.0, which exposes only the
public instructions `stake_sol`, `stake_token` and `unstake`).

- App: https://app.synatra.xyz
- Docs: https://docs.synatra.xyz
- API: https://api.synatra.xyz (used by `getClaims`)

## Pools

| Pool id | Deposit | Receipt token | Base units |
| --- | --- | --- | --- |
| 0 | SOL | ySOL | lamports (1 SOL = 1e9) |
| 1 | USDC | yUSD | 6 decimals |

All amounts passed to the client are integers in base units, never decimals. Read a receipt
token's decimals from its mint (`getMint`) rather than assuming them.

Rates are integers scaled by 100000, per the program source:

- stake: `receipt = amount * 100000 / stakeRate`
- unstake: `owed = receiptAmount * unstakeRate / 100000`

The unstake rate is what a holder redeems at. It generally rises over time but can fall.

## API

| Method | Sends a transaction | What it does |
| --- | --- | --- |
| `new SynatraClient(rpcUrl, keypair?, apiUrl?, priorityFee?, logging?)` | no | Sets up the connection and program |
| `setWallet(wallet)` | no | Uses a wallet adapter for signing |
| `setPriorityFee(microLamports)` | no | Compute unit price for later transactions |
| `getPool(poolId)` | no | Pool account, or `null` if not found |
| `getCurrentSupply(poolId)` | no | Receipt token supply in base units |
| `getClaims()` | no | The wallet's unstake claims from the Synatra API |
| `stake(poolId, amount)` | **yes** | Deposits SOL or USDC, mints ySOL or yUSD |
| `unstake(poolId, receiptAmount)` | **yes** | Burns receipt tokens and opens a claim |

An unstake does not pay out at once. It creates a claim record; the protocol later fulfills it
and sends the owed SOL or USDC straight to the wallet. In `getClaims()` results, `fulfilled`
means it has been paid.

## Skills

Task guides live in `.claude/skills/`. Any agent can read them as plain Markdown.

- [stake](.claude/skills/stake/SKILL.md): deposit SOL or USDC for ySOL or yUSD.
- [unstake](.claude/skills/unstake/SKILL.md): redeem ySOL or yUSD into a claim.
- [check-position](.claude/skills/check-position/SKILL.md): receipt balance, its value and open
  claims.
- [pool-info](.claude/skills/pool-info/SKILL.md): rates, supply and cap for each pool.
- [devnet-testing](.claude/skills/devnet-testing/SKILL.md): run the integration tests on devnet
  with a throwaway wallet.

## Safety rules

These apply to every agent, every time.

1. **Never sign or send a transaction without the user's explicit confirmation** of the network,
   the pool, the amount in human units and in base units, and the wallet. Read-only calls need no
   confirmation.
2. **Never handle private keys.** Do not ask for, read, print, log, paste, copy or commit a secret
   key, seed phrase or keypair file. Prefer a wallet adapter (`setWallet`) that signs on the
   user's side. If code needs a keypair, load it from a path the user gives and never echo it.
3. **Devnet by default.** Use mainnet only when the user asks for mainnet in so many words.
4. **Numbers come from the chain or the API.** Never guess or hardcode rates, APYs, balances,
   supply or withdrawal times. Say where a number came from and when you read it.
5. **No new claims.** Do not describe audits, fees, signers or withdrawal times beyond what the
   docs at https://docs.synatra.xyz say.
6. **Keep secrets out of git.** `.gitignore` covers `.env*`, `*.keypair`, `*.key` and
   `devnet-wallet.json`; keep any keypair you create outside the repo.

## Develop

```bash
npm install
npm test                          # Jest unit tests
node test/devnet-integration.js   # devnet integration tests, see the devnet-testing skill
```

- Node 20.10 or newer (the client imports JSON with `with { type: 'json' }`).
- Six unit tests read mainnet through `https://api.mainnet-beta.solana.com` and time out where
  that RPC is unreachable; the other ten run offline.
- `package.json` `files` publishes only `SynatraClient.js`, `synatra-idl.json` and `README.md`.
- Publishing to npm and merging to `main` wait for the maintainer, counter.
- Work on a branch and open a pull request. Add or update tests with any behaviour change.
