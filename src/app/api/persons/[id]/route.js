import { requireUser } from '@/lib/auth/session';
import { query, withTransaction } from '@/lib/db/client';
import { getPerson, updatePerson, deletePerson } from '@/lib/db/persons';

/** GET /api/persons/[id] — ficha básica (la ficha completa llega en Fase 5). */
export async function GET(_req, { params }) {
  try {
    await requireUser();
    const { id } = await params;
    const person = await getPerson({ query }, id);
    if (!person) return Response.json({ error: 'Persona no encontrada.' }, { status: 404 });
    return Response.json({ person });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/** PATCH /api/persons/[id] — edita una persona. */
export async function PATCH(req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const person = await withTransaction((db) => updatePerson(db, user.id, id, body));
    return Response.json({ person });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo editar.' }, { status: 400 });
  }
}

/** DELETE /api/persons/[id] — borrado lógico. */
export async function DELETE(_req, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await withTransaction((db) => deletePerson(db, user.id, id));
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: e.message ?? 'No se pudo borrar.' }, { status: 400 });
  }
}
