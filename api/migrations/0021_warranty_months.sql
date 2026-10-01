-- Inventario ITIL · duración de la garantía en meses (01-oct-2026 · GrokBot executor · MacMini, por encargo de Carlos).
-- Aditiva: una columna NULL en device_lifecycle. Nada existente cambia; una ficha sin el dato se muestra «sin dato».
-- Si no hay warranty_end, el fin de garantía se CALCULA (inicio de garantía o, si falta, fecha de compra + meses);
-- nunca se escribe un dato que nadie ha registrado. Aplicar con `wrangler d1 execute yokup-db --remote --file
-- migrations/0021_warranty_months.sql` (yokup-db no usa d1_migrations) ANTES de desplegar el worker (las consultas
-- ya leen la columna). No es repetible: ADD COLUMN falla si la columna ya existe (comprobar con pragma_table_info).
ALTER TABLE device_lifecycle ADD COLUMN warranty_months INTEGER CHECK(warranty_months IS NULL OR warranty_months BETWEEN 1 AND 600);
