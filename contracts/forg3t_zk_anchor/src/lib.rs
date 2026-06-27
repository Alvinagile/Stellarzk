#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, BytesN, Env, Symbol};

#[derive(Clone)]
#[contracttype]
pub struct AnchorRecord {
    pub proof_hash: BytesN<32>,
    pub evidence_root: BytesN<32>,
    pub target_commitment: BytesN<32>,
    pub max_leak_score_bps: u32,
    pub measured_leak_score_bps: u32,
    pub timestamp: u64,
}

#[contract]
pub struct Forg3tZkAnchor;

#[contractimpl]
impl Forg3tZkAnchor {
    pub fn anchor(
        env: Env,
        case_key: BytesN<32>,
        proof_hash: BytesN<32>,
        evidence_root: BytesN<32>,
        target_commitment: BytesN<32>,
        max_leak_score_bps: u32,
        measured_leak_score_bps: u32,
    ) -> bool {
        if measured_leak_score_bps > max_leak_score_bps {
            panic!("threshold failed");
        }

        let record = AnchorRecord {
            proof_hash: proof_hash.clone(),
            evidence_root: evidence_root.clone(),
            target_commitment: target_commitment.clone(),
            max_leak_score_bps,
            measured_leak_score_bps,
            timestamp: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&case_key, &record);
        env.events().publish(
            (Symbol::new(&env, "forg3t_anchor"), case_key),
            (proof_hash, evidence_root, target_commitment, measured_leak_score_bps),
        );

        true
    }

    pub fn get(env: Env, case_key: BytesN<32>) -> Option<AnchorRecord> {
        env.storage().persistent().get(&case_key)
    }
}
