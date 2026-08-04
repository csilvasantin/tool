-- FLT-1173 · referencia persistente compartida para la tendencia de la última hora.
-- El worker crea lo mismo idempotentemente en ensureSchema; esta migración permite
-- preparar o auditar D1 de forma explícita.
CREATE TABLE IF NOT EXISTS highscore_snapshots (
  agent_key TEXT NOT NULL,
  agent TEXT NOT NULL,
  machine TEXT,
  sampled_at INTEGER NOT NULL,
  points INTEGER NOT NULL,
  PRIMARY KEY (agent_key, sampled_at)
);

CREATE INDEX IF NOT EXISTS idx_highscore_snapshots_time
  ON highscore_snapshots(sampled_at);
