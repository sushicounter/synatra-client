---
name: unstake
description: Redeem ySOL or yUSD with synatra-client, which burns the receipt tokens and opens a claim. Use when a user asks to unstake, redeem, withdraw or sell ySOL or yUSD.
---

# Unstake ySOL or yUSD

Sends a transaction. Read the safety rules in `AGENTS.md` first.

An unstake is not an instant swap. It burns the receipt tokens now and records a claim at the
current unstake rate. The protocol fulfills the claim later and sends SOL or USDC to the wallet.
Tell the user this before they confirm. Do not promise a payout time.

## Steps

1. **Pick the pool.** Pool 0 burns ySOL for SOL. Pool 1 burns yUSD for USDC.
2. **Pick the network.** Devnet unless the user asked for mainnet.
3. **Read the receipt balance** of the wallet's associated token account for `pool.receiptToken`,
   and the decimals from the mint. Amounts are integers in base units.
4. **Preview.** Owed is `receiptAmount * pool.unstakeRate / 100000` (integer division), in
   lamports or USDC base units.
5. **Ask the user to confirm** network, pool, receipt amount (human and base units), expected
   owed amount, wallet address and that the payout comes later. Do not go on without a clear yes.
6. **Send** `await client.unstake(poolId, receiptAmount)` and report the signature.
7. **Show the claim** with `getClaims()` (see the check-position skill).

```js
const pool = await client.getPool(1)
const receiptAmount = 50 * 1e6 // 50 yUSD
const owed = Math.floor((receiptAmount * pool.unstakeRate) / 100000)
// show the preview, get the user's yes, then:
const signature = await client.unstake(1, receiptAmount)
```

## Notes

- The claim record address comes from the pool's `nonce` at send time. If another unstake lands
  first the transaction can fail; read the pool again and ask before retrying.
- The rate is fixed into the claim when it is created.
