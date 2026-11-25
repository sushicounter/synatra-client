"""Python client for the Synatra staking program on Solana.

Derives the program's addresses, builds its public instructions (stake_sol, stake_token, unstake)
and decodes its accounts (Pool, ClaimRecord). Everything comes from synatra-idl.json, the same IDL
the JS client uses: program id, discriminators, account order and flags, and account layouts.

Offline and dependency-free: it does not talk to an RPC node or sign. Fetch account data and
send transactions with the Solana library of your choice (for example solders or solana-py).
All amounts are integers in base units.
"""

from .client import (
    ASSOCIATED_TOKEN_PROGRAM_ID,
    IDL,
    NATIVE_SOL_MINT,
    PROGRAM_ID,
    SYSTEM_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    AccountMeta,
    Instruction,
    Pubkey,
    claim_address,
    create_program_address,
    decode_account,
    find_program_address,
    get_associated_token_address,
    global_address,
    is_on_curve,
    pool_address,
    stake_instruction,
    stake_sol_instruction,
    stake_token_instruction,
    unstake_instruction,
)

__all__ = [
    'ASSOCIATED_TOKEN_PROGRAM_ID',
    'IDL',
    'NATIVE_SOL_MINT',
    'PROGRAM_ID',
    'SYSTEM_PROGRAM_ID',
    'TOKEN_PROGRAM_ID',
    'AccountMeta',
    'Instruction',
    'Pubkey',
    'claim_address',
    'create_program_address',
    'decode_account',
    'find_program_address',
    'get_associated_token_address',
    'global_address',
    'is_on_curve',
    'pool_address',
    'stake_instruction',
    'stake_sol_instruction',
    'stake_token_instruction',
    'unstake_instruction',
]
