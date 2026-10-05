import { initials } from '@/lib/format';

/**
 * Avatar con foto de portada o iniciales con color de rama.
 * @param {{ person: any, size?: 'sm'|'md'|'lg', photoUrl?: string|null }} props
 */
const SIZES = {
  sm: 'h-10 w-10 text-base',
  md: 'h-16 w-16 text-2xl',
  lg: 'h-24 w-24 text-4xl',
};

export default function PersonAvatar({ person, size = 'md', photoUrl = null }) {
  const cls = `${SIZES[size] ?? SIZES.md}`;
  if (photoUrl) {
    // <img> a propósito: next/image optimizaría sin la cookie de sesión (401).
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photoUrl} alt=""
        className={`shrink-0 rounded-full object-cover ${cls}`}
        loading="lazy"
      />
    );
  }
  const color = person?.branch_color ?? '#78716c';
  return (
    <span
      title={person ? `${person.given_names ?? ''} ${person.paternal_surname ?? ''}` : ''}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${SIZES[size] ?? SIZES.md}`}
      style={{ backgroundColor: color }}
    >
      {person ? initials(person) : '?'}
    </span>
  );
}
