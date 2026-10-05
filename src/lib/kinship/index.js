/**
 * Parentesco como función pura (sin DB): dado el mapa de padres y géneros,
 * encuentra el ancestro común más cercano entre A y B y lo etiqueta en español.
 *
 * Cobertura (documentada): misma persona, línea directa hasta 4 generaciones,
 * hermanos/medios, tío/sobrino (±1 y ±2 gens: abuelo/nieto), primos 1°–3° en
 * igual grado, tío/sobrino segundo. El resto → "pariente lejano".
 * Las etiquetas describen a B desde A ("tu primo"). Para "tú mismo", el
 * llamador compara con su propio id.
 */

/**
 * @typedef {{ parents: Map<string,string[]> | Record<string,string[]>, genders: Map<string,string|null> | Record<string,string|null> }} KinGraph
 */

function asMap(m) {
  return m instanceof Map ? m : new Map(Object.entries(m ?? {}));
}

function parentsOf(parents, id) {
  return parents.get(id) ?? [];
}

function genderOf(genders, id) {
  const g = genders.get(id);
  return g === 'M' || g === 'F' ? g : null;
}

/** Elige forma masculina/femenina/neutral según género. */
function noun(masc, fem, gender) {
  if (gender === 'F') return fem;
  if (gender === 'M') return masc;
  return `${masc}/${fem}`;
}

/**
 * Sube desde `start` guardando la distancia más corta y un camino.
 * @returns {Map<string,{ dist: number, path: string[] }>} id -> {dist, path de start a id}
 */
function walkUp(parents, start, maxDepth = 30) {
  const seen = new Map(); // id -> { dist, path }
  let frontier = [{ id: start, path: [start] }];
  seen.set(start, { dist: 0, path: [start] });
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const next = [];
    for (const { id, path } of frontier) {
      for (const p of parentsOf(parents, id)) {
        if (seen.has(p)) continue;
        seen.set(p, { dist: depth, path: [...path, p] });
        next.push({ id: p, path: [...path, p] });
      }
    }
    frontier = next;
  }
  return seen;
}

const DIRECT_UP = [null, ['padre', 'madre'], ['abuelo', 'abuela'], ['bisabuelo', 'bisabuela'], ['tatarabuelo', 'tatarabuela']];
const DIRECT_DOWN = [null, ['hijo', 'hija'], ['nieto', 'nieta'], ['bisnieto', 'bisnieta'], ['tataranieto', 'tataranieta']];

/**
 * Describe el parentesco de B visto desde A.
 * @param {string} aId
 * @param {string} bId
 * @param {KinGraph} graph
 */
export function describeKinship(aId, bId, graph) {
  const parents = asMap(graph.parents);
  const genders = asMap(graph.genders);
  const gB = genderOf(genders, bId);

  if (aId === bId) {
    return { type: 'same', distanceA: 0, distanceB: 0, commonAncestor: aId, label: 'es la misma persona', route: [aId] };
  }

  const ancA = walkUp(parents, aId);
  // BFS desde B: el primer ancestro común minimiza la distancia de B.
  const seenB = new Set([bId]);
  let frontier = [bId];
  let pathB = new Map([[bId, [bId]]]);
  let nca = ancA.has(bId) ? bId : null;
  let dB = nca ? 0 : -1;
  if (!nca) {
    let found = false;
    for (let depth = 1; depth <= 30 && !found; depth++) {
      const next = [];
      const nextPaths = new Map();
      for (const id of frontier) {
        for (const p of parentsOf(parents, id)) {
          if (seenB.has(p)) continue;
          seenB.add(p);
          const path = [...pathB.get(id), p];
          if (!nextPaths.has(p)) nextPaths.set(p, path);
          next.push(p);
          if (ancA.has(p)) {
            nca = p; dB = depth;
            pathB.set(p, path);
            found = true;
            break;
          }
        }
        if (found) break;
      }
      for (const [k, v] of nextPaths) pathB.set(k, v);
      frontier = next;
      if (frontier.length === 0) break;
    }
  } else {
    pathB = new Map([[bId, [bId]]]);
  }
  if (!nca) {
    return { type: 'unrelated', distanceA: -1, distanceB: -1, commonAncestor: null, label: 'sin parentesco conocido', route: [] };
  }

  const dA = ancA.get(nca).dist;
  const pathA = ancA.get(nca).path; // A -> ... -> NCA
  const fullB = pathB.get(nca); // B -> ... -> NCA
  const route = [...pathA, ...[...fullB].reverse().slice(1)]; // A..NCA..B

  // "por parte de tu madre/padre": el primer paso de A hacia el ancestro.
  let qualifier = '';
  if (dA >= 2) {
    const step = pathA[1];
    const g = genderOf(genders, step);
    if (g === 'F') qualifier = ' por parte de tu madre';
    else if (g === 'M') qualifier = ' por parte de tu padre';
  }

  let type = 'distant';
  let label = 'pariente lejano';

  if (dA === 0) {
    // A es ancestro de B: B es descendiente.
    type = 'descendant';
    label = dB <= 4 ? `tu ${noun(...DIRECT_DOWN[dB], gB)}` : `tu descendiente (${dB} generaciones)`;
  } else if (dB === 0) {
    // B es ancestro de A.
    type = 'ancestor';
    label = dA <= 4 ? `tu ${noun(...DIRECT_UP[dA], gB)}${qualifier}` : `tu antepasado (${dA} generaciones)`;
  } else if (dA === 1 && dB === 1) {
    const pa = new Set(parentsOf(parents, aId));
    const pb = new Set(parentsOf(parents, bId));
    const same = pa.size > 0 && pa.size === pb.size && [...pa].every((x) => pb.has(x));
    type = same ? 'sibling' : 'half-sibling';
    label = same
      ? `tu ${noun('hermano', 'hermana', gB)}`
      : gB === 'F' ? 'tu media hermana' : gB === 'M' ? 'tu medio hermano' : 'tu medio hermano/a';
  } else if (dA === 1 && dB === 2) {
    type = 'nephew-niece'; label = `tu ${noun('sobrino', 'sobrina', gB)}`;
  } else if (dA === 2 && dB === 1) {
    type = 'uncle-aunt'; label = `tu ${noun('tío', 'tía', gB)}`;
  } else if (dA === 1 && dB === 3) {
    type = 'nephew-niece'; label = `tu ${noun('sobrino nieto', 'sobrina nieta', gB)}`;
  } else if (dA === 3 && dB === 1) {
    type = 'uncle-aunt'; label = `tu ${noun('tío abuelo', 'tía abuela', gB)}`;
  } else if (dA === 2 && dB === 2) {
    type = 'cousin'; label = `tu ${noun('primo', 'prima', gB)}`;
  } else if (dA === 3 && dB === 3) {
    type = 'cousin'; label = `tu ${noun('primo segundo', 'prima segunda', gB)}`;
  } else if (dA === 4 && dB === 4) {
    type = 'cousin'; label = `tu ${noun('primo tercero', 'prima tercera', gB)}`;
  } else if (dA === 3 && dB === 2) {
    type = 'uncle-aunt'; label = `tu ${noun('tío segundo', 'tía segunda', gB)}`;
  } else if (dA === 2 && dB === 3) {
    type = 'nephew-niece'; label = `tu ${noun('sobrino segundo', 'sobrina segunda', gB)}`;
  }

  return { type, distanceA: dA, distanceB: dB, commonAncestor: nca, label, route };
}
