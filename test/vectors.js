// Reference vectors for the Python and Rust clients, computed with @solana/web3.js and the
// Anchor coder from synatra-idl.json: PDAs, instruction keys and data, and account decoding.
// `node test/vectors.js` rewrites test/vectors.json; test/vectors.test.js fails if it is stale.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as anchor from '@coral-xyz/anchor'
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import idl from '../synatra-idl.json' with { type: 'json' }

const { BorshAccountsCoder, BorshInstructionCoder, web3 } = anchor
const { BN } = anchor.default
const { PublicKey, SystemProgram } = web3

const PROGRAM_ID = new PublicKey(idl.address)
const USER = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
const SOL = new PublicKey('So11111111111111111111111111111111111111111')
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const RECEIPTS = [
  new PublicKey('yso11GJ3cEsFbmLV9XaFNg2rAmH9yN4oNNbGSDUAVq6'),
  new PublicKey('yUSDGaRxJ2Xh4nJdqaR1JRHLxEr7BTCqdnfhSaaETPE'),
]

const pda = (seed) => PublicKey.findProgramAddressSync([Buffer.from(seed)], PROGRAM_ID)
const ata = (owner, mint) =>
  PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0]

const ixCoder = new BorshInstructionCoder(idl)
const accountsCoder = new BorshAccountsCoder(idl)

const meta = (pubkey, signer, writable) => ({ pubkey: pubkey.toBase58(), signer, writable })
const tail = [
  meta(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
  meta(TOKEN_PROGRAM_ID, false, false),
  meta(SystemProgram.programId, false, false),
]

export const buildVectors = async () => {
  const pdas = ['global', 'pool-0', 'pool-1', 'claim-0-0', 'claim-1-42'].map((seed) => {
    const [address, bump] = pda(seed)
    return { seed, address: address.toBase58(), bump }
  })
  const atas = [
    [USER, SOL],
    [USER, USDC],
    [pda('pool-1')[0], USDC],
  ].map(([owner, mint]) => ({
    owner: owner.toBase58(),
    mint: mint.toBase58(),
    address: ata(owner, mint).toBase58(),
  }))

  const pool0 = pda('pool-0')[0]
  const pool1 = pda('pool-1')[0]
  const amount = '1000000000'
  const instructions = [
    {
      name: 'stake_sol',
      poolId: 0,
      amount,
      keys: [
        meta(USER, true, true),
        meta(USER, true, true),
        meta(pool0, false, true),
        meta(RECEIPTS[0], false, true),
        meta(ata(USER, RECEIPTS[0]), false, true),
        ...tail,
      ],
      data: ixCoder.encode('stake_sol', { amount: new BN(amount) }).toString('hex'),
    },
    {
      name: 'stake_token',
      poolId: 1,
      amount,
      keys: [
        meta(USER, true, true),
        meta(USER, true, true),
        meta(pool1, false, false),
        meta(USDC, false, true),
        meta(RECEIPTS[1], false, true),
        meta(ata(USER, USDC), false, true),
        meta(ata(USER, RECEIPTS[1]), false, true),
        meta(ata(pool1, USDC), false, true),
        ...tail,
      ],
      data: ixCoder.encode('stake_token', { amount: new BN(amount) }).toString('hex'),
    },
    {
      name: 'unstake',
      poolId: 1,
      nonce: 42,
      amount,
      keys: [
        meta(USER, true, true),
        meta(USER, true, true),
        meta(pool1, false, true),
        meta(RECEIPTS[1], false, true),
        meta(ata(USER, RECEIPTS[1]), false, true),
        meta(pda('claim-1-42')[0], false, true),
        ...tail,
      ],
      data: ixCoder.encode('unstake', { receipt_amount: new BN(amount) }).toString('hex'),
    },
  ]

  const pool = {
    id: '1',
    manager: USER.toBase58(),
    oracle: SystemProgram.programId.toBase58(),
    stake_token: USDC.toBase58(),
    receipt_token: RECEIPTS[1].toBase58(),
    stake_rate: '104321',
    unstake_rate: '104000',
    receipt_max_supply: '18446744073709551615',
    nonce: '42',
  }
  const claim = {
    pool_id: '1',
    claimer: USER.toBase58(),
    nonce: '41',
    receipt_amount: '2500000',
    unstake_rate: '104000',
    fulfilled: true,
  }
  const toBn = (o) =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [
        k,
        typeof v === 'boolean' ? v : v.length < 32 ? new BN(v) : new PublicKey(v),
      ])
    )
  const accounts = [
    {
      name: 'Pool',
      fields: pool,
      data: (await accountsCoder.encode('Pool', toBn(pool))).toString('base64'),
    },
    {
      name: 'ClaimRecord',
      fields: claim,
      data: (await accountsCoder.encode('ClaimRecord', toBn(claim))).toString('base64'),
    },
  ]

  return {
    programId: PROGRAM_ID.toBase58(),
    user: USER.toBase58(),
    receiptMints: RECEIPTS.map((r) => r.toBase58()),
    pdas,
    atas,
    instructions,
    accounts,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = fileURLToPath(new URL('./vectors.json', import.meta.url))
  writeFileSync(path, JSON.stringify(await buildVectors(), null, 2) + '\n')
  console.log(`wrote ${path}`)
}
