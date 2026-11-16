---
name: stake
description: Deposit SOL or USDC into Synatra with synatra-client to get ySOL or yUSD. Use when a user asks to stake, deposit or buy ySOL or yUSD.
---

# Stake SOL or USDC

Sends a transaction. Read the safety rules in `AGENTS.md` first.

## Steps

1. **Pick the pool.** Pool 0 takes SOL and mints ySOL. Pool 1 takes USDC and mints yUSD.
2. **Pick the network.** Devnet unless the user asked for mainnet.
3. **Convert to base units.** SOL: `Math.round(sol * 1e9)` lamports. USDC: `Math.round(usdc * 1e6)`.
   Pass an integer.
4. **Read the pool** with `getPool(poolId)`. Stop if it returns `null`.
5. **Preview.** Expected receipt is `amount * 100000 / pool.stakeRate` (integer division).
   Check `getCurrentSupply(poolId) + receipt <= pool.receiptMaxSupply`, or the deposit hits the cap.
6. **Check the balance.** For SOL leave room on top of the amount for fees and the rent of
   a new receipt token account.
7. **Ask the user to confirm** network, pool, amount (human and base units), expected receipt,
   wallet address and priority fee. Do not go on without a clear yes.
8. **Send** `await client.stake(poolId, amount)` and report the signature.
9. **Verify** the receipt token balance went up.

```js
import { SynatraClient } from 'synatra-client'

const client = new SynatraClient(rpcUrl, null)
client.setWallet(wallet) // wallet adapter; the user signs
const pool = await client.getPool(0)
const lamports = Math.round(0.5 * 1e9)
const expectedReceipt = Math.floor((lamports * 100000) / pool.stakeRate)
// show the preview, get the user's yes, then:
const signature = await client.stake(0, lamports)
```

## Errors

- `No wallet set`: call `setWallet` or pass a keypair.
- `Pool not found`: wrong pool id or wrong network.
- `Insufficient SOL balance`, `Token account not found or insufficient balance`: not enough to
  deposit. Never retry with a different amount without asking.
