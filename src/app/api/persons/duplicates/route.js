import { requireUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { findDuplicates } from '@/lib/db/duplicates';

/** GET /api/persons/duplicates?given_names=... — avisa antes de crear. */
export async function GET(req) {
  try {
    await requireUser();
    const sp = new URL(req.url).searchParams;
    const result = await findDuplicates({ query }, {
      given_names: sp.get('given_names') ?? '',
      paternal_surname: sp.get('paternal_surname') ?? undefined,
      maternal_surname: sp.get('maternal_surname') ?? undefined,
      nickname: sp.get('nickname') ?? undefined,
      birth_date: sp.get('birth_date') ?? null,
      parent_ids: (sp.get('parent_ids') ?? '').split(',').filter(Boolean),
      exclude_id: sp.get('exclude_id') ?? null,
    });
    return Response.json({ duplicates: result });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
