-- Private, synthetic voice-note rehearsals. Never invokes a telephone provider.
CREATE TABLE call_telegram (
 id TEXT PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES call_cases(id),
 code TEXT UNIQUE NOT NULL,
 chat_id TEXT,
 state TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 ended_at INTEGER
);
CREATE UNIQUE INDEX call_telegram_live_case ON call_telegram(case_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX call_telegram_live_chat ON call_telegram(chat_id) WHERE ended_at IS NULL AND chat_id IS NOT NULL;
CREATE TABLE call_telegram_inbox (
 update_id INTEGER PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES call_telegram(id),
 turn INTEGER NOT NULL,
 file_id TEXT,
 transcript TEXT,
 status TEXT NOT NULL DEFAULT 'pending',
 lease TEXT,
 lease_until INTEGER,
 created_at INTEGER NOT NULL
);
CREATE TABLE call_telegram_outbox (
 session_id TEXT NOT NULL REFERENCES call_telegram(id),
 turn INTEGER NOT NULL,
 prompt TEXT NOT NULL,
 audio TEXT NOT NULL,
 sent_at INTEGER,
 message_id INTEGER,
 PRIMARY KEY(session_id,turn)
);
