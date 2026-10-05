/** Formato en español para fechas con precisión y nombres. */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * "1912-09-03"+day -> "3 sep 1912"; year -> "1912"; decade -> "década de 1880";
 * approximate -> "hacia 1880"; month -> "sep 1912".
 * Acepta 'YYYY-MM-DD' (lo que devuelve pg tras el parser de client.js) o Date.
 */
export function formatDate(dateStr, precision) {
  if (!dateStr) return null;
  let y, m, d;
  if (dateStr instanceof Date) {
    // Date de pg = medianoche local: getters locales, nunca UTC.
    y = dateStr.getFullYear(); m = dateStr.getMonth(); d = dateStr.getDate();
  } else {
    const parts = String(dateStr).slice(0, 10).split('-').map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    [y, m, d] = [parts[0], parts[1] - 1, parts[2]];
  }
  switch (precision) {
    case 'day': return `${d} ${MESES[m]} ${y}`;
    case 'month': return `${MESES[m]} ${y}`;
    case 'decade': return `década de ${Math.floor(y / 10) * 10}`;
    case 'approximate': return `hacia ${y}`;
    case 'year':
    default: return `${y}`;
  }
}

/** "3 sep 1912 – 20 may 2001" o "n. 30 ene 1948". */
export function formatLifespan(p) {
  const birth = formatDate(p.birth_date, p.birth_date_precision);
  const death = formatDate(p.death_date, p.death_date_precision);
  if (birth && death) return `${birth} – ${death}`;
  if (birth) return p.is_living === false ? `n. ${birth} · f. ?` : `n. ${birth}`;
  return null;
}

/** "Carmen García Martínez" + apodo. */
export function fullName(p) {
  if (!p) return '';
  const base = [p.given_names, p.paternal_surname, p.maternal_surname].filter(Boolean).join(' ');
  return p.nickname ? `${base} "${p.nickname}"` : base;
}

const FACT_TYPES = {
  occupation: 'Oficio', residence: 'Residencia', origin: 'Origen',
  anecdote: 'Anécdota', other: 'Otro dato',
};

/** Etiqueta en español para facts.type (en inglés en DB). */
export function factTypeEs(type) {
  return FACT_TYPES[type] ?? type;
}

const UNION_KINDS = { marriage: 'Matrimonio', free_union: 'Unión libre', partnership: 'Pareja', separated: 'Separados' };

export function unionKindEs(kind) {
  return UNION_KINDS[kind] ?? kind;
}

/** Iniciales para el avatar ("CG" de Carmen García). */
export function initials(p) {
  const a = (p.given_names ?? '').trim().charAt(0);
  const b = (p.paternal_surname ?? '').trim().charAt(0) || (p.maternal_surname ?? '').trim().charAt(0);
  return (a + (b || '')).toUpperCase() || '?';
}
