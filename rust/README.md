# synatra-client (Rust)

An offline Rust client for the Synatra staking program on Solana
(`synatfE5AvWtbDT9sSvDsF9gmeqR9qeq3FA84bhxWur`), built on the same IDL as the JS client in this
repo.

It derives the program's addresses, builds its three public instructions and decodes its
accounts. It does not talk to an RPC node or sign: fetch account data and send transactions with
the Solana crates of your choice. All amounts are integers in base units (lamports for SOL,
6 decimals for USDC). Rates are integers scaled by 100000.

```rust
use synatra_client::{pool_address, stake, unstake, Pool, Pubkey};

let user: Pubkey = "<your wallet address>".parse()?;

// Pool 0 takes SOL and mints ySOL; pool 1 takes USDC and mints yUSD.
let pool_key = pool_address(1);
let pool = Pool::decode(&pool_account_data)?; // raw bytes fetched from your RPC

let ix = stake(&pool, &user, 1_000_000)?; // 1 USDC
let ix = unstake(&user, 1, &pool.receipt_token, pool.nonce, 1_000_000)?;
// ix.program_id, ix.accounts (pubkey, is_signer, is_writable) and ix.data map one to one
// onto solana_program::instruction::Instruction.
```

An unstake does not pay out at once: it opens a claim record (`claim_address(pool_id, nonce)`)
that the protocol later fulfills.

Tests compare every address, instruction and decoded account with vectors produced by the JS
stack (`../test/vectors.json`):

```bash
cargo test --manifest-path rust/Cargo.toml
```

`publish = false` in `Cargo.toml` until counter says to publish to crates.io.
