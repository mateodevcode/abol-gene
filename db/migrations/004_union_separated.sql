-- 004_union_separated.sql — Nuevo tipo de unión "separated": tuvieron hijos
-- en común y se separaron. Se muestra como "Separados" y alinea generaciones
-- igual que las demás uniones (ver layoutTree).
ALTER TABLE unions DROP CONSTRAINT unions_kind;
ALTER TABLE unions ADD CONSTRAINT unions_kind
  CHECK (kind IN ('marriage','free_union','partnership','separated'));
