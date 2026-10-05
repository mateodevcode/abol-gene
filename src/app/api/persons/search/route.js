import { requireUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

/** GET /api/persons/search?q= — por nombre; tolera faltas y nombres cortos. */
export async function GET(req) {
  try {
    await requireUser();
    const q = new URL(req.url).searchParams.get('q') ?? '';
    if (q.trim().length < 2) return Response.json({ persons: [] });
    const norm = q.trim();
    const { rows } = await query(
      `SELECT p.id, p.given_names, p.paternal_surname, p.maternal_surname, p.nickname,
              p.birth_date, p.birth_date_precision, p.death_date, p.is_living, p.cover_photo_id,
              b.name AS branch_name, b.color AS branch_color,
              word_similarity(lower(unaccent($1)), p.full_name_normalized) AS score
         FROM persons p LEFT JOIN branches b ON b.id = p.branch_id
        WHERE p.deleted_at IS NULL AND (
          p.full_name_normalized % lower(unaccent($1))
          OR word_similarity(lower(unaccent($1)), p.full_name_normalized) > 0.3
          OR lower(unaccent(p.full_name_normalized)) LIKE '%' || lower(unaccent($1)) || '%'
        )
        ORDER BY score DESC, p.birth_date
        LIMIT 10`,
      [norm]);
    return Response.json({ persons: rows });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
