import { requireUser } from '@/lib/auth/session';
import { query, withTransaction } from '@/lib/db/client';
import { createPerson } from '@/lib/db/persons';
import { findDuplicates } from '@/lib/db/duplicates';

/** POST /api/persons — crea una persona y avisa de posibles duplicados. */
export async function POST(req) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const person = await withTransaction((db) => createPerson(db, user.id, body));
    const warnings = await findDuplicates({ query }, {
      given_names: body.given_names,
      paternal_surname: body.paternal_surname,
      maternal_surname: body.maternal_surname,
      nickname: body.nickname,
      birth_date: body.birth_date ?? null,
      parent_ids: (body.parent_ids ?? []).map((p) => (typeof p === 'string' ? p : p.id)).filter(Boolean),
      exclude_id: person.id,
    });
    return Response.json({ person, duplicates: warnings }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo crear.' }, { status: 400 });
  }
}
