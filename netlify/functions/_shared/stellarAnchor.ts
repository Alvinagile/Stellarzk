import { createHash } from 'node:crypto';
import {
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';

const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
export const FORG3T_ZK_ANCHOR_CONTRACT_ID = 'CDZ77TVJGUTWUXOY7YDTDBA5BXEISRCBLJPDJ5J5FEFIYV2LCFOH5CHD';

export interface StellarAnchorInput {
  evidenceRoot: string;
  proofHash: string;
  targetCommitment: string;
  maxLeakScoreBps: number;
  measuredLeakScoreBps: number;
}

export interface StellarAnchorResult {
  network: 'testnet';
  mode: 'soroban' | 'manageData';
  status: 'submitted';
  sourceAccount: string;
  txHash: string;
  explorer: string;
  contractId?: string;
  fallbackReason?: string;
}

function hexBytes(value: string) {
  return Buffer.from(value.replace(/^0x/, '').slice(0, 64), 'hex');
}

function sha256Bytes(value: string) {
  return createHash('sha256').update(value).digest();
}

async function fundTestnetAccount(publicKey: string) {
  const friendbot = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  if (!friendbot.ok) {
    const text = await friendbot.text();
    throw new Error(`Friendbot funding failed: ${text.slice(0, 240)}`);
  }
}

async function waitForSorobanSuccess(hash: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    const response = await fetch(SOROBAN_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `forg3t-${attempt}`,
        method: 'getTransaction',
        params: { hash },
      }),
    });

    if (!response.ok) {
      continue;
    }

    const payload = await response.json() as { result?: { status?: string }; error?: { message?: string } };
    const status = payload.result?.status;
    if (status === 'SUCCESS') {
      return;
    }
    if (status === 'FAILED') {
      throw new Error(`Soroban anchor failed: ${payload.error?.message ?? hash}`);
    }
  }

  throw new Error(`Soroban anchor confirmation timed out: ${hash}`);
}

async function submitSorobanAnchor(input: StellarAnchorInput): Promise<StellarAnchorResult> {
  const source = Keypair.random();
  const publicKey = source.publicKey();
  await fundTestnetAccount(publicKey);

  const server = new rpc.Server(SOROBAN_RPC_URL);
  const account = await server.getAccount(publicKey);
  const transaction = new TransactionBuilder(account, {
    fee: String(BASE_FEE),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.invokeContractFunction({
      contract: FORG3T_ZK_ANCHOR_CONTRACT_ID,
      function: 'anchor',
      args: [
        xdr.ScVal.scvBytes(sha256Bytes(`${input.evidenceRoot}:${input.proofHash}:${input.targetCommitment}`)),
        xdr.ScVal.scvBytes(hexBytes(input.proofHash)),
        xdr.ScVal.scvBytes(hexBytes(input.evidenceRoot)),
        xdr.ScVal.scvBytes(hexBytes(input.targetCommitment)),
        nativeToScVal(input.maxLeakScoreBps, { type: 'u32' }),
        nativeToScVal(input.measuredLeakScoreBps, { type: 'u32' }),
      ],
    }))
    .setTimeout(180)
    .build();

  const prepared = await server.prepareTransaction(transaction);
  prepared.sign(source);
  const submitted = await server.sendTransaction(prepared);

  if (submitted.status === 'ERROR') {
    throw new Error(`Soroban anchor rejected: ${submitted.errorResultXdr ?? submitted.hash}`);
  }

  await waitForSorobanSuccess(submitted.hash);

  return {
    network: 'testnet',
    mode: 'soroban',
    status: 'submitted',
    sourceAccount: publicKey,
    txHash: submitted.hash,
    explorer: `https://stellar.expert/explorer/testnet/tx/${submitted.hash}`,
    contractId: FORG3T_ZK_ANCHOR_CONTRACT_ID,
  };
}

async function submitManageDataAnchor(input: StellarAnchorInput, fallbackReason?: string): Promise<StellarAnchorResult> {
  const source = Keypair.random();
  const publicKey = source.publicKey();
  await fundTestnetAccount(publicKey);

  const server = new Horizon.Server('https://horizon-testnet.stellar.org');
  const account = await server.loadAccount(publicKey);
  const fee = await server.fetchBaseFee().catch(() => Number(BASE_FEE));
  const transaction = new TransactionBuilder(account, {
    fee: String(fee),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.manageData({ name: 'forg3t:evidence', value: hexBytes(input.evidenceRoot) }))
    .addOperation(Operation.manageData({ name: 'forg3t:proof', value: hexBytes(input.proofHash) }))
    .addOperation(Operation.manageData({ name: 'forg3t:target', value: hexBytes(input.targetCommitment) }))
    .addMemo(Memo.text('Forg3t ZK'))
    .setTimeout(180)
    .build();

  transaction.sign(source);
  const submitted = await server.submitTransaction(transaction);
  const txHash = submitted.hash;

  return {
    network: 'testnet',
    mode: 'manageData',
    status: 'submitted',
    sourceAccount: publicKey,
    txHash,
    explorer: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
    contractId: FORG3T_ZK_ANCHOR_CONTRACT_ID,
    fallbackReason,
  };
}

export async function submitStellarAnchor(input: StellarAnchorInput): Promise<StellarAnchorResult> {
  try {
    return await submitSorobanAnchor(input);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown Soroban RPC error';
    return submitManageDataAnchor(input, reason);
  }
}
