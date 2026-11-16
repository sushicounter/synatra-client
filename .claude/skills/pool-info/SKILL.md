---
name: pool-info
description: Read Synatra pool data with synatra-client, the stake and unstake rates, receipt supply, supply cap and token mints for the SOL and USDC pools. Read only. Use when a user asks about rates, capacity or pool addresses.
---

# Pool info

Read only. No wallet needed.

```js
import { SynatraClient } from 'synatra-client'

const client = new SynatraClient(rpcUrl, null)
for (const poolId of [0, 1]) {
  const pool = await client.getPool(poolId)
  if (!pool) continue
  const supply = await client.getCurrentSupply(poolId)
  console.log({
    poolId,
    stakeToken: pool.stakeToken.toBase58(),
    receiptToken: pool.receiptToken.toBase58(),
    stakeRate: pool.stakeRate / 100000, // underlying per receipt token, to deposit
    unstakeRate: pool.unstakeRate / 100000, // underlying per receipt token, to redeem
    supply,
    cap: pool.receiptMaxSupply,
    room: pool.receiptMaxSupply - supply,
  })
}
```

## Reading it

- Rates are integers scaled by 100000. Divide to show them.
- The unstake rate is what a holder gets back. The program keeps it between 90% and 100% of the
  stake rate.
- Supply and cap are receipt token base units. Divide by the mint's decimals to show them.
- For APY, TVL and rate history use the Synatra API or https://app.synatra.xyz. Do not compute or
  quote APY from a single rate reading.
- Say which network and when you read the numbers.
