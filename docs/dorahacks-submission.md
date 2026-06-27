# DoraHacks Submission Pack

## Project

Forg3t StellarZK

## Links

- Live app: https://stellarhacks.forg3t.io
- Demo video: https://youtu.be/VyWUI4u_4k0
- GitHub: https://github.com/Alvinagile/Stellarzk

## One-liner

Private proof receipts for AI deletion workflows, anchored on Stellar without exposing raw user data.

## Problem

Enterprises can delete records, but AI systems may still resurface learned or retrieved personal data. The missing piece is an audit-ready proof flow that proves a scoped deletion workflow changed observable behavior without revealing the sensitive deletion target to every reviewer.

## Solution

Forg3t StellarZK compiles a deletion request into:

- a private witness containing the exact target and salt
- a target commitment
- redacted validation signals
- a Merkle evidence root
- a threshold proof receipt
- a Stellar-ready anchor payload

The app intentionally refuses to fabricate transaction hashes. Live runs generate a real OpenAI Assistant suppression attempt, a verified Groth16 threshold proof, a Supabase evidence row, and a Stellar testnet anchor transaction.

## Demo Script

1. Open the app.
2. Enter an OpenAI Assistant ID and API key for the run.
3. Enter the sensitive target and deletion request.
4. Run black-box suppression from the home screen.
5. Inspect the evidence bundle: no raw target, raw prompt, Assistant output, or API key is exported.
6. Confirm the Groth16 proof status and Stellar tx hash.
7. Download the JSON evidence bundle.
8. Review `circuits/suppression_threshold.circom`, `zk-artifacts`, and `contracts/forg3t_zk_anchor`.

## Why Stellar

Stellar is used as the public attestation layer for proof metadata. Sensitive targets, prompts, and customer outputs remain off-chain. The chain receives only commitments that let an auditor verify that a redacted evidence state existed.

## What is Real Today

- React product flow
- WebCrypto SHA-256 commitments
- Merkle evidence root generation
- Downloadable and locally verifiable JSON evidence bundles
- Server-side OpenAI Assistant black-box suppression runner
- Groth16 proof generation and verification through `snarkjs`
- Committed Circom artifacts for the threshold proof
- Supabase persistence in `stellarzk_evidence_runs`
- Soroban anchor contract deployed on Stellar testnet
- Real Stellar testnet transactions from live runs

## Deployed Proof Anchors

```text
Contract ID: CDZ77TVJGUTWUXOY7YDTDBA5BXEISRCBLJPDJ5J5FEFIYV2LCFOH5CHD
WASM hash:   376447396138DE9D09A6118B3DF77EB0BE7B31CBE9DE274150BDA614E7D6FC54
Deploy tx:   3d0553be33d5f1c65c0630b12bfe95ea56224336736293749eb95d357b3d21e8
Smoke tx:    5eac7018243d72b2c8d2939b03e14051a2ce0c803c4a9c859913833c5c84e7e5
SDK tx:      4c4f39f1e054a14d3e67e5eb0d4badd0b02e5a0fa02779237d078e980693d214
```
