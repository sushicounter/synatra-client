# Synatra Client SDK

A JavaScript client for interacting with the Synatra staking program on Solana.

## Features

- Stake SOL or USDC on Solana
- Unstake tokens
- Full TypeScript support via JSDoc annotations
- Priority fee management
- Comprehensive error handling

## Installation

```bash
npm install @synatra/client
```

## Quick Start

```javascript
import { SynatraClient } from "@synatra/client";
import { Keypair } from "@solana/web3.js";

// Initialize client
const client = new SynatraClient(
  "https://api.mainnet-beta.solana.com", // or your preferred RPC
  1000 // optional priority fee in microlamports
);

// Set up wallet
const wallet = {
  publicKey: keypair.publicKey,
  signTransaction: async (tx) => {
    tx.partialSign(keypair);
    return tx;
  },
};
client.setWallet(wallet);

// Stake SOL
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

const client = new SynatraClient("https://api.mainnet-beta.solana.com");
client.setWallet(phantom);
```

## Examples

### Staking USDC

```javascript
// Stake 100 USDC
const poolId = 1; // USDC pool
const decimals = 6; // USDC decimals
const amount = 100 * Math.pow(10, decimals);
const signature = await client.stake(poolId, amount);
```

### Unstaking USDC

```javascript
// Unstake 50 yUSD
const poolId = 1; // USDC pool
const decimals = 6; // yUSD and USDC will use same decimals
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
const client = new SynatraClient(rpcUrl, 1000);
```

## API Reference

### Constructor

```javascript
new SynatraClient(rpcUrl: string, priorityFeeMicroLamports?: number)
```

### Methods

#### `setWallet(wallet)`

Set the wallet for signing transactions.

#### `removeWallet()`

Remove the current wallet.

#### `setPriorityFee(priorityFeeMicroLamports)`

Update the priority fee for transactions.

#### `getPool(poolId)`

Fetch pool information.

#### `getCurrentSupply(tokenPublicKey)`

Get current supply of a token.

#### `stake(poolId, amount)`

Stake SOL or SPL tokens.

#### `unstake(poolId, receiptAmount)`

Unstake tokens and create claim record.

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

## Support

For support, join our [Discord channel](https://discord.gg/DKvknQqGzH).
