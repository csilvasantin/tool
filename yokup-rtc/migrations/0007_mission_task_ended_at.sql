-- Fin factual de una tarea para /highscore/active-work.
-- No se rellena hacia atrás: `updated_at` incluye informes, pruebas y retoques y
-- por tanto no demuestra cuándo terminó el trabajo.
ALTER TABLE mission_tasks ADD COLUMN ended_at INTEGER;
