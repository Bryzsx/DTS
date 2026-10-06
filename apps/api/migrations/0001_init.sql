-- 0001_init.sql — DTS core schema
-- Hand-written, idempotent SQL (drizzle-kit push is unreliable on this host).
-- One row in `documents` = one incoming communication on the official DTS form.

CREATE TABLE IF NOT EXISTS users (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            text NOT NULL,
  email           text NOT NULL,
  password_hash   text,
  role            text NOT NULL DEFAULT 'viewer',
  status          text NOT NULL DEFAULT 'active',
  token_version   integer NOT NULL DEFAULT 0,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      integer,
  CONSTRAINT users_role_check CHECK (role in ('admin','officer','rd','viewer')),
  CONSTRAINT users_status_check CHECK (status in ('active','disabled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refresh_tokens_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS offices (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  code        text,
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_offices_name ON offices (lower(name));

CREATE TABLE IF NOT EXISTS documents (
  id                                    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Field guide numbering: No. 11 does not exist in the source template.
  dts_reference_no                       text NOT NULL,                    -- 1
  date_time_received                     timestamptz NOT NULL,             -- 2
  mode_of_receipt                        text NOT NULL,                    -- 3
  document_type                          text NOT NULL,                    -- 4
  date_of_document                       date,                             -- 5
  reference_no                           text,                             -- 6
  sender_originating_office              text NOT NULL,                    -- 7
  subject_brief_description              text NOT NULL,                    -- 8
  attachments                            text,                             -- 9
  urgency_level                          text NOT NULL DEFAULT 'Routine',  -- 10
  rd_disposition                         text,                             -- 12
  rd_decision_date                       date,                             -- 13
  referred_assigned_to                   text,                             -- 14
  action_required                        text,                             -- 15
  deadline_due_date                      date,                             -- 16
  status                                 text NOT NULL DEFAULT 'Received',  -- 17
  date_forwarded                         date,                             -- 18
  date_action_completed                  date,                             -- 19
  response_outgoing_reference_no         text,                             -- 20
  proof_of_transmission_receipt          text,                             -- 21
  remarks                                text,                             -- 22
  created_by                             integer REFERENCES users (id),
  created_at                             timestamptz NOT NULL DEFAULT now(),
  updated_by                             integer REFERENCES users (id),
  updated_at                             timestamptz NOT NULL DEFAULT now(),
  archived_at                            timestamptz,
  CONSTRAINT documents_mode_check
    CHECK (mode_of_receipt in ('Email','Courier','Hand-carried','Other')),
  CONSTRAINT documents_type_check
    CHECK (document_type in ('Letter','Memorandum','Request','Invitation','Endorsement','Report','Other')),
  CONSTRAINT documents_urgency_check
    CHECK (urgency_level in ('Urgent','High Priority','Routine')),
  CONSTRAINT documents_disposition_check
    CHECK (rd_disposition in ('For approval','For information','For appropriate action','Refer to concerned office','Other')),
  CONSTRAINT documents_status_check
    CHECK (status in ('Received','Under Review','For RD Action','Referred','Ongoing','Completed','Closed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_dts_reference_no ON documents (dts_reference_no);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
CREATE INDEX IF NOT EXISTS idx_documents_urgency ON documents (urgency_level);
CREATE INDEX IF NOT EXISTS idx_documents_received ON documents (date_time_received DESC);
CREATE INDEX IF NOT EXISTS idx_documents_deadline ON documents (deadline_due_date);
CREATE INDEX IF NOT EXISTS idx_documents_assigned ON documents (referred_assigned_to);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents (document_type);

CREATE TABLE IF NOT EXISTS document_attachments (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id   integer NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  filename      text NOT NULL,
  storage_key   text NOT NULL,
  content_type  text NOT NULL,
  size_bytes    integer NOT NULL,
  uploaded_by   integer REFERENCES users (id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attachments_document_id ON document_attachments (document_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     integer REFERENCES users (id),
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  detail      jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS sequences (
  name        text PRIMARY KEY,
  year        integer NOT NULL,
  last_value  integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  integer REFERENCES users (id)
);

-- Seed the agency settings so the print letterhead is never blank.
INSERT INTO settings (key, value) VALUES
  ('agency_name', 'Document Tracking System'),
  ('agency_subtitle', 'Records Management Office'),
  ('agency_seal_url', '')
ON CONFLICT (key) DO NOTHING;