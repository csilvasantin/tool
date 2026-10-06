-- Acceso de solo lectura para grabar una demo (encargo #5261).
-- El nonce se gasta una vez. La sesión muere si se revoca o si rota la clave
-- (la columna fp es la huella de MEROVINGIO_BOX_LECTURA).
CREATE TABLE IF NOT EXISTS lectura_nonces (
 nonce TEXT PRIMARY KEY,
 site TEXT NOT NULL,
 exp INTEGER NOT NULL,
 used_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lectura_sessions (
 sid_hash TEXT PRIMARY KEY,
 site TEXT NOT NULL,
 exp INTEGER NOT NULL,
 fp TEXT NOT NULL,
 revoked INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
