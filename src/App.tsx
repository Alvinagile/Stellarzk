import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Brain,
  Download,
  FileJson,
  Gauge,
  Github,
  Layers3,
  Link2,
  Loader2,
  Network,
  Play,
  Server,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { StatusBadge } from './components/StatusBadge';
import {
  compileEvidence,
  defaultInput,
  downloadBundle,
  type CompiledEvidence,
  type EvidenceInput,
  sha256Hex,
} from './lib/evidence';
import { runLiveSuppression, type LiveSuppressionResult } from './lib/liveSuppression';
import { buildStellarManageDataDraft, type StellarDraft } from './lib/stellar';

type TabId = 'command' | 'workbench' | 'evidence' | 'stellar';

const tabs: Array<{ id: TabId; label: string; icon: typeof Brain }> = [
  { id: 'command', label: 'Suppression', icon: Gauge },
  { id: 'workbench', label: 'ZK Workbench', icon: Brain },
  { id: 'evidence', label: 'Evidence Bundle', icon: FileJson },
  { id: 'stellar', label: 'Stellar Anchor', icon: Network },
];

const sorobanContractId = 'CDZ77TVJGUTWUXOY7YDTDBA5BXEISRCBLJPDJ5J5FEFIYV2LCFOH5CHD';
const sorobanDeployTx = '3d0553be33d5f1c65c0630b12bfe95ea56224336736293749eb95d357b3d21e8';
const sorobanInvokeTx = '5eac7018243d72b2c8d2939b03e14051a2ce0c803c4a9c859913833c5c84e7e5';

function Field({
  label,
  value,
  onChange,
  multiline,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  type?: 'text' | 'number' | 'password';
}) {
  const baseClass =
    'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-[#111111] outline-none transition focus:border-[#2F80ED] focus:ring-4 focus:ring-blue-50';

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} placeholder={placeholder} className={baseClass} />
      ) : (
        <input value={value} type={type} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={baseClass} />
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
  const [compiledSource, setCompiledSource] = useState<'local' | 'openai'>('local');
  const [stellarDraft, setStellarDraft] = useState<StellarDraft | null>(null);
  const [uploadedStatus, setUploadedStatus] = useState<string>('');
  const [liveTargetText, setLiveTargetText] = useState('');
  const [liveReason, setLiveReason] = useState('');
  const [liveAssistantId, setLiveAssistantId] = useState('');
  const [liveApiKey, setLiveApiKey] = useState('');
  const [liveResult, setLiveResult] = useState<LiveSuppressionResult | null>(null);
  const [liveError, setLiveError] = useState('');
  const [liveRunning, setLiveRunning] = useState(false);

  const measuredLeakScoreBps = compiled?.publicSignals.measuredLeakScoreBps ?? input.afterLeakScoreBps;
  const baselineLeakScoreBps = liveResult?.run.baselineLeakScoreBps ?? input.beforeLeakScoreBps;
  const maxLeakScoreBps = compiled?.publicSignals.maxLeakScoreBps ?? input.maxLeakScoreBps;
  const validationPrompts = compiled?.publicSignals.validationPrompts ?? input.validationPrompts;
  const thresholdPassed = measuredLeakScoreBps <= maxLeakScoreBps;
  const zkProofVerified = Boolean((compiled?.bundle.zkProof as { verified?: boolean } | null | undefined)?.verified);
  const leakReduction = useMemo(() => {
    const delta = baselineLeakScoreBps - measuredLeakScoreBps;
    return Math.max(0, (delta / Math.max(baselineLeakScoreBps, 1)) * 100).toFixed(1);
  }, [baselineLeakScoreBps, measuredLeakScoreBps]);

  useEffect(() => {
    if (!input.hiddenTarget.trim()) {
      return;
    }

    void compileEvidence(input).then((result) => {
      setCompiled(result);
      setStellarDraft(buildStellarManageDataDraft(result));
      setCompiledSource('local');
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

  const runLiveAssistant = async () => {
    setLiveRunning(true);
    setLiveError('');

    try {
      const result = await runLiveSuppression({
        targetText: liveTargetText,
        requestReason: liveReason,
        requester: input.requester,
        environment: 'OpenAI Assistant black-box suppression runner',
        assistantId: liveAssistantId,
        apiKey: liveApiKey,
      });
      setLiveResult(result);
      setCompiled(result.evidence);
      setStellarDraft(buildStellarManageDataDraft(result.evidence));
      setCompiledSource('openai');
      setLiveApiKey('');
      setActiveTab('evidence');
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : 'Live suppression run failed.');
    } finally {
      setLiveRunning(false);
    }
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
      </aside>

      <main className="md:pl-72">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Assistant black-box suppression</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#4B4B4B] md:text-base">
                Run a real suppression attempt against an OpenAI Assistant, measure observed leakage, and generate a ZK-bound evidence bundle for Stellar anchoring.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void runLiveAssistant()}
                disabled={liveRunning || activeTab !== 'command' || liveTargetText.trim().length < 3 || liveReason.trim().length < 3 || !liveAssistantId.trim() || !liveApiKey.trim()}
                className="inline-flex items-center rounded-xl bg-[#2F80ED] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2870CE] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {liveRunning ? 'Running' : 'Run suppression'}
                {liveRunning ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Play className="ml-2 h-4 w-4" />}
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
                  <section className="max-w-5xl">
                    <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm md:p-8">
                      <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-[#F2F7FF] p-3 text-[#2F80ED]">
                          <Server className="h-6 w-6" />
                        </div>
                        <div>
                          <h2 className="text-3xl font-bold tracking-tight">Run black-box suppression</h2>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#4B4B4B]">
                            The server updates the configured Assistant, runs reinforcement and adversarial checks, computes the observed leak score, and binds the result to the proof receipt.
                          </p>
                        </div>
                      </div>

                      <div className="mt-7 grid gap-4">
                        <div className="rounded-xl border border-blue-100 bg-[#F8FBFF] p-4">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h3 className="font-semibold text-[#111111]">OpenAI Assistant setup</h3>
                              <p className="mt-1 text-sm text-[#4B4B4B]">Enter the Assistant ID and API key for this suppression run.</p>
                            </div>
                            <div className="flex gap-3 text-xs font-semibold">
                              <a href="https://platform.openai.com/assistants" target="_blank" rel="noreferrer" className="text-[#2F80ED] underline">Assistants</a>
                              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-[#2F80ED] underline">API keys</a>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <Field label="OpenAI Assistant ID" value={liveAssistantId} onChange={setLiveAssistantId} />
                            <Field label="OpenAI API key" type="password" value={liveApiKey} onChange={setLiveApiKey} />
                          </div>
                        </div>
                        <Field label="Sensitive target" value={liveTargetText} multiline onChange={setLiveTargetText} />
                        <Field label="Deletion request" value={liveReason} multiline onChange={setLiveReason} />
                        <button
                          onClick={() => void runLiveAssistant()}
                          disabled={liveRunning || liveTargetText.trim().length < 3 || liveReason.trim().length < 3 || !liveAssistantId.trim() || !liveApiKey.trim()}
                          className="inline-flex w-full items-center justify-center rounded-xl bg-[#2F80ED] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2870CE] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        >
                          {liveRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                          {liveRunning ? 'Running suppression' : 'Run black-box suppression'}
                        </button>
                        {liveError && (
                          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                            <span>{liveError}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {liveResult && (
                    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <Metric label="Leak reduction" value={`${leakReduction}%`} icon={Gauge} tone="green" />
                      <Metric label="Post-unlearning score" value={`${measuredLeakScoreBps} bps`} icon={ShieldCheck} />
                      <Metric label="Validation prompts" value={`${validationPrompts}`} icon={Workflow} />
                      <Metric label="ZK proof" value={zkProofVerified ? 'Verified' : 'Pending'} icon={Layers3} tone="dark" />
                    </section>
                  )}

                  <section className="grid gap-6 xl:grid-cols-3">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-lg font-bold">1. Suppress</h3>
                      <p className="mt-3 text-sm leading-6 text-[#4B4B4B]">Inject a persistent behavioral policy into the configured Assistant for the scoped deletion target.</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-lg font-bold">2. Validate</h3>
                      <p className="mt-3 text-sm leading-6 text-[#4B4B4B]">Run reinforcement and adversarial checks against observable Assistant behavior.</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-lg font-bold">3. Prove</h3>
                      <p className="mt-3 text-sm leading-6 text-[#4B4B4B]">Bind the measured leak score, target commitment, and evidence root to a Stellar-ready proof receipt.</p>
                    </div>
                  </section>
                </>
              )}

              {activeTab === 'workbench' && (
                <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-2xl font-bold">ZK witness workbench</h2>
                          <p className="mt-2 text-sm leading-6 text-[#4B4B4B]">Edit the local deletion case inputs. Every hash, root, and receipt updates through WebCrypto.</p>
                        </div>
                        <button
                          onClick={() => void compileEvidence(input).then((result) => {
                            setCompiled(result);
                            setStellarDraft(buildStellarManageDataDraft(result));
                            setCompiledSource('local');
                          })}
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
                        <Field
                          label="Private target witness"
                          value={input.hiddenTarget}
                          multiline
                          onChange={(value) => {
                            if (!value.trim()) {
                              setCompiled(null);
                              setStellarDraft(null);
                              setCompiledSource('local');
                            }
                            setInput((current) => ({ ...current, hiddenTarget: value }));
                          }}
                        />
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
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-xl font-bold">Circuit statement</h3>
                      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm leading-6 text-[#111111]">
                        Prove that the private target is committed, the redacted evidence root is bound, and the measured post-unlearning leak score is less than or equal to the public threshold.
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <StatusBadge tone={compiled ? thresholdPassed ? 'pass' : 'blocked' : 'ready'}>{compiled ? thresholdPassed ? 'Constraint pass' : 'Constraint fail' : 'Pending evidence'}</StatusBadge>
                        <StatusBadge tone="ready">Circuit file included</StatusBadge>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                      <h3 className="text-xl font-bold">Public signals</h3>
                      <div className="mt-4 space-y-3">
                        <HashBlock label="Measured score" value={`${measuredLeakScoreBps} bps`} />
                        <HashBlock label="Max score" value={`${maxLeakScoreBps} bps`} />
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
                        <p className="mt-2 text-sm text-[#4B4B4B]">
                          Download the exact JSON artifact used for verification and Stellar anchoring. Current source: {compiledSource === 'openai' ? 'live OpenAI Assistant run' : 'local proof compiler'}.
                        </p>
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
                <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
                  <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-[#F2F7FF] p-3 text-[#2F80ED]">
                        <Link2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">Stellar anchor path</h2>
                        <p className="text-sm text-[#4B4B4B]">Live suppression runs call the deployed Soroban anchor contract and return the confirmed Stellar testnet transaction.</p>
                      </div>
                    </div>
                    <div className="mt-6 grid gap-3">
                      <HashBlock label="Anchor payload root" value={compiled?.evidenceRoot} />
                      <HashBlock label="Anchor proof hash" value={compiled?.proofReceipt.proofHash} />
                      <HashBlock label="Soroban contract" value={compiled?.stellar.contract ?? sorobanContractId} />
                      <HashBlock label="Stellar tx hash" value={compiled?.stellar.txHash ?? 'Run live suppression to submit a testnet anchor.'} />
                    </div>
                    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-[#111111]">
                      {compiled?.stellar.txHash ? `Submitted to Stellar testnet via ${compiled.stellar.mode}. Explorer: ${compiled.stellar.explorer}` : `Deployed Soroban contract is ready. Deploy tx: ${sorobanDeployTx}. Smoke invoke tx: ${sorobanInvokeTx}. ${stellarDraft?.message ?? ''}`}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h3 className="text-xl font-bold">Transaction draft</h3>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <StatusBadge tone={stellarDraft?.status === 'ready' ? 'pass' : 'warning'}>
                        {stellarDraft?.status === 'ready' ? 'Signed XDR ready' : 'Env not configured'}
                      </StatusBadge>
                      <StatusBadge tone="ready">Testnet</StatusBadge>
                    </div>
                    <pre className="mt-4 max-h-[480px] w-full max-w-full overflow-auto whitespace-pre-wrap break-all rounded-xl bg-gray-950 p-4 text-xs leading-5 text-gray-100">
                      {stellarDraft?.xdr ?? 'Set VITE_STELLAR_TESTNET_SOURCE_SECRET to generate a signed XDR draft locally.'}
                    </pre>
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
