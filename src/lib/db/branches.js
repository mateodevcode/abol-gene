import { logChange } from '@/lib/db/change-log';

const PALETTE = ['#4F86C6', '#E07A5F', '#81B29D', '#E9C46A', '#9D8DF1', '#E76F51', '#2A9D8F', '#8AB17D'];

/** Lista ramas con conteo (solo lectura, cualquier miembro). */
export async function listBranches(db) {
  const { rows } = await db.query(
    `SELECT b.*, count(p.id)::int AS person_count,
            f.given_names AS founder_name, f.paternal_surname AS founder_surname
       FROM branches b
       LEFT JOIN persons p ON p.branch_id = b.id AND p.deleted_at IS NULL
       LEFT JOIN persons f ON f.id = b.founder_person_id
      WHERE b.deleted_at IS NULL
      GROUP BY b.id, f.given_names, f.paternal_surname
      ORDER BY b.created_at`);
  return rows;
}

function nextColor(used) {
  return PALETTE.find((c) => !used.includes(c)) ?? '#78716c';
}

/** Crea una rama (color automático si no se da). */
export async function createBranch(db, userId, { name, color = null, founder_person_id = null }) {
  if (!String(name ?? '').trim()) throw new Error('La rama necesita un nombre.');
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error('Color no válido (hex #RRGGBB).');
  if (founder_person_id) {
    const f = await db.query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [founder_person_id]);
    if (!f.rows[0]) throw new Error('La persona fundadora no existe.');
  }
  if (!color) {
    const { rows } = await db.query('SELECT color FROM branches WHERE deleted_at IS NULL');
    color = nextColor(rows.map((r) => r.color));
  }
  const { rows: [branch] } = await db.query(
    'INSERT INTO branches (name, color, founder_person_id) VALUES ($1,$2,$3) RETURNING *',
    [name.trim(), color, founder_person_id]);
  await logChange(db, { entity_type: 'branch', entity_id: branch.id, action: 'create', after: branch, user_id: userId });
  return branch;
}
