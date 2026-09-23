-- Persistent per-case policy and per-contact cycles. Historical attempts remain intact.
CREATE TABLE call_chains(
 case_id TEXT PRIMARY KEY REFERENCES call_cases(id),
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','paused')),
 max_attempts INTEGER NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 10),
 retry_minutes INTEGER NOT NULL DEFAULT 10 CHECK(retry_minutes BETWEEN 1 AND 1440),
 coordinator TEXT NOT NULL DEFAULT '',
 reason TEXT NOT NULL DEFAULT '',
 observed_stage TEXT NOT NULL DEFAULT '',
 stage_cycle INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL
);
ALTER TABLE call_jobs ADD COLUMN cycle TEXT NOT NULL DEFAULT 'initial';
ALTER TABLE call_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE call_attempts ADD COLUMN cycle TEXT NOT NULL DEFAULT 'initial';
INSERT INTO call_chains(case_id,updated_at) SELECT id,created_at FROM call_cases;
CREATE TRIGGER call_chain_revision BEFORE UPDATE ON call_chains
WHEN NEW.revision != OLD.revision + 1
BEGIN SELECT RAISE(ABORT,'chain revision changed'); END;
-- Enforce exclusion even when two operators race on different contacts.
CREATE TRIGGER call_case_one_conversation BEFORE INSERT ON call_attempts
WHEN EXISTS(SELECT 1 FROM call_attempts a JOIN call_jobs j ON j.id=a.job_id
 WHERE a.ended_at IS NULL AND j.case_id=(SELECT case_id FROM call_jobs WHERE id=NEW.job_id))
 OR EXISTS(SELECT 1 FROM call_chains ch JOIN call_jobs j ON j.case_id=ch.case_id WHERE j.id=NEW.job_id AND ch.state='paused')
 OR EXISTS(SELECT 1 FROM call_cases c JOIN call_jobs j ON j.case_id=c.id WHERE j.id=NEW.job_id AND c.stage='closed')
BEGIN SELECT RAISE(ABORT,'case cannot start a conversation'); END;
CREATE TRIGGER call_proposal_no_live_change BEFORE INSERT ON call_proposals
WHEN EXISTS(SELECT 1 FROM call_jobs WHERE case_id=NEW.case_id AND attempt_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'finish conversation before changing proposal'); END;

CREATE TRIGGER call_chain_pause_no_live BEFORE UPDATE ON call_chains
WHEN NEW.state='paused' AND EXISTS(SELECT 1 FROM call_jobs WHERE case_id=NEW.case_id AND attempt_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'finish conversation before pausing'); END;
