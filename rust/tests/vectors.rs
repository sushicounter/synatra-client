//! Check the Rust client against the JS client's reference vectors (test/vectors.json).

use base64::Engine;
use serde_json::Value;
use synatra_client::*;

fn vectors() -> Value {
    let text = include_str!("../../test/vectors.json");
    serde_json::from_str(text).unwrap()
}

fn key(v: &Value) -> Pubkey {
    v.as_str().unwrap().parse().unwrap()
}

fn data(v: &Value) -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode(v.as_str().unwrap())
        .unwrap()
}

fn check(ix: Instruction, name: &str) {
    let v = vectors();
    let want = v["instructions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["name"] == name)
        .unwrap()
        .clone();
    assert_eq!(ix.program_id, program_id());
    let keys: Vec<Value> = ix
        .accounts
        .iter()
        .map(|m| {
            serde_json::json!({
                "pubkey": m.pubkey.to_string(),
                "signer": m.is_signer,
                "writable": m.is_writable,
            })
        })
        .collect();
    assert_eq!(Value::Array(keys), want["keys"], "{name} keys");
    let hex: String = ix.data.iter().map(|b| format!("{b:02x}")).collect();
    assert_eq!(hex, want["data"].as_str().unwrap(), "{name} data");
}

#[test]
fn bundled_idl_matches_repo_idl() {
    let root: Value = serde_json::from_str(include_str!("../../synatra-idl.json")).unwrap();
    assert_eq!(idl(), &root);
    assert_eq!(
        program_id().to_string(),
        vectors()["programId"].as_str().unwrap()
    );
}

#[test]
fn pdas() {
    let v = vectors();
    for p in v["pdas"].as_array().unwrap() {
        let seed = p["seed"].as_str().unwrap();
        let (address, bump) = find_program_address(&[seed.as_bytes()], &program_id()).unwrap();
        assert_eq!(address, key(&p["address"]), "{seed}");
        assert_eq!(bump as u64, p["bump"].as_u64().unwrap(), "{seed}");
    }
    assert_eq!(global_address(), key(&v["pdas"][0]["address"]));
    assert_eq!(pool_address(1), key(&v["pdas"][2]["address"]));
    assert_eq!(claim_address(1, 42), key(&v["pdas"][4]["address"]));
    assert!(key(&v["user"]).is_on_curve());
    assert!(!pool_address(0).is_on_curve());
}

#[test]
fn atas() {
    for a in vectors()["atas"].as_array().unwrap() {
        let ata = associated_token_address(&key(&a["owner"]), &key(&a["mint"]));
        assert_eq!(ata, key(&a["address"]));
    }
}

#[test]
fn instructions() {
    let v = vectors();
    let user = key(&v["user"]);
    let usdc = key(&v["atas"][1]["mint"]);
    let (ysol, yusd) = (key(&v["receiptMints"][0]), key(&v["receiptMints"][1]));
    check(
        stake_sol(&user, 0, &ysol, 1_000_000_000).unwrap(),
        "stake_sol",
    );
    check(
        stake_token(&user, 1, &usdc, &yusd, 1_000_000_000).unwrap(),
        "stake_token",
    );
    check(
        unstake(&user, 1, &yusd, 42, 1_000_000_000).unwrap(),
        "unstake",
    );
    let pool = Pool::decode(&data(&v["accounts"][0]["data"])).unwrap();
    check(stake(&pool, &user, 1_000_000_000).unwrap(), "stake_token");
    assert_eq!(stake_sol(&user, 0, &ysol, 0), Err(Error::ZeroAmount));
}

#[test]
fn accounts() {
    let v = vectors();
    for a in v["accounts"].as_array().unwrap() {
        let name = a["name"].as_str().unwrap();
        let decoded = decode_account(name, &data(&a["data"])).unwrap();
        let fields = a["fields"].as_object().unwrap();
        assert_eq!(decoded.len(), fields.len(), "{name}");
        for (k, want) in fields {
            let got = &decoded[k];
            let expected = match want {
                Value::Bool(b) => Field::Bool(*b),
                Value::String(s) if s.len() < 32 => Field::U64(s.parse().unwrap()),
                Value::String(s) => Field::Pubkey(s.parse().unwrap()),
                _ => unreachable!(),
            };
            assert_eq!(got, &expected, "{name}.{k}");
        }
    }
    let pool = Pool::decode(&data(&v["accounts"][0]["data"])).unwrap();
    assert_eq!(pool.receipt_max_supply, u64::MAX);
    let claim = ClaimRecord::decode(&data(&v["accounts"][1]["data"])).unwrap();
    assert!(claim.fulfilled);
    assert_eq!(claim.receipt_amount, 2_500_000);
}

#[test]
fn rejects_bad_account_data() {
    let v = vectors();
    let pool = data(&v["accounts"][0]["data"]);
    let claim = data(&v["accounts"][1]["data"]);
    assert!(matches!(
        Pool::decode(&claim),
        Err(Error::WrongDiscriminator(_))
    ));
    for cut in [4, 12, 40, pool.len() - 1] {
        assert!(Pool::decode(&pool[..cut]).is_err(), "cut at {cut}");
    }
}
