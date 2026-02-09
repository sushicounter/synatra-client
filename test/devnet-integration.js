#!/usr/bin/env node
/**
 * Devnet integration tests for SynatraClient
 * Tests actual stake/unstake/getClaims against the deployed devnet contract.
 * Run with: node test/devnet.test.js
 */

import { SynatraClient } from '../SynatraClient.js'
import { Keypair, PublicKey, Connection } from '@solana/web3.js'
import { getMint, getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token'
import fs from 'fs'

const DEVNET_RPC = 'https://api.devnet.solana.com'
const PROGRAM_ID = 'G2HTbxYa9XpiZviwnjtTrPCpfRxT8c6L9BvvJFo59ESx'
const SOL_POOL_ID = 0
const TOKEN_POOL_ID = 1

const adminKeypair = JSON.parse(
  fs.readFileSync(
    new URL('../../synatra-solana-contract/wallets/admin-dev-wallet.json', import.meta.url),
    'utf-8'
  )
)
const admin = Keypair.fromSecretKey(new Uint8Array(adminKeypair))

let passed = 0
let failed = 0

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    console.log(`  ✗ ${name}`)
    console.log(`    ${err.message}`)
  }
}

async function main() {
  // Override the hardcoded program address by patching the IDL
  // The client reads from the IDL, so we construct with the devnet program
  const client = new SynatraClient(DEVNET_RPC, admin)
  // The client hardcodes synatfE5... as program address. We need to override it.
  // Since the IDL now has the devnet address (G2HTb...), the Program will use that.
  // But programPublicKey used for PDA derivation still points to synatfE5...
  // Let's fix that:
  client.programPublicKey = new PublicKey(PROGRAM_ID)
  client.globalPublicKey = client._getPda('global')

  const connection = new Connection(DEVNET_RPC, 'confirmed')

  console.log('\nSynatraClient Devnet Integration Tests')
  console.log(`Program: ${PROGRAM_ID}`)
  console.log(`Admin: ${admin.publicKey.toBase58()}`)
  console.log(`Balance: ${(await connection.getBalance(admin.publicKey)) / 1e9} SOL\n`)

  // --- Pool reads ---

  console.log('Pool Operations:')

  let solPool, tokenPool

  await test('getPool(0) - SOL pool', async () => {
    solPool = await client.getPool(SOL_POOL_ID)
    assert(solPool !== null, 'SOL pool should exist')
    assert(solPool.id === 0, `Expected pool ID 0, got ${solPool.id}`)
    assert(solPool.stakeRate > 0, 'Stake rate should be positive')
    assert(solPool.unstakeRate > 0, 'Unstake rate should be positive')
    console.log(`    Pool 0: stakeRate=${solPool.stakeRate}, unstakeRate=${solPool.unstakeRate}, nonce=${solPool.nonce}`)
  })

  await test('getPool(1) - Token pool', async () => {
    tokenPool = await client.getPool(TOKEN_POOL_ID)
    assert(tokenPool !== null, 'Token pool should exist')
    assert(tokenPool.id === 1, `Expected pool ID 1, got ${tokenPool.id}`)
    console.log(`    Pool 1: stakeRate=${tokenPool.stakeRate}, unstakeRate=${tokenPool.unstakeRate}, nonce=${tokenPool.nonce}`)
  })

  await test('getCurrentSupply(0) - SOL pool supply', async () => {
    const supply = await client.getCurrentSupply(SOL_POOL_ID)
    assert(typeof supply === 'number', 'Supply should be a number')
    console.log(`    SOL pool receipt supply: ${supply}`)
  })

  await test('getCurrentSupply(1) - Token pool supply', async () => {
    const supply = await client.getCurrentSupply(TOKEN_POOL_ID)
    assert(typeof supply === 'number', 'Supply should be a number')
    console.log(`    Token pool receipt supply: ${supply}`)
  })

  // --- SOL Staking ---

  console.log('\nSOL Staking:')

  const stakeAmount = 10_000_000 // 0.01 SOL

  await test('stake(0, amount) - Stake SOL', async () => {
    const tx = await client.stake(SOL_POOL_ID, stakeAmount)
    assert(typeof tx === 'string' && tx.length > 0, 'Should return tx signature')
    console.log(`    tx: ${tx}`)
    // Wait for confirmation to propagate
    await connection.confirmTransaction(tx, 'confirmed')

    // Verify receipt tokens received
    const receiptAta = getAssociatedTokenAddressSync(solPool.receiptToken, admin.publicKey)
    const account = await getAccount(connection, receiptAta)
    assert(account.amount > 0n, 'Should have receipt tokens')
    console.log(`    Receipt balance: ${account.amount}`)
  })

  await test('unstake(0, amount) - Unstake SOL', async () => {
    // Wait for finalization (client.connection uses default 'finalized' commitment)
    await new Promise((r) => setTimeout(r, 2000))
    // Re-fetch pool to get current nonce
    solPool = await client.getPool(SOL_POOL_ID)
    const receiptAta = getAssociatedTokenAddressSync(solPool.receiptToken, admin.publicKey)
    const account = await getAccount(connection, receiptAta)
    const receiptBalance = Number(account.amount)
    console.log(`    Receipt balance before unstake: ${receiptBalance}`)

    const tx = await client.unstake(SOL_POOL_ID, receiptBalance)
    assert(typeof tx === 'string' && tx.length > 0, 'Should return tx signature')
    console.log(`    tx: ${tx}`)
    await connection.confirmTransaction(tx, 'confirmed')

    // Verify receipt tokens burned
    const accountAfter = await getAccount(connection, receiptAta)
    assert(accountAfter.amount === 0n, 'Receipt tokens should be burned')
    console.log(`    Receipt balance after: ${accountAfter.amount}`)
  })

  // --- Token Staking ---

  console.log('\nToken Staking:')

  await test('stake(1, amount) - Stake token (expect insufficient balance)', async () => {
    // Admin doesn't hold the test stake token, so this should fail with balance error
    try {
      await client.stake(TOKEN_POOL_ID, 1000)
      // If it somehow succeeds, that's fine too
    } catch (err) {
      assert(
        err.message.includes('Token account not found') ||
          err.message.includes('Insufficient token balance'),
        `Expected balance error, got: ${err.message}`
      )
      console.log(`    Expected error: ${err.message}`)
    }
  })

  // --- Validation ---

  console.log('\nValidation:')

  await test('stake with invalid pool ID throws', async () => {
    try {
      await client.stake(-1, 1000)
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(err.message.includes('Invalid pool ID'), `Expected Invalid pool ID, got: ${err.message}`)
    }
  })

  await test('unstake with invalid amount throws', async () => {
    try {
      await client.unstake(0, 0)
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(
        err.message.includes('Amount must be positive'),
        `Expected Amount must be positive, got: ${err.message}`
      )
    }
  })

  await test('operations without wallet throws', async () => {
    const noWalletClient = new SynatraClient(DEVNET_RPC)
    noWalletClient.programPublicKey = new PublicKey(PROGRAM_ID)
    noWalletClient.globalPublicKey = noWalletClient._getPda('global')
    try {
      await noWalletClient.stake(0, 1000)
      assert(false, 'Should have thrown')
    } catch (err) {
      assert(err.message.includes('No wallet set'), `Expected No wallet set, got: ${err.message}`)
    }
  })

  // --- Summary ---

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`)
  console.log(`Remaining balance: ${(await connection.getBalance(admin.publicKey)) / 1e9} SOL`)

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
