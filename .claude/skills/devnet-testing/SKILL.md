---
name: devnet-testing
description: Run synatra-client's integration tests against the Synatra devnet program with a throwaway wallet. Use when changing stake, unstake or claim code, or when asked to test the client on devnet.
---

# Devnet testing

`test/devnet-integration.js` runs real `getPool`, `getCurrentSupply`, `stake`, `unstake` and
validation calls against the devnet program `G2HTbxYa9XpiZviwnjtTrPCpfRxT8c6L9BvvJFo59ESx`.

## Wallet

Use a throwaway devnet keypair you create for the run. Never use an admin, deployer or mainnet
wallet, and never ask anyone for one.

```bash
solana-keygen new --no-bip39-passphrase --silent -o /tmp/synatra-devnet-test.json
solana airdrop 2 "$(solana-keygen pubkey /tmp/synatra-devnet-test.json)" --url devnet
SYNATRA_DEVNET_KEYPAIR=/tmp/synatra-devnet-test.json node test/devnet-integration.js
```

- Keep the keypair outside the repo, never print its contents, and delete it when done.
- Without the Solana CLI, create it with `Keypair.generate()` and write `Array.from(secretKey)`
  to the file. Fund it from a devnet faucet; airdrops are rate limited.
- The script reads the keypair from `SYNATRA_DEVNET_KEYPAIR` and stops if it is unset.

## Notes

- The client hardcodes the mainnet program address. The script overrides `programPublicKey` for
  PDA derivation, but `synatra-idl.json` carries the mainnet address too. If transactions fail
  with a program-not-found error on devnet, that mismatch is the likely cause; report it rather
  than editing the IDL.
- The USDC pool test expects an insufficient balance on a fresh wallet. That is a pass.
- Run `npm test` too. Six of its tests read mainnet and need a reachable mainnet RPC.
