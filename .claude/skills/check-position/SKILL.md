---
name: check-position
description: Read a wallet's Synatra position with synatra-client, its ySOL and yUSD balances, what they redeem for at the current unstake rate, and its unstake claims. Read only. Use when a user asks what they hold, what it is worth or where a withdrawal stands.
---

# Check a position

Read only. No confirmation needed, and no keypair needed: the address is enough.

## Steps

1. Build a client with no keypair and the user's public key:

```js
import { SynatraClient } from 'synatra-client'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, getMint } from '@solana/spl-token'

const client = new SynatraClient(rpcUrl, null)
const owner = new PublicKey(address)
client.userPublicKey = owner // read-only; getClaims needs it
```

2. For each pool (0 and 1):

```js
const pool = await client.getPool(poolId)
const ata = getAssociatedTokenAddressSync(pool.receiptToken, owner)
const mint = await getMint(client.connection, pool.receiptToken)
let balance = 0
try {
  balance = Number((await client.connection.getTokenAccountBalance(ata)).value.amount)
} catch {
  // no token account means no balance
}
const redeemable = Math.floor((balance * pool.unstakeRate) / 100000)
```

   Show `balance / 10 ** mint.decimals` and the redeemable amount in SOL or USDC.

3. Claims: `await client.getClaims()`. Report each with pool, receipt amount, owed amount
   (`claimAmount`), unstake date and whether it is `fulfilled` (paid). Group open ones first.

## Report

- Say the network and when you read it. Values move with the rate.
- Use the unstake rate for value, never the stake rate.
- Do not estimate when an open claim will be paid.
