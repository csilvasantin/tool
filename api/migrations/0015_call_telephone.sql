-- Guided telephone pilot. No real incidents, appointments or automated redials.
CREATE TABLE call_telephone(
 attempt_id TEXT PRIMARY KEY REFERENCES call_attempts(id),
 call_sid TEXT UNIQUE,
 to_phone TEXT NOT NULL,
 provider_status TEXT NOT NULL DEFAULT 'starting',
 state TEXT NOT NULL DEFAULT '{"step":"fault","turn":0,"retries":0}',
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE call_telephone_turns(
 attempt_id TEXT NOT NULL REFERENCES call_telephone(attempt_id),
 turn INTEGER NOT NULL,
 response_xml TEXT NOT NULL,
 PRIMARY KEY(attempt_id,turn)
);
