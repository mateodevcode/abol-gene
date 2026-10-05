import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import TreeApp from '@/components/tree/TreeApp';

export default async function ArbolPage({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.person_id) redirect('/bienvenida');
  const sp = await searchParams;

  // El foco inicial es ?persona= si existe, si no mi propia persona.
  let focusId = user.person_id;
  if (sp?.persona) {
    const { rows: [p] } = await query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [sp.persona]);
    if (p) focusId = p.id;
  }

  return (
    <TreeApp
      user={{ id: user.id, role: user.role, person_id: user.person_id }}
      initialFocusId={focusId}
    />
  );
}
