// The Python and Rust clients are checked against test/vectors.json. This keeps that file in step
// with the JS stack and the JS client, and keeps the npm package JS-only.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { Keypair } from '@solana/web3.js'
import { SynatraClient } from '../SynatraClient.js'
import { buildVectors } from './vectors.js'

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

describe('cross-language vectors', () => {
  test('test/vectors.json is current (run `node test/vectors.js` to refresh)', async () => {
    expect(await buildVectors()).toEqual(read('./vectors.json'))
  })

  test('the JS client derives the same pool and claim addresses', () => {
    const client = new SynatraClient('http://127.0.0.1:8899', Keypair.generate())
    const pdas = Object.fromEntries(read('./vectors.json').pdas.map((p) => [p.seed, p.address]))
    expect(client.globalPublicKey.toBase58()).toBe(pdas.global)
    expect(client._getPoolPublicKey(0).toBase58()).toBe(pdas['pool-0'])
    expect(client._getPoolPublicKey(1).toBase58()).toBe(pdas['pool-1'])
    expect(client._getPda('claim-1-42').toBase58()).toBe(pdas['claim-1-42'])
  })

  test('the Python and Rust copies of the IDL match synatra-idl.json', () => {
    const idl = read('../synatra-idl.json')
    expect(read('../python/synatra_client/synatra-idl.json')).toEqual(idl)
    expect(read('../rust/synatra-idl.json')).toEqual(idl)
  })

  test('npm pack ships no Python or Rust files', () => {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
    })
    const files = JSON.parse(out)[0].files.map((f) => f.path)
    expect(files.filter((f) => /^(python|rust)\//.test(f))).toEqual([])
    expect(files).toContain('SynatraClient.js')
  })
})
