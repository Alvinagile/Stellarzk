import { Networks, TransactionBuilder, Operation, Asset, Memo, Keypair } from '@stellar/stellar-sdk';
import type { CompiledEvidence } from './evidence';

export interface StellarDraft {
  status: 'ready' | 'not_configured';
  network: 'testnet';
  message: string;
  xdr?: string;
}

export function buildStellarManageDataDraft(evidence: CompiledEvidence): StellarDraft {
  const sourceSecret = import.meta.env.VITE_STELLAR_TESTNET_SOURCE_SECRET as string | undefined;

  if (!sourceSecret) {
    return {
      status: 'not_configured',
      network: 'testnet',
      message: 'Set VITE_STELLAR_TESTNET_SOURCE_SECRET in a local env file to build a signed testnet transaction. The app never fabricates a transaction hash.',
    };
  }

  const source = Keypair.fromSecret(sourceSecret);
  const account = {
    accountId: () => source.publicKey(),
    sequenceNumber: () => '0',
    incrementSequenceNumber: () => undefined,
  };

  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.manageData({
        name: 'forg3t:evidence',
        value: evidence.evidenceRoot.replace(/^0x/, '').slice(0, 64),
      }),
    )
    .addOperation(
      Operation.manageData({
        name: 'forg3t:proof',
        value: evidence.proofReceipt.proofHash.replace(/^0x/, '').slice(0, 64),
      }),
    )
    .addMemo(Memo.text('Forg3t StellarZK'))
    .setTimeout(300)
    .build();

  tx.sign(source);

  return {
    status: 'ready',
    network: 'testnet',
    message: `Signed manageData draft for ${Asset.native().getCode()} testnet account ${source.publicKey()}. Submit it after funding and sequence replacement in production tooling.`,
    xdr: tx.toXDR(),
  };
}
