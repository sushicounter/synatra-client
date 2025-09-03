# Synatra Client SDK

A JavaScript client for interacting with the Synatra staking program on Solana.

## Features

- Stake SOL → get ySOL receipt tokens
- Stake USDC → get yUSD receipt tokens
- Unstake receipt tokens to get original assets back
- Full TypeScript support via JSDoc annotations
- Priority fee management
- Comprehensive error handling

## Installation

```bash
npm install synatra-client
```

## Quick Start

```javascript
import { SynatraClient } from "synatra-client";
import { Keypair } from "@solana/web3.js";

// Create or load your keypair
const keypair = Keypair.generate(); // or Keypair.fromSecretKey(secretKey)

// Initialize client
const client = new SynatraClient(
  "https://api.mainnet-beta.solana.com", // RPC URL
  keypair, // user keypair
  "https://api.synatra.xyz", // optional Synatra API URL (default shown)
  1000, // optional priority fee in microlamports
  false // optional enable logging (default: false)
);

// Stake SOL → get ySOL receipt tokens
try {
  const poolId = 0; // use 0 for SOL, 1 for USDC
  const amount = 1_000_000_000; // 1 SOL (in lamports)
  const signature = await client.stake(poolId, amount);
  console.log(`Stake successful: ${signature}`);
} catch (error) {
  console.error("Staking failed:", error);
}
```

## Usage with Wallet Adapters

### Phantom Wallet

```javascript
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";

const phantom = new PhantomWalletAdapter();
await phantom.connect();

const client = new SynatraClient("https://api.mainnet-beta.solana.com", null);
client.setWallet(phantom);
```

## Examples

### Staking USDC → get yUSD receipt tokens

```javascript
// Stake 100 USDC to get yUSD receipt tokens
const poolId = 1; // USDC pool
const decimals = 6; // USDC decimals
const amount = 100 * Math.pow(10, decimals);
const signature = await client.stake(poolId, amount);
```

### Unstaking yUSD receipt tokens

```javascript
// Unstake 50 yUSD receipt tokens to get USDC back
const poolId = 1; // USDC pool
const decimals = 6; // yUSD receipt token decimals
const receiptAmount = 50 * Math.pow(10, decimals);
const signature = await client.unstake(poolId, receiptAmount);
```

### Getting Pool Information

```javascript
const poolId = 1;
const pool = await client.getPool(poolId);
if (pool) {
  console.log("Pool stake rate:", pool.stakeRate);
  console.log("Pool unstake rate:", pool.unstakeRate);
}
```

### Setting Priority Fees

```javascript
// Set priority fee to 1000 microlamports
client.setPriorityFee(1000);

// Or during initialization
const client = new SynatraClient(rpcUrl, null, undefined, 1000);
```

## API Reference

### Constructor

```javascript
new SynatraClient(
  rpcUrl: string,
  userKeypair?: Keypair,
  synatraApiUrl?: string,
  priorityFeeMicroLamports?: number,
  enableLogging?: boolean
)
```

Parameters:

- `rpcUrl`: Solana RPC endpoint URL
- `userKeypair`: User keypair for signing (optional, can be set later with `setWallet`)
- `synatraApiUrl`: Synatra API URL (optional, defaults to production API)
- `priorityFeeMicroLamports`: Priority fee in microlamports (optional, default: 0)
- `enableLogging`: Enable console error logging (optional, default: false)

### Methods

#### `setWallet(wallet)`

Set the wallet for signing transactions.

#### `setPriorityFee(priorityFeeMicroLamports)`

Update the priority fee for transactions.

#### `getPool(poolId)`

Fetch pool information.

#### `getCurrentSupply(poolId)`

Get current supply of a pool's receipt token.

#### `stake(poolId, amount)`

Stake SOL or SPL tokens.

#### `unstake(poolId, receiptAmount)`

Unstake tokens and create claim record.

#### `getClaims()`

Get all claims for the connected wallet.

```javascript
const claims = await client.getClaims();
claims.forEach((claim) => {
  console.log(`Claim ${claim.address}: ${claim.claimAmount} lamports`);
  console.log(
    `Status: ${
      claim.claimed
        ? "Claimed"
        : claim.fulfilled
        ? "Ready to claim"
        : "Processing"
    }`
  );
});
```

## Error Handling

The client includes built-in error handling for common scenarios:

```javascript
try {
  await client.stake(poolId, amount);
} catch (error) {
  if (error.message === "No wallet set") {
    // Handle wallet not connected
  } else if (error.message === "Pool not found") {
    // Handle invalid pool
  } else {
    // Handle other errors
  }
}
```

## Quality Assurance

This package is thoroughly tested with comprehensive Jest test suites covering client initialization, input validation, pool operations, and staking functionality. The test suite includes compatibility checks for different Node.js versions and validates both success and error scenarios.

## Support

For support, join our [Discord channel](https://discord.gg/DKvknQqGzH).
