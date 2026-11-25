"""Check the Python client against the JS client's reference vectors (test/vectors.json)."""

import base64
import json
import unittest
from pathlib import Path

import synatra_client as sc

ROOT = Path(__file__).resolve().parents[2]
VECTORS = json.loads((ROOT / 'test' / 'vectors.json').read_text())
USER = sc.Pubkey(VECTORS['user'])


def metas(ix):
    return [
        {'pubkey': str(m.pubkey), 'signer': m.is_signer, 'writable': m.is_writable}
        for m in ix.accounts
    ]


class IdlTest(unittest.TestCase):
    def test_bundled_idl_matches_repo_idl(self):
        root = json.loads((ROOT / 'synatra-idl.json').read_text())
        self.assertEqual(sc.IDL, root)

    def test_program_id(self):
        self.assertEqual(str(sc.PROGRAM_ID), VECTORS['programId'])


class AddressTest(unittest.TestCase):
    def test_pdas(self):
        for v in VECTORS['pdas']:
            address, bump = sc.find_program_address([v['seed'].encode()])
            self.assertEqual((str(address), bump), (v['address'], v['bump']), v['seed'])
        self.assertEqual(str(sc.global_address()), VECTORS['pdas'][0]['address'])
        self.assertEqual(str(sc.pool_address(1)), VECTORS['pdas'][2]['address'])
        self.assertEqual(str(sc.claim_address(1, 42)), VECTORS['pdas'][4]['address'])

    def test_atas(self):
        for v in VECTORS['atas']:
            ata = sc.get_associated_token_address(sc.Pubkey(v['owner']), sc.Pubkey(v['mint']))
            self.assertEqual(str(ata), v['address'])

    def test_on_curve(self):
        self.assertTrue(sc.is_on_curve(bytes(USER)))
        self.assertFalse(sc.is_on_curve(bytes(sc.pool_address(0))))

    def test_base58_round_trip(self):
        for text in [VECTORS['user'], '11111111111111111111111111111111']:
            self.assertEqual(str(sc.Pubkey(text)), text)


class InstructionTest(unittest.TestCase):
    def check(self, ix, name):
        v = next(i for i in VECTORS['instructions'] if i['name'] == name)
        self.assertEqual(ix.program_id, sc.PROGRAM_ID)
        self.assertEqual(metas(ix), v['keys'])
        self.assertEqual(ix.data.hex(), v['data'])

    def test_stake_sol(self):
        receipt = sc.Pubkey(VECTORS['receiptMints'][0])
        self.check(sc.stake_sol_instruction(USER, 0, receipt, 1_000_000_000), 'stake_sol')

    def test_stake_token(self):
        usdc = sc.Pubkey(VECTORS['atas'][1]['mint'])
        receipt = sc.Pubkey(VECTORS['receiptMints'][1])
        ix = sc.stake_token_instruction(USER, 1, usdc, receipt, 1_000_000_000)
        self.check(ix, 'stake_token')

    def test_unstake(self):
        receipt = sc.Pubkey(VECTORS['receiptMints'][1])
        self.check(sc.unstake_instruction(USER, 1, receipt, 42, 1_000_000_000), 'unstake')

    def test_stake_from_decoded_pool(self):
        data = base64.b64decode(VECTORS['accounts'][0]['data'])
        pool = sc.decode_account('Pool', data)
        self.check(sc.stake_instruction(pool, USER, 1_000_000_000), 'stake_token')

    def test_rejects_bad_amounts(self):
        receipt = sc.Pubkey(VECTORS['receiptMints'][0])
        for bad in [0, -1, 1.5, 2**64, True]:
            with self.assertRaises(ValueError):
                sc.stake_sol_instruction(USER, 0, receipt, bad)


class AccountTest(unittest.TestCase):
    def test_decode(self):
        for v in VECTORS['accounts']:
            decoded = sc.decode_account(v['name'], base64.b64decode(v['data']))
            expected = {
                k: val if isinstance(val, bool) else int(val) if len(val) < 32 else sc.Pubkey(val)
                for k, val in v['fields'].items()
            }
            self.assertEqual(decoded, expected, v['name'])

    def test_rejects_wrong_discriminator(self):
        data = base64.b64decode(VECTORS['accounts'][1]['data'])
        with self.assertRaises(ValueError):
            sc.decode_account('Pool', data)

    def test_rejects_short_data(self):
        data = base64.b64decode(VECTORS['accounts'][0]['data'])
        for cut in [12, 40, len(data) - 1]:
            with self.assertRaises(ValueError):
                sc.decode_account('Pool', data[:cut])


if __name__ == '__main__':
    unittest.main()
