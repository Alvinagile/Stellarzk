create table if not exists public.stellarzk_evidence_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  case_id text not null,
  evidence_hash text not null unique,
  evidence_root text not null,
  target_commitment text not null,
  proof_hash text not null,
  assistant_id_hash text,
  request_reason text,
  validation_score_bps integer not null,
  leak_score_bps integer not null,
  total_tests integer not null,
  passed_tests integer not null,
  failed_tests integer not null,
  bundle jsonb not null
);

alter table public.stellarzk_evidence_runs enable row level security;

drop policy if exists "Public can read stellarzk evidence runs" on public.stellarzk_evidence_runs;
create policy "Public can read stellarzk evidence runs"
on public.stellarzk_evidence_runs
for select
to anon, authenticated
using (true);

drop policy if exists "Service role can manage stellarzk evidence runs" on public.stellarzk_evidence_runs;
create policy "Service role can manage stellarzk evidence runs"
on public.stellarzk_evidence_runs
for all
to service_role
using (true)
with check (true);
