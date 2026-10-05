import PersonAvatar from '@/components/person/PersonAvatar';
import { fullName, formatLifespan } from '@/lib/format';

/** Chip navegable de persona (salta de ficha en ficha). */
export default function PersonLink({ person, sub = null }) {
  const photoUrl = person.cover_photo_id ? `/api/photos/${person.cover_photo_id}/thumb` : null;
  return (
    <a
      href={`/persona/${person.id}`}
      className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2 hover:bg-stone-50"
    >
      <PersonAvatar person={person} size="sm" photoUrl={photoUrl} />
      <span className="min-w-0">
        <span className="block truncate text-lg font-medium text-stone-900">{fullName(person)}</span>
        <span className="block truncate text-sm text-stone-500">
          {sub ?? formatLifespan(person) ?? ''}
        </span>
      </span>
    </a>
  );
}
