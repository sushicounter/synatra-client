//! Rust client for the Synatra staking program on Solana.
//!
//! Derives the program's addresses, builds its public instructions (`stake_sol`, `stake_token`,
//! `unstake`) and decodes its accounts (`Pool`, `ClaimRecord`). Everything comes from
//! `synatra-idl.json`, the same IDL the JS client uses: program id, discriminators, account order
//! and flags, and account layouts.
//!
//! Offline: it does not talk to an RPC node or sign. Fetch account data and send transactions
//! with the Solana crates of your choice; `Pubkey::to_bytes` and the `AccountMeta` fields map
//! one to one onto `solana-program`'s types. All amounts are integers in base units.

use std::collections::BTreeMap;
use std::fmt;
use std::sync::OnceLock;

use curve25519_dalek::edwards::CompressedEdwardsY;
use serde_json::Value;
use sha2::{Digest, Sha256};

/// The program IDL bundled with the crate, a copy of the repo's `synatra-idl.json`.
pub const IDL_JSON: &str = include_str!("../synatra-idl.json");

/// The wrapped-SOL mint, which marks a pool that takes native SOL.
pub const NATIVE_SOL_MINT: &str = "So11111111111111111111111111111111111111111";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    InvalidPubkey(String),
    OnCurve,
    NoBump,
    SeedTooLong,
    ZeroAmount,
    WrongDiscriminator(String),
    TooShort(String),
    UnknownAccount(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::InvalidPubkey(s) => write!(f, "invalid public key {s}"),
            Error::OnCurve => write!(f, "address is on the curve"),
            Error::NoBump => write!(f, "no viable bump seed"),
            Error::SeedTooLong => write!(f, "a seed is at most 32 bytes"),
            Error::ZeroAmount => write!(f, "amount must be positive"),
            Error::WrongDiscriminator(n) => write!(f, "not a {n} account"),
            Error::TooShort(n) => write!(f, "{n} account data is too short"),
            Error::UnknownAccount(n) => write!(f, "unknown account type {n}"),
        }
    }
}

impl std::error::Error for Error {}

/// A 32-byte Solana public key.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Pubkey(pub [u8; 32]);

impl Pubkey {
    pub fn to_bytes(&self) -> [u8; 32] {
        self.0
    }

    pub fn from_slice(bytes: &[u8]) -> Result<Self, Error> {
        let raw: [u8; 32] = bytes
            .try_into()
            .map_err(|_| Error::InvalidPubkey(format!("of {} bytes", bytes.len())))?;
        Ok(Pubkey(raw))
    }

    /// True if the bytes decompress to an Ed25519 point.
    pub fn is_on_curve(&self) -> bool {
        CompressedEdwardsY(self.0).decompress().is_some()
    }
}

impl std::str::FromStr for Pubkey {
    type Err = Error;

    fn from_str(s: &str) -> Result<Self, Error> {
        let raw = bs58::decode(s)
            .into_vec()
            .map_err(|_| Error::InvalidPubkey(s.to_string()))?;
        Pubkey::from_slice(&raw).map_err(|_| Error::InvalidPubkey(s.to_string()))
    }
}

impl fmt::Display for Pubkey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&bs58::encode(self.0).into_string())
    }
}

impl fmt::Debug for Pubkey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Pubkey({self})")
    }
}

fn key(s: &str) -> Pubkey {
    s.parse().expect("the IDL holds valid addresses")
}

/// The parsed IDL.
pub fn idl() -> &'static Value {
    static IDL: OnceLock<Value> = OnceLock::new();
    IDL.get_or_init(|| serde_json::from_str(IDL_JSON).expect("the bundled IDL is valid JSON"))
}

fn fixed_address(name: &str) -> Pubkey {
    idl()["instructions"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|ix| ix["accounts"].as_array().into_iter().flatten())
        .find(|a| a["name"] == name && a["address"].is_string())
        .map(|a| key(a["address"].as_str().unwrap()))
        .expect("the IDL names this program")
}

pub fn program_id() -> Pubkey {
    key(idl()["address"].as_str().expect("the IDL has an address"))
}

pub fn token_program_id() -> Pubkey {
    fixed_address("token_program")
}

pub fn associated_token_program_id() -> Pubkey {
    fixed_address("associated_token_program")
}

pub fn system_program_id() -> Pubkey {
    fixed_address("system_program")
}

pub fn create_program_address(seeds: &[&[u8]], program: &Pubkey) -> Result<Pubkey, Error> {
    let mut hasher = Sha256::new();
    for seed in seeds {
        if seed.len() > 32 {
            return Err(Error::SeedTooLong);
        }
        hasher.update(seed);
    }
    hasher.update(program.0);
    hasher.update(b"ProgramDerivedAddress");
    let address = Pubkey(hasher.finalize().into());
    if address.is_on_curve() {
        return Err(Error::OnCurve);
    }
    Ok(address)
}

/// Returns (address, bump) for the first bump from 255 down that is off the curve.
pub fn find_program_address(seeds: &[&[u8]], program: &Pubkey) -> Result<(Pubkey, u8), Error> {
    for bump in (0..=255u8).rev() {
        let bump_seed = [bump];
        let mut all = seeds.to_vec();
        all.push(&bump_seed);
        match create_program_address(&all, program) {
            Ok(address) => return Ok((address, bump)),
            Err(Error::OnCurve) => continue,
            Err(e) => return Err(e),
        }
    }
    Err(Error::NoBump)
}

fn seed_pda(seed: &str) -> Pubkey {
    find_program_address(&[seed.as_bytes()], &program_id())
        .expect("short seeds always find a bump")
        .0
}

pub fn global_address() -> Pubkey {
    seed_pda("global")
}

pub fn pool_address(pool_id: u64) -> Pubkey {
    seed_pda(&format!("pool-{pool_id}"))
}

/// The claim record an unstake creates; `nonce` is the pool's nonce before the unstake.
pub fn claim_address(pool_id: u64, nonce: u64) -> Pubkey {
    seed_pda(&format!("claim-{pool_id}-{nonce}"))
}

pub fn associated_token_address(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let seeds: [&[u8]; 3] = [&owner.0, &token_program_id().0, &mint.0];
    find_program_address(&seeds, &associated_token_program_id())
        .expect("ATA seeds always find a bump")
        .0
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Instruction {
    pub program_id: Pubkey,
    pub accounts: Vec<AccountMeta>,
    pub data: Vec<u8>,
}

fn bytes_of(v: &Value) -> Vec<u8> {
    v.as_array()
        .expect("an IDL byte array")
        .iter()
        .map(|b| b.as_u64().expect("an IDL byte") as u8)
        .collect()
}

fn build(name: &str, accounts: &[(&str, Pubkey)], amount: u64) -> Result<Instruction, Error> {
    if amount == 0 {
        return Err(Error::ZeroAmount);
    }
    let ix = idl()["instructions"]
        .as_array()
        .and_then(|all| all.iter().find(|ix| ix["name"] == name))
        .expect("the IDL has this instruction");
    let metas = ix["accounts"]
        .as_array()
        .expect("instruction accounts")
        .iter()
        .map(|a| {
            let n = a["name"].as_str().expect("an account name");
            let pubkey = match a["address"].as_str() {
                Some(address) => key(address),
                None => accounts
                    .iter()
                    .find(|(k, _)| *k == n)
                    .map(|(_, v)| *v)
                    .unwrap_or_else(|| panic!("no account given for {n}")),
            };
            AccountMeta {
                pubkey,
                is_signer: a["signer"].as_bool().unwrap_or(false),
                is_writable: a["writable"].as_bool().unwrap_or(false),
            }
        })
        .collect();
    let mut data = bytes_of(&ix["discriminator"]);
    data.extend_from_slice(&amount.to_le_bytes());
    Ok(Instruction {
        program_id: program_id(),
        accounts: metas,
        data,
    })
}

/// Stake `amount` lamports into a SOL pool; mints the pool's receipt token to `user`.
pub fn stake_sol(
    user: &Pubkey,
    pool_id: u64,
    receipt_mint: &Pubkey,
    amount: u64,
) -> Result<Instruction, Error> {
    build(
        "stake_sol",
        &[
            ("signer", *user),
            ("payer", *user),
            ("pool", pool_address(pool_id)),
            ("receipt_token", *receipt_mint),
            (
                "user_receipt_ata",
                associated_token_address(user, receipt_mint),
            ),
        ],
        amount,
    )
}

/// Stake `amount` base units of an SPL token (such as USDC) into its pool.
pub fn stake_token(
    user: &Pubkey,
    pool_id: u64,
    stake_mint: &Pubkey,
    receipt_mint: &Pubkey,
    amount: u64,
) -> Result<Instruction, Error> {
    let pool = pool_address(pool_id);
    build(
        "stake_token",
        &[
            ("signer", *user),
            ("payer", *user),
            ("pool", pool),
            ("stake_token", *stake_mint),
            ("receipt_token", *receipt_mint),
            ("user_stake_ata", associated_token_address(user, stake_mint)),
            (
                "user_receipt_ata",
                associated_token_address(user, receipt_mint),
            ),
            (
                "pool_stake_ata",
                associated_token_address(&pool, stake_mint),
            ),
        ],
        amount,
    )
}

/// Burn `receipt_amount` receipt tokens and open a claim; `nonce` is the pool's nonce now.
pub fn unstake(
    user: &Pubkey,
    pool_id: u64,
    receipt_mint: &Pubkey,
    nonce: u64,
    receipt_amount: u64,
) -> Result<Instruction, Error> {
    build(
        "unstake",
        &[
            ("signer", *user),
            ("payer", *user),
            ("pool", pool_address(pool_id)),
            ("receipt_token", *receipt_mint),
            (
                "user_receipt_ata",
                associated_token_address(user, receipt_mint),
            ),
            ("claim_record", claim_address(pool_id, nonce)),
        ],
        receipt_amount,
    )
}

/// Stake into a decoded pool, choosing `stake_sol` or `stake_token` like the JS client.
pub fn stake(pool: &Pool, user: &Pubkey, amount: u64) -> Result<Instruction, Error> {
    if pool.stake_token == key(NATIVE_SOL_MINT) {
        stake_sol(user, pool.id, &pool.receipt_token, amount)
    } else {
        stake_token(
            user,
            pool.id,
            &pool.stake_token,
            &pool.receipt_token,
            amount,
        )
    }
}

/// A decoded account field.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Field {
    U64(u64),
    Pubkey(Pubkey),
    Bool(bool),
}

/// Decode a `Pool` or `ClaimRecord` account's raw data into its IDL fields, in order.
pub fn decode_account(name: &str, data: &[u8]) -> Result<BTreeMap<String, Field>, Error> {
    let idl = idl();
    let discriminator = idl["accounts"]
        .as_array()
        .and_then(|all| all.iter().find(|a| a["name"] == name))
        .map(|a| bytes_of(&a["discriminator"]))
        .ok_or_else(|| Error::UnknownAccount(name.to_string()))?;
    let fields = idl["types"]
        .as_array()
        .and_then(|all| all.iter().find(|t| t["name"] == name))
        .and_then(|t| t["type"]["fields"].as_array())
        .ok_or_else(|| Error::UnknownAccount(name.to_string()))?;
    if data.len() < 8 || data[..8] != discriminator[..] {
        return Err(Error::WrongDiscriminator(name.to_string()));
    }
    let mut out = BTreeMap::new();
    let mut offset = 8;
    for field in fields {
        let kind = field["type"].as_str().unwrap_or("");
        let size = match kind {
            "u64" => 8,
            "pubkey" => 32,
            "bool" => 1,
            other => panic!("unsupported IDL type {other}"),
        };
        let chunk = data
            .get(offset..offset + size)
            .ok_or_else(|| Error::TooShort(name.to_string()))?;
        let value = match kind {
            "u64" => Field::U64(u64::from_le_bytes(chunk.try_into().unwrap())),
            "pubkey" => Field::Pubkey(Pubkey::from_slice(chunk)?),
            _ => Field::Bool(chunk[0] != 0),
        };
        out.insert(field["name"].as_str().unwrap().to_string(), value);
        offset += size;
    }
    Ok(out)
}

/// A Synatra pool account. Rates are integers scaled by 100000.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pool {
    pub id: u64,
    pub manager: Pubkey,
    pub oracle: Pubkey,
    pub stake_token: Pubkey,
    pub receipt_token: Pubkey,
    pub stake_rate: u64,
    pub unstake_rate: u64,
    pub receipt_max_supply: u64,
    pub nonce: u64,
}

/// A claim opened by an unstake; `fulfilled` means it has been paid.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaimRecord {
    pub pool_id: u64,
    pub claimer: Pubkey,
    pub nonce: u64,
    pub receipt_amount: u64,
    pub unstake_rate: u64,
    pub fulfilled: bool,
}

fn u64_of(m: &BTreeMap<String, Field>, k: &str) -> u64 {
    match m.get(k) {
        Some(Field::U64(v)) => *v,
        _ => panic!("the IDL account has u64 field {k}"),
    }
}

fn key_of(m: &BTreeMap<String, Field>, k: &str) -> Pubkey {
    match m.get(k) {
        Some(Field::Pubkey(v)) => *v,
        _ => panic!("the IDL account has pubkey field {k}"),
    }
}

impl Pool {
    pub fn decode(data: &[u8]) -> Result<Self, Error> {
        let m = decode_account("Pool", data)?;
        Ok(Pool {
            id: u64_of(&m, "id"),
            manager: key_of(&m, "manager"),
            oracle: key_of(&m, "oracle"),
            stake_token: key_of(&m, "stake_token"),
            receipt_token: key_of(&m, "receipt_token"),
            stake_rate: u64_of(&m, "stake_rate"),
            unstake_rate: u64_of(&m, "unstake_rate"),
            receipt_max_supply: u64_of(&m, "receipt_max_supply"),
            nonce: u64_of(&m, "nonce"),
        })
    }
}

impl ClaimRecord {
    pub fn decode(data: &[u8]) -> Result<Self, Error> {
        let m = decode_account("ClaimRecord", data)?;
        Ok(ClaimRecord {
            pool_id: u64_of(&m, "pool_id"),
            claimer: key_of(&m, "claimer"),
            nonce: u64_of(&m, "nonce"),
            receipt_amount: u64_of(&m, "receipt_amount"),
            unstake_rate: u64_of(&m, "unstake_rate"),
            fulfilled: matches!(m.get("fulfilled"), Some(Field::Bool(true))),
        })
    }
}
