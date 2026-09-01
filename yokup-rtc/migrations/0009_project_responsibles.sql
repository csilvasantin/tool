-- FLT-1505 · dos responsables independientes por proyecto.
-- `owner` ya conserva el responsable de silicio; carbono es un nombre humano.
ALTER TABLE projects
  ADD COLUMN carbon_responsible TEXT NOT NULL DEFAULT '';
