"""Addresses, instructions and account decoding for the Synatra program, from its IDL."""

import hashlib
import json
import struct
from dataclasses import dataclass
from pathlib import Path

IDL = json.loads((Path(__file__).parent / 'synatra-idl.json').read_text())

_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
_INDEX = {c: i for i, c in enumerate(_ALPHABET)}


def b58encode(data: bytes) -> str:
    n = int.from_bytes(data, 'big')
    out = ''
    while n:
        n, r = divmod(n, 58)
        out = _ALPHABET[r] + out
    pad = len(data) - len(data.lstrip(b'\0'))
    return '1' * pad + out


def b58decode(text: str) -> bytes:
    n = 0
    for c in text:
        if c not in _INDEX:
            raise ValueError(f'invalid base58 character {c!r}')
        n = n * 58 + _INDEX[c]
    pad = len(text) - len(text.lstrip('1'))
    body = n.to_bytes((n.bit_length() + 7) // 8, 'big') if n else b''
    return b'\0' * pad + body


class Pubkey:
    """A 32-byte Solana public key. Build it from base58 text or raw bytes."""

    __slots__ = ('_bytes',)

    def __init__(self, value):
        raw = b58decode(value) if isinstance(value, str) else bytes(value)
        if len(raw) != 32:
            raise ValueError('a public key is 32 bytes')
        self._bytes = raw

    def __bytes__(self):
        return self._bytes

    def __str__(self):
        return b58encode(self._bytes)

    def __repr__(self):
        return f'Pubkey({str(self)!r})'

    def __eq__(self, other):
        return isinstance(other, Pubkey) and self._bytes == other._bytes

    def __hash__(self):
        return hash(self._bytes)


PROGRAM_ID = Pubkey(IDL['address'])
NATIVE_SOL_MINT = Pubkey('So11111111111111111111111111111111111111111')
_FIXED = {
    a['name']: Pubkey(a['address'])
    for ix in IDL['instructions']
    for a in ix['accounts']
    if 'address' in a
}
ASSOCIATED_TOKEN_PROGRAM_ID = _FIXED['associated_token_program']
TOKEN_PROGRAM_ID = _FIXED['token_program']
SYSTEM_PROGRAM_ID = _FIXED['system_program']

# Ed25519 field prime and curve constant d, for the off-curve check that PDAs need.
_P = 2**255 - 19
_D = (-121665 * pow(121666, _P - 2, _P)) % _P


def is_on_curve(key: bytes) -> bool:
    """True if the 32 bytes decompress to an Ed25519 point (as curve25519-dalek decides)."""
    y = int.from_bytes(key, 'little') & ((1 << 255) - 1)
    y2 = y * y % _P
    u = (y2 - 1) % _P
    v = (_D * y2 + 1) % _P
    if v == 0:
        return u == 0
    x2 = u * pow(v, _P - 2, _P) % _P
    return x2 == 0 or pow(x2, (_P - 1) // 2, _P) == 1


def create_program_address(seeds, program_id: Pubkey = PROGRAM_ID) -> Pubkey:
    h = hashlib.sha256()
    for seed in seeds:
        if len(seed) > 32:
            raise ValueError('a seed is at most 32 bytes')
        h.update(seed)
    h.update(bytes(program_id))
    h.update(b'ProgramDerivedAddress')
    digest = h.digest()
    if is_on_curve(digest):
        raise ValueError('address is on the curve')
    return Pubkey(digest)


def find_program_address(seeds, program_id: Pubkey = PROGRAM_ID):
    """Return (address, bump) for the first bump from 255 down that is off the curve."""
    for bump in range(255, -1, -1):
        try:
            return create_program_address([*seeds, bytes([bump])], program_id), bump
        except ValueError:
            continue
    raise ValueError('no viable bump seed')


def _seed_pda(seed: str) -> Pubkey:
    return find_program_address([seed.encode()])[0]


def global_address() -> Pubkey:
    return _seed_pda('global')


def pool_address(pool_id: int) -> Pubkey:
    return _seed_pda(f'pool-{_uint(pool_id)}')


def claim_address(pool_id: int, nonce: int) -> Pubkey:
    """The claim record an unstake creates; `nonce` is the pool's nonce before the unstake."""
    return _seed_pda(f'claim-{_uint(pool_id)}-{_uint(nonce)}')


def get_associated_token_address(owner: Pubkey, mint: Pubkey) -> Pubkey:
    seeds = [bytes(owner), bytes(TOKEN_PROGRAM_ID), bytes(mint)]
    return find_program_address(seeds, ASSOCIATED_TOKEN_PROGRAM_ID)[0]


@dataclass(frozen=True)
class AccountMeta:
    pubkey: Pubkey
    is_signer: bool
    is_writable: bool


@dataclass(frozen=True)
class Instruction:
    program_id: Pubkey
    accounts: list
    data: bytes


_INSTRUCTIONS = {ix['name']: ix for ix in IDL['instructions']}
_U64_MAX = 2**64 - 1


def _uint(value) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0 or value > _U64_MAX:
        raise ValueError('expected an integer from 0 to 2^64 - 1')
    return value


def _amount(value) -> int:
    if _uint(value) == 0:
        raise ValueError('amount must be positive')
    return value


def _build(name: str, accounts: dict, amount: int) -> Instruction:
    ix = _INSTRUCTIONS[name]
    metas = [
        AccountMeta(
            _FIXED[a['name']] if 'address' in a else accounts[a['name']],
            bool(a.get('signer')),
            bool(a.get('writable')),
        )
        for a in ix['accounts']
    ]
    data = bytes(ix['discriminator']) + struct.pack('<Q', _amount(amount))
    return Instruction(PROGRAM_ID, metas, data)


def stake_sol_instruction(user: Pubkey, pool_id: int, receipt_mint: Pubkey, amount: int):
    """Stake `amount` lamports into a SOL pool; mints the pool's receipt token to `user`."""
    return _build(
        'stake_sol',
        {
            'signer': user,
            'payer': user,
            'pool': pool_address(pool_id),
            'receipt_token': receipt_mint,
            'user_receipt_ata': get_associated_token_address(user, receipt_mint),
        },
        amount,
    )


def stake_token_instruction(
    user: Pubkey, pool_id: int, stake_mint: Pubkey, receipt_mint: Pubkey, amount: int
):
    """Stake `amount` base units of an SPL token (such as USDC) into its pool."""
    pool = pool_address(pool_id)
    return _build(
        'stake_token',
        {
            'signer': user,
            'payer': user,
            'pool': pool,
            'stake_token': stake_mint,
            'receipt_token': receipt_mint,
            'user_stake_ata': get_associated_token_address(user, stake_mint),
            'user_receipt_ata': get_associated_token_address(user, receipt_mint),
            'pool_stake_ata': get_associated_token_address(pool, stake_mint),
        },
        amount,
    )


def unstake_instruction(
    user: Pubkey, pool_id: int, receipt_mint: Pubkey, nonce: int, receipt_amount: int
):
    """Burn `receipt_amount` receipt tokens and open a claim; `nonce` is the pool's nonce now."""
    return _build(
        'unstake',
        {
            'signer': user,
            'payer': user,
            'pool': pool_address(pool_id),
            'receipt_token': receipt_mint,
            'user_receipt_ata': get_associated_token_address(user, receipt_mint),
            'claim_record': claim_address(pool_id, nonce),
        },
        receipt_amount,
    )


def stake_instruction(pool: dict, user: Pubkey, amount: int) -> Instruction:
    """Stake into a decoded Pool account, picking stake_sol or stake_token as the JS client does."""
    if pool['stake_token'] == NATIVE_SOL_MINT:
        return stake_sol_instruction(user, pool['id'], pool['receipt_token'], amount)
    return stake_token_instruction(
        user, pool['id'], pool['stake_token'], pool['receipt_token'], amount
    )


_ACCOUNT_DISCRIMINATORS = {a['name']: bytes(a['discriminator']) for a in IDL['accounts']}
_ACCOUNT_FIELDS = {t['name']: t['type']['fields'] for t in IDL['types']}
_SIZES = {'u64': 8, 'pubkey': 32, 'bool': 1}


def decode_account(name: str, data: bytes) -> dict:
    """Decode a Pool or ClaimRecord account's raw data; keys are the IDL's snake_case names."""
    discriminator = _ACCOUNT_DISCRIMINATORS[name]
    if data[:8] != discriminator:
        raise ValueError(f'not a {name} account')
    out, offset = {}, 8
    for field in _ACCOUNT_FIELDS[name]:
        kind = field['type']
        size = _SIZES.get(kind)
        if size is None:
            raise ValueError(f'unsupported IDL type {kind!r}')
        if offset + size > len(data):
            raise ValueError(f'{name} account data is too short')
        chunk = data[offset : offset + size]
        if kind == 'u64':
            out[field['name']] = struct.unpack('<Q', chunk)[0]
        elif kind == 'pubkey':
            out[field['name']] = Pubkey(chunk)
        else:
            out[field['name']] = chunk[0] != 0
        offset += size
    return out
