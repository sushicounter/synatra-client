# synatra-client (Python)

An offline Python client for the Synatra staking program on Solana
(`synatfE5AvWtbDT9sSvDsF9gmeqR9qeq3FA84bhxWur`), built on the same IDL as the JS client in this
repo. Standard library only, Python 3.9 or newer.

It derives the program's addresses, builds its three public instructions and decodes its
accounts. It does not talk to an RPC node or sign: fetch account data and send transactions with
the Solana library of your choice. All amounts are integers in base units (lamports for SOL,
6 decimals for USDC). Rates are integers scaled by 100000.

```python
import synatra_client as sc

user = sc.Pubkey('<your wallet address>')

# Pool 0 takes SOL and mints ySOL; pool 1 takes USDC and mints yUSD.
pool_key = sc.pool_address(1)
pool = sc.decode_account('Pool', pool_account_data)  # raw bytes fetched from your RPC

ix = sc.stake_instruction(pool, user, 1_000_000)  # 1 USDC
ix = sc.unstake_instruction(user, 1, pool['receipt_token'], pool['nonce'], 1_000_000)
# ix.program_id, ix.accounts (AccountMeta: pubkey, is_signer, is_writable) and ix.data
# map directly onto solders.instruction.Instruction.
```

An unstake does not pay out at once: it opens a claim record (`sc.claim_address(pool_id, nonce)`)
that the protocol later fulfills.

Tests compare every address, instruction and decoded account with vectors produced by the JS
stack (`../test/vectors.json`):

```bash
cd python && python3 -m unittest discover -s tests
```

Not yet published to PyPI.
