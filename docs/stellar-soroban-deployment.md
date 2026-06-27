# Stellar Soroban Deployment

## Network

Stellar testnet.

## Contract

```text
Contract ID: CDZ77TVJGUTWUXOY7YDTDBA5BXEISRCBLJPDJ5J5FEFIYV2LCFOH5CHD
Source:      contracts/forg3t_zk_anchor
WASM:        target/stellar/forg3t_zk_anchor.wasm
WASM hash:   376447396138DE9D09A6118B3DF77EB0BE7B31CBE9DE274150BDA614E7D6FC54
Deployer:    GDQWJ3IM6UWJGOE4XGPJMGD6THEWTHE6S6PVLJ4KZZWUIJJRBQ2DAIBA
```

## Transactions

```text
WASM upload tx:      6ed4315a91fc566b58bd933e662e8315e0ee418f119c3f05cdee2022d2234b20
Contract deploy tx: 3d0553be33d5f1c65c0630b12bfe95ea56224336736293749eb95d357b3d21e8
CLI smoke invoke:   5eac7018243d72b2c8d2939b03e14051a2ce0c803c4a9c859913833c5c84e7e5
SDK smoke invoke:   4c4f39f1e054a14d3e67e5eb0d4badd0b02e5a0fa02779237d078e980693d214
```

## Anchor Statement

The `anchor` function stores:

- `proof_hash`
- `evidence_root`
- `target_commitment`
- `max_leak_score_bps`
- `measured_leak_score_bps`
- `timestamp`

The contract rejects an anchor when `measured_leak_score_bps > max_leak_score_bps`.

Live Netlify suppression runs call this contract through Stellar RPC using a fresh funded testnet account, then include the returned transaction hash in the redacted evidence bundle.
