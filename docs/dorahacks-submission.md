# DoraHacks Submission Pack

## Project

Forg3t StellarZK

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

The app intentionally refuses to fabricate transaction hashes. When a local Stellar testnet secret is configured, it builds a signed XDR draft. Otherwise, it shows the exact missing configuration.

## Demo Script

1. Open the app.
2. Go to ZK Workbench.
3. Change the private target witness and observe commitment changes.
4. Raise `after leak bps` above `max leak bps` and observe the threshold failure.
5. Download the evidence JSON.
6. Re-upload the JSON in Evidence Bundle to verify the local hash.
7. Inspect the Stellar Anchor tab.
8. Review `circuits/suppression_threshold.circom` and `contracts/forg3t_zk_anchor`.

## Why Stellar

Stellar is used as the public attestation layer for proof metadata. Sensitive targets, prompts, and customer outputs remain off-chain. The chain receives only commitments that let an auditor verify that a redacted evidence state existed.

## What is Real Today

- React product flow
- WebCrypto SHA-256 commitments
- Merkle evidence root generation
- Downloadable and locally verifiable JSON evidence bundles
- Circom threshold statement
- Soroban anchor contract source
- Stellar SDK XDR draft path gated by local testnet secret

## What Comes Next

- Generate Groth16 artifacts from `circuits/suppression_threshold.circom`
- Deploy `contracts/forg3t_zk_anchor` to Stellar testnet
- Move signed transaction submission to a server-side worker
- Connect live RAG and assistant suppression runners from the existing Forg3t control plane
