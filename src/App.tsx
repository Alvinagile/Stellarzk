import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Download,
  FileJson,
  Gauge,
  Github,
  Layers3,
  Link2,
  LockKeyhole,
  Network,
  Play,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { StatusBadge } from './components/StatusBadge';
import {
  compileEvidence,
  defaultInput,
  downloadBundle,
  type CompiledEvidence,
  type EvidenceInput,
  type ExecutionLane,
  sha256Hex,
} from './lib/evidence';
import { getSupabaseRuntime } from './lib/supabase';
import { buildStellarManageDataDraft, type StellarDraft } from './lib/stellar';

type TabId = 'command' | 'workbench' | 'evidence' | 'stellar' | 'submission';

const tabs: Array<{ id: TabId; label: string; icon: typeof Brain }> = [
  { id: 'command', label: 'Command Center', icon: Gauge },
  { id: 'workbench', label: 'ZK Workbench', icon: Brain },
  { id: 'evidence', label: 'Evidence Bundle', icon: FileJson },
  { id: 'stellar', label: 'Stellar Anchor', icon: Network },
  { id: 'submission', label: 'DoraHacks Pack', icon: ShieldCheck },
];

const lanes: Array<{ id: ExecutionLane; title: string; detail: string }> = [
  {
    id: 'rag_retrieval',
    title: 'RAG retrieval revocation',
    detail: 'Revokes indexed documents, reruns retrieval checks, exports redacted evidence.',
  },
  {
    id: 'assistant_black_box',
    title: 'Assistant black-box suppression',
    detail: 'Measures post-policy leakage without exporting the target string.',
  },
  {
    id: 'white_box_adapter',
    title: 'White-box adapter mutation',
    detail: 'Binds local adapter mutation and validation summary to a proof receipt.',
  },
];

function Field({
  label,
  value,
  onChange,
  multiline,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: 'text' | 'number';
}) {
  const baseClass =
    'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-[#111111] outline-none transition focus:border-[#2F80ED] focus:ring-4 focus:ring-blue-50';

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className={baseClass} />
      ) : (
        <input value={value} type={type} onChange={(event) => onChange(event.target.value)} className={baseClass} />
      )}
    </label>
  );
}

function Metric({ label, value, icon: Icon, tone = 'blue' }: { label: string; value: string; icon: typeof Brain; tone?: 'blue' | 'dark' | 'green' }) {
  const colors = {
    blue: 'bg-[#F2F7FF] text-[#2F80ED]',
    dark: 'bg-gray-100 text-[#111111]',
    green: 'bg-emerald-50 text-emerald-700',
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-[#4B4B4B]">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-[#111111]">{value}</p>
        </div>
        <div className={`rounded-2xl p-3 ${colors[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function HashBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</div>
      <div className="mt-2 break-all font-mono text-xs leading-5 text-[#111111]">{value ?? 'Generate evidence to compute this value.'}</div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('command');
  const [input, setInput] = useState<EvidenceInput>(defaultInput);
  const [compiled, setCompiled] = useState<CompiledEvidence | null>(null);
  const [stellarDraft, setStellarDraft] = useState<StellarDraft | null>(null);
  const [uploadedStatus, setUploadedStatus] = useState<string>('');
  const supabaseRuntime = getSupabaseRuntime();

  const thresholdPassed = input.afterLeakScoreBps <= input.maxLeakScoreBps;
  const leakReduction = useMemo(() => {
    const delta = input.beforeLeakScoreBps - input.afterLeakScoreBps;
    return Math.max(0, (delta / Math.max(input.beforeLeakScoreBps, 1)) * 100).toFixed(1);
  }, [input.afterLeakScoreBps, input.beforeLeakScoreBps]);

  useEffect(() => {
    void compileEvidence(input).then((result) => {
      setCompiled(result);
      setStellarDraft(buildStellarManageDataDraft(result));
    });
  }, [input]);

  const setNumber = (key: keyof EvidenceInput, value: string) => {
    const parsed = Number(value);
    setInput((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const verifyUpload = async (file: File) => {
    if (!compiled) {
      return;
    }

    const localHash = await sha256Hex(file);
    setUploadedStatus(localHash === compiled.evidenceHash ? 'PASS: uploaded bundle hash matches the current evidence hash.' : `MISMATCH: uploaded ${localHash} does not match ${compiled.evidenceHash}.`);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-[#111111]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-gray-200 bg-white md:flex md:flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-gray-200 px-5">
          <img src="/assets/forg3t-logo.png" alt="Forg3t Protocol" className="h-9 w-auto" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">Forg3t StellarZK</div>
            <div className="truncate text-xs text-[#4B4B4B]">Real-World ZK on Stellar</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center rounded-md px-3 py-2.5 text-left text-sm font-medium transition ${
                  active ? 'bg-[#2F80ED]/10 text-[#2F80ED]' : 'text-[#4B4B4B] hover:bg-gray-50 hover:text-[#111111]'
                }`}
              >
                <Icon className={`mr-3 h-5 w-5 ${active ? 'text-[#2F80ED]' : 'text-gray-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-gray-200 p-5">
          <div className="rounded-2xl border border-blue-100 bg-[#F8FBFF] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2F80ED]">Hackathon Window</div>
            <div className="mt-2 text-sm font-semibold">Jun 15 - Jul 3, 2026</div>
            <div className="mt-1 text-xs text-[#4B4B4B]">Stellar Hacks: Real-World ZK</div>
          </div>
        </div>
      </aside>

      <main className="md:pl-72">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#2F80ED]">
                <Sparkles className="h-3.5 w-3.5" />
                Built for DoraHacks Stellar ZK
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">AI deletion proof desk for Stellar</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#4B4B4B] md:text-base">
                Forg3t turns a deletion request into a private witness, a redacted evidence root, a threshold proof receipt, and a Stellar-ready anchor package.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#111111]">
                <ShieldCheck className={`mr-2 h-4 w-4 ${supabaseRuntime.configured ? 'text-emerald-600' : 'text-amber-600'}`} />
                {supabaseRuntime.label}
              </div>
              <button
                onClick={() => setActiveTab('workbench')}
                className="inline-flex items-center rounded-xl bg-[#2F80ED] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2870CE]"
              >
                Open proof flow
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
              <a
                href="https://github.com/Alvinagile/Stellarzk"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-[#111111] transition hover:border-[#2F80ED] hover:text-[#2F80ED]"
              >
                <Github className="mr-2 h-4 w-4" />
                Repo
              </a>
            </div>
          </div>
        </header>

        <div className="px-4 py-6 md:px-8">
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1 md:hidden">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex shrink-0 items-center rounded-xl border px-3 py-2 text-sm font-semibold ${
                    activeTab === tab.id ? 'border-[#2F80ED] bg-[#EFF6FF] text-[#2F80ED]' : 'border-gray-200 bg-white text-[#4B4B4B]'
                  }`}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.section
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              {activeTab === 'command' && (
                <>
                  <section className="rounded-[28px] border border-gray-200 bg-gradient-to-br from-white via-[#F5F9FF] to-[#EEF6FF] p-6 shadow-sm md:p-8">
                    <div className="grid gap-8 xl:grid-cols-[1.35fr,1fr]">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2F80ED]">Why this wins the category</p>
                        <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">Delete is easy. Proving the AI stopped surfacing it is the hard part.</h2>
                        <p className="mt-4 max-w-2xl text-[#4B4B4B]">
                          The pitch deck wedge is preserved: enterprises need deletion workflows, validation, and audit-ready proof. The StellarZK version adds a privacy boundary so auditors can verify the claim without receiving raw target data.
                        </p>
                        <div className="mt-6 grid gap-3 sm:grid-cols-3">
                          <StatusBadge tone="pass">No raw target exported</StatusBadge>
                          <StatusBadge tone={thresholdPassed ? 'pass' : 'blocked'}>{thresholdPassed ? 'Threshold passed' : 'Threshold failed'}</StatusBadge>
                          <StatusBadge tone={supabaseRuntime.configured ? 'pass' : 'warning'}>{supabaseRuntime.host}</StatusBadge>
                        </div>
                      </div>
                      <div className="grid gap-3">
                        <HashBlock label="Evidence root" value={compiled?.evidenceRoot} />
                        <HashBlock label="Target commitment" value={compiled?.targetCommitment} />
                        <HashBlock label="Proof receipt hash" value={compiled?.proofReceipt.proofHash} />
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Metric label="Leak reduction" value={`${leakReduction}%`} icon={Gauge} tone="green" />
                    <Metric label="Post-unlearning score" value={`${input.afterLeakScoreBps} bps`} icon={ShieldCheck} />
                    <Metric label="Validation prompts" value={`${input.validationPrompts}`} icon={Workflow} />
                    <Metric label="Revoked documents" value={`${input.retrievalDocumentsRevoked}`} icon={Layers3} tone="dark" />
                  </section>

                  <section className="grid gap-6 xl:grid-cols-[1.1fr,1fr]">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-xl font-bold">Execution lanes</h3>
                      <div className="mt-5 grid gap-3">
                        {lanes.map((lane) => (
                          <button
                            key={lane.id}
                            onClick={() => setInput((current) => ({ ...current, executionLane: lane.id }))}
                            className={`rounded-xl border p-4 text-left transition ${
                              input.executionLane === lane.id ? 'border-[#2F80ED] bg-[#F8FBFF]' : 'border-gray-200 bg-white hover:border-[#B6D5FF]'
                            }`}
                          >
                            <div className="font-semibold">{lane.title}</div>
                            <div className="mt-1 text-sm text-[#4B4B4B]">{lane.detail}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-xl font-bold">Privacy statement</h3>
                      <p className="mt-3 text-sm leading-6 text-[#4B4B4B]">
                        The private witness contains the exact deletion target and salt. The exported bundle contains only a target commitment, validation aggregates, Merkle leaves, and proof receipt metadata. That is the product point: auditors get verifiability, users keep privacy.
                      </p>
                      <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-center gap-3">
                          <LockKeyhole className="h-5 w-5 text-[#2F80ED]" />
                          <div>
                            <div className="font-semibold">Private by construction</div>
                            <div className="text-sm text-[#4B4B4B]">The target string is never written into the downloadable JSON bundle.</div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="h-5 w-5 text-emerald-600" />
                          <div>
                            <div className="font-semibold">Same Forg3t Supabase env</div>
                            <div className="text-sm text-[#4B4B4B]">
                              Uses the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values from the Avax app.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {activeTab === 'workbench' && (
                <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                  <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-bold">ZK witness workbench</h2>
                        <p className="mt-2 text-sm leading-6 text-[#4B4B4B]">Edit the real deletion case inputs. Every hash, root, and receipt updates locally through WebCrypto.</p>
                      </div>
                      <button
                        onClick={() => void compileEvidence(input).then(setCompiled)}
                        className="inline-flex items-center rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2B2B2B]"
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Recompute
                      </button>
                    </div>
                    <div className="mt-6 grid gap-4">
                      <Field label="Requester" value={input.requester} onChange={(value) => setInput((current) => ({ ...current, requester: value }))} />
                      <Field label="Environment" value={input.environment} onChange={(value) => setInput((current) => ({ ...current, environment: value }))} />
                      <Field label="Deletion reason" value={input.requestReason} multiline onChange={(value) => setInput((current) => ({ ...current, requestReason: value }))} />
                      <Field label="Private target witness" value={input.hiddenTarget} multiline onChange={(value) => setInput((current) => ({ ...current, hiddenTarget: value }))} />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Target salt" value={input.targetSalt} onChange={(value) => setInput((current) => ({ ...current, targetSalt: value }))} />
                        <Field label="Artifact mutation" value={input.modelArtifactMutation} onChange={(value) => setInput((current) => ({ ...current, modelArtifactMutation: value }))} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="Before leak bps" type="number" value={input.beforeLeakScoreBps} onChange={(value) => setNumber('beforeLeakScoreBps', value)} />
                        <Field label="After leak bps" type="number" value={input.afterLeakScoreBps} onChange={(value) => setNumber('afterLeakScoreBps', value)} />
                        <Field label="Max leak bps" type="number" value={input.maxLeakScoreBps} onChange={(value) => setNumber('maxLeakScoreBps', value)} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Validation prompts" type="number" value={input.validationPrompts} onChange={(value) => setNumber('validationPrompts', value)} />
                        <Field label="Revoked documents" type="number" value={input.retrievalDocumentsRevoked} onChange={(value) => setNumber('retrievalDocumentsRevoked', value)} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-xl font-bold">Circuit statement</h3>
                      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm leading-6 text-[#111111]">
                        Prove that the private target is committed, the redacted evidence root is bound, and the measured post-unlearning leak score is less than or equal to the public threshold.
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <StatusBadge tone={thresholdPassed ? 'pass' : 'blocked'}>{thresholdPassed ? 'Constraint pass' : 'Constraint fail'}</StatusBadge>
                        <StatusBadge tone="ready">Circuit file included</StatusBadge>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-xl font-bold">Public signals</h3>
                      <div className="mt-4 space-y-3">
                        <HashBlock label="Measured score" value={`${compiled?.publicSignals.measuredLeakScoreBps ?? input.afterLeakScoreBps} bps`} />
                        <HashBlock label="Max score" value={`${compiled?.publicSignals.maxLeakScoreBps ?? input.maxLeakScoreBps} bps`} />
                        <HashBlock label="Evidence root" value={compiled?.evidenceRoot} />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'evidence' && (
                <section className="grid gap-6 xl:grid-cols-[1fr,1fr]">
                  <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-2xl font-bold">Evidence bundle</h2>
                        <p className="mt-2 text-sm text-[#4B4B4B]">Download the exact JSON artifact used for local verification and Stellar anchoring.</p>
                      </div>
                      <button
                        onClick={() => compiled && downloadBundle(compiled.bundle)}
                        disabled={!compiled}
                        className="inline-flex items-center rounded-xl bg-[#2F80ED] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2870CE] disabled:opacity-50"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download JSON
                      </button>
                    </div>
                    <div className="mt-5 grid gap-3">
                      <HashBlock label="Case id" value={compiled?.caseId} />
                      <HashBlock label="Evidence hash" value={compiled?.evidenceHash} />
                      <HashBlock label="Private witness hash" value={compiled?.privateWitnessHash} />
                    </div>
                    <div className="mt-5 rounded-xl border border-dashed border-[#B6D5FF] bg-[#F8FBFF] p-5">
                      <label className="flex cursor-pointer flex-col items-center justify-center text-center">
                        <FileJson className="h-7 w-7 text-[#2F80ED]" />
                        <span className="mt-2 text-sm font-semibold">Verify a downloaded bundle</span>
                        <span className="mt-1 text-xs text-[#4B4B4B]">Choose the JSON you downloaded from this app.</span>
                        <input
                          type="file"
                          accept="application/json,.json"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void verifyUpload(file);
                          }}
                        />
                      </label>
                      {uploadedStatus && <div className="mt-4 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">{uploadedStatus}</div>}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="text-xl font-bold">Bundle preview</h3>
                    <pre className="mt-4 max-h-[560px] overflow-auto rounded-xl bg-gray-950 p-4 text-xs leading-5 text-gray-100">
                      {JSON.stringify(compiled?.bundle ?? {}, null, 2)}
                    </pre>
                  </div>
                </section>
              )}

              {activeTab === 'stellar' && (
                <section className="grid gap-6 xl:grid-cols-[1fr,1fr]">
                  <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-[#F2F7FF] p-3 text-[#2F80ED]">
                        <Link2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">Stellar anchor path</h2>
                        <p className="text-sm text-[#4B4B4B]">No fake transaction hashes. It builds a real draft only when a local testnet secret exists.</p>
                      </div>
                    </div>
                    <div className="mt-6 grid gap-3">
                      <HashBlock label="Anchor payload root" value={compiled?.evidenceRoot} />
                      <HashBlock label="Anchor proof hash" value={compiled?.proofReceipt.proofHash} />
                      <HashBlock label="Soroban contract path" value="contracts/forg3t_zk_anchor" />
                    </div>
                    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-[#111111]">
                      {stellarDraft?.message}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="text-xl font-bold">Transaction draft</h3>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <StatusBadge tone={stellarDraft?.status === 'ready' ? 'pass' : 'warning'}>
                        {stellarDraft?.status === 'ready' ? 'Signed XDR ready' : 'Env not configured'}
                      </StatusBadge>
                      <StatusBadge tone="ready">Testnet</StatusBadge>
                    </div>
                    <pre className="mt-4 max-h-[480px] overflow-auto rounded-xl bg-gray-950 p-4 text-xs leading-5 text-gray-100">
                      {stellarDraft?.xdr ?? 'Set VITE_STELLAR_TESTNET_SOURCE_SECRET to generate a signed XDR draft locally.'}
                    </pre>
                  </div>
                </section>
              )}

              {activeTab === 'submission' && (
                <section className="grid gap-6 xl:grid-cols-[1fr,1fr]">
                  <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="text-2xl font-bold">DoraHacks submission narrative</h2>
                    <div className="mt-5 space-y-4">
                      {[
                        ['Problem', 'AI systems can retain or resurface data after record deletion. Enterprises need proof that deletion workflows changed observable model behavior.'],
                        ['Solution', 'Forg3t StellarZK compiles private deletion targets into commitments, redacted evidence roots, threshold proof receipts, and Stellar-ready attestations.'],
                        ['Why Stellar', 'Stellar provides a public, low-friction trust layer for anchoring proof metadata without putting sensitive evidence on-chain.'],
                        ['ZK angle', 'The private witness contains the target and salt. Public signals expose only the threshold, measured score, target commitment, and evidence root.'],
                        ['Demo path', 'Edit the witness, recompute the receipt, download the evidence bundle, verify the bundle hash, and inspect the Stellar anchor draft path.'],
                      ].map(([title, body]) => (
                        <div key={title} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                          <div className="font-semibold">{title}</div>
                          <div className="mt-1 text-sm leading-6 text-[#4B4B4B]">{body}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="text-xl font-bold">Reviewer checklist</h3>
                    <div className="mt-5 space-y-3">
                      {[
                        'Open the app and verify no login wall blocks the core demo.',
                        'Change the private target and confirm target commitment updates.',
                        'Raise after leak score above max threshold and confirm the proof status blocks.',
                        'Download the JSON evidence bundle and re-upload it to verify local hash matching.',
                        'Inspect circuits/suppression_threshold.circom for the ZK threshold statement.',
                        'Inspect contracts/forg3t_zk_anchor for the Soroban anchor contract.',
                      ].map((item) => (
                        <div key={item} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                          <div className="text-sm leading-6 text-[#111111]">{item}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </motion.section>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
