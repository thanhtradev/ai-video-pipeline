-- migrate:up

-- Core entities. See docs/architecture.md §3 and docs/job-lifecycle.md.
-- Status columns use text + CHECK instead of enum types so new states only need a migration on the CHECK.

CREATE TABLE project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES project (id),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE video (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batch (id),
  sequence integer NOT NULL CHECK (sequence > 0),
  aspect_ratio text NOT NULL CHECK (aspect_ratio IN ('9:16', '16:9')),
  language text NOT NULL DEFAULT 'vi',
  current_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, sequence)
);

CREATE TABLE video_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES video (id),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'BRIEF_SUBMITTED' CHECK (status IN (
    'BRIEF_SUBMITTED', 'SCRIPTING', 'AWAITING_SCRIPT_APPROVAL', 'GENERATING_ASSETS',
    'RENDERING_PREVIEW', 'QA_RUNNING', 'AWAITING_PREVIEW_APPROVAL', 'RENDERING_FINAL',
    'ARCHIVING', 'ARCHIVE_VERIFIED', 'COMPLETED',
    'NEEDS_DECISION', 'BLOCKED_PROVIDER',
    'SUPERSEDED', 'FAILED', 'CANCELLED'
  )),
  resume_status text,
  brief jsonb NOT NULL,
  config_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, version)
);

CREATE TABLE job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_version_id uuid NOT NULL REFERENCES video_version (id),
  step text NOT NULL,
  stream text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN (
    'PENDING', 'READY', 'QUEUED', 'RUNNING', 'SUCCEEDED',
    'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'BLOCKED', 'CANCELLED'
  )),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  attempt_count integer NOT NULL DEFAULT 0,
  claimed_by text,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  queued_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_dispatch_idx ON job (stream, status);
CREATE INDEX job_version_idx ON job (video_version_id);

CREATE TABLE job_dependency (
  job_id uuid NOT NULL REFERENCES job (id),
  depends_on_job_id uuid NOT NULL REFERENCES job (id),
  PRIMARY KEY (job_id, depends_on_job_id),
  CHECK (job_id <> depends_on_job_id)
);

CREATE TABLE job_attempt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES job (id),
  attempt_no integer NOT NULL,
  worker_id text NOT NULL,
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN (
    'RUNNING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'ABANDONED', 'CANCELLED'
  )),
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (job_id, attempt_no)
);

CREATE TABLE worker (
  id text PRIMARY KEY,
  capabilities text[] NOT NULL DEFAULT '{}',
  last_seen_at timestamptz,
  -- Last time the worker found every queue it serves empty; lets the watchdog tell a lost queue
  -- message from one that is only waiting behind a long job.
  last_idle_at timestamptz
);

CREATE TABLE approver (
  telegram_user_id bigint PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE approval (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_version_id uuid NOT NULL REFERENCES video_version (id),
  type text NOT NULL CHECK (type IN ('SCRIPT', 'PREVIEW', 'DECISION')),
  token text NOT NULL UNIQUE,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'SUPERSEDED'
  )),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_reminded_at timestamptz,
  decided_by bigint,
  decided_at timestamptz,
  decision_note text
);

CREATE INDEX approval_pending_idx ON approval (status, expires_at);

CREATE TABLE asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_version_id uuid NOT NULL REFERENCES video_version (id),
  job_id uuid REFERENCES job (id),
  path text NOT NULL,
  kind text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  bytes bigint NOT NULL CHECK (bytes >= 0),
  source_url text,
  license_status text NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (license_status IN (
    'VERIFIED', 'UNVERIFIED', 'NOT_APPLICABLE'
  )),
  license_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_version_id, path)
);

CREATE TABLE provider (
  id text PRIMARY KEY,
  name text NOT NULL,
  capability text NOT NULL CHECK (capability IN ('llm', 'tts', 'music', 'sfx', 'stt', 'image', 'video')),
  billing text NOT NULL CHECK (billing IN ('per_request', 'subscription', 'license', 'local')),
  data_sent_description text NOT NULL,
  enabled boolean NOT NULL DEFAULT false
);

CREATE TABLE provider_model (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL REFERENCES provider (id),
  model_id text NOT NULL,
  default_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_concurrency integer NOT NULL DEFAULT 1 CHECK (max_concurrency > 0),
  enabled boolean NOT NULL DEFAULT false,
  UNIQUE (provider_id, model_id)
);

CREATE TABLE provider_price (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_model_id uuid NOT NULL REFERENCES provider_model (id),
  unit text NOT NULL,
  unit_price numeric(18, 8) NOT NULL CHECK (unit_price >= 0),
  currency char(3) NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  source_note text,
  UNIQUE (provider_model_id, valid_from),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE provider_quota (
  provider_model_id uuid PRIMARY KEY REFERENCES provider_model (id),
  period text NOT NULL,
  limit_value numeric,
  used numeric NOT NULL DEFAULT 0,
  reset_at timestamptz,
  status text NOT NULL DEFAULT 'OK' CHECK (status IN ('OK', 'EXHAUSTED', 'ERROR')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pipeline_config (
  version text PRIMARY KEY,
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cost_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_version_id uuid NOT NULL REFERENCES video_version (id),
  job_id uuid REFERENCES job (id),
  attempt_id uuid REFERENCES job_attempt (id),
  provider_model_id uuid REFERENCES provider_model (id),
  price_id uuid REFERENCES provider_price (id),
  kind text NOT NULL CHECK (kind IN ('ESTIMATE', 'ACTUAL')),
  units numeric NOT NULL CHECK (units >= 0),
  unit_price numeric(18, 8) NOT NULL CHECK (unit_price >= 0),
  amount numeric(18, 8) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL,
  is_derived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cost_entry_version_idx ON cost_entry (video_version_id);

CREATE TABLE archive_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_version_id uuid NOT NULL UNIQUE REFERENCES video_version (id),
  target text NOT NULL,
  path text NOT NULL,
  file_count integer NOT NULL CHECK (file_count >= 0),
  total_bytes bigint NOT NULL CHECK (total_bytes >= 0),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz NOT NULL
);

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor text NOT NULL,
  action text NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_log_object_idx ON audit_log (object_type, object_id);

-- migrate:down

DROP TABLE audit_log;
DROP TABLE archive_record;
DROP TABLE cost_entry;
DROP TABLE pipeline_config;
DROP TABLE provider_quota;
DROP TABLE provider_price;
DROP TABLE provider_model;
DROP TABLE provider;
DROP TABLE asset;
DROP TABLE approval;
DROP TABLE approver;
DROP TABLE worker;
DROP TABLE job_attempt;
DROP TABLE job_dependency;
DROP TABLE job;
DROP TABLE video_version;
DROP TABLE video;
DROP TABLE batch;
DROP TABLE project;
