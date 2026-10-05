/**
 * Layout del árbol como FUNCIÓN PURA: recibe personas, vínculos y uniones,
 * devuelve coordenadas. No dibuja nada (el dibujo vive en components/tree).
 *
 * Modelo por generaciones (layering por camino más largo desde raíces):
 *  - Parejas principales (unión más antigua, o co-padre con más hijos en
 *    común si no hay unión) van lado a lado, en la misma generación.
 *  - Hijos ordenados por fecha de nacimiento bajo sus padres; los padres se
 *    recentran sobre la media de sus hijos (hacia abajo-arriba, sin solapes).
 *  - Segundos matrimonios: la persona se ubica con su unión principal; los
 *    hijos de uniones secundarias quedan en su generación con arista larga.
 *  - Medios hermanos: cada hijo se agrupa con el primer padre listado; el
 *    otro padre igual dibuja su arista.
 *  - Ancestros faltantes: simplemente dejan espacio (los huecos clicables
 *    son Fase 8; aquí no se inventan nodos).
 *  - Ramas que se cruzan: heurística baricéntrica de una pasada (orden por
 *    posición media de los padres + fecha). No es óptima, es determinista.
 *
 * Nulos en fecha van al final. Todo desempate por id (determinista).
 */

export const NODE_W = 176;
export const NODE_H = 64;
export const X_GAP = 28;
export const FAMILY_GAP = 72;
export const GEN_GAP = 120;

/**
 * @param {{ persons: Array<{id:string,birth_date?:string|null}>, parent_links: Array<{parent_id:string,child_id:string}>, unions: Array<{person_a_id:string,person_b_id:string,start_date?:string|null}> }} input
 * @returns {{ nodes: Array<{id:string,x:number,y:number,gen:number}>, families: Array<{id:string,partners:string[],children:string[],cx:number,cy:number}> }}
 */
export function layoutTree(input) {
  const ids = new Set(input.persons.map((p) => p.id));
  const byId = new Map(input.persons.map((p) => [p.id, p]));
  const childrenOf = new Map(); // parent -> [child]
  const parentsOf = new Map(); // child -> [parent]
  for (const l of input.parent_links ?? []) {
    if (!ids.has(l.parent_id) || !ids.has(l.child_id)) continue;
    if (l.parent_id === l.child_id) continue;
    if (!childrenOf.has(l.parent_id)) childrenOf.set(l.parent_id, []);
    if (!parentsOf.has(l.child_id)) parentsOf.set(l.child_id, []);
    if (!childrenOf.get(l.parent_id).includes(l.child_id)) childrenOf.get(l.parent_id).push(l.child_id);
    if (!parentsOf.get(l.child_id).includes(l.parent_id)) parentsOf.get(l.child_id).push(l.parent_id);
  }
  const unionsOf = new Map(); // person -> [union]
  for (const u of input.unions ?? []) {
    if (!ids.has(u.person_a_id) || !ids.has(u.person_b_id)) continue;
    if (!unionsOf.has(u.person_a_id)) unionsOf.set(u.person_a_id, []);
    if (!unionsOf.has(u.person_b_id)) unionsOf.set(u.person_b_id, []);
    unionsOf.get(u.person_a_id).push(u);
    unionsOf.get(u.person_b_id).push(u);
  }
  const other = (u, id) => (u.person_a_id === id ? u.person_b_id : u.person_a_id);
  const unionDate = (u) => u.start_date ?? '9999';
  const birthKey = (id) => byId.get(id)?.birth_date ?? '9999';

  /** Pareja principal: la unión más antigua (fechas nulas al final). */
  const primaryOf = new Map();
  for (const [id, list] of unionsOf) {
    const sorted = [...list].sort((a, b) =>
      unionDate(a) < unionDate(b) ? -1 : unionDate(a) > unionDate(b) ? 1 : 0);
    primaryOf.set(id, other(sorted[0], id));
  }

  /**
   * Pareja para ubicar juntos: la de la unión, o si no hay, el co-padre con
   * más hijos en común (padres que comparten hijos van lado a lado aunque no
   * tengan unión registrada).
   */
  const pairOf = new Map(primaryOf);
  const sharedKids = new Map(); // "a<b" -> { a, b, kids: [] }
  for (const [child, ps] of parentsOf) {
    const list = [...new Set(ps.filter((p) => ids.has(p)))].sort();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = list[i] + '<' + list[j];
        if (!sharedKids.has(key)) sharedKids.set(key, { a: list[i], b: list[j], kids: [] });
        sharedKids.get(key).kids.push(child);
      }
    }
  }
  const coparentsOf = new Map(); // id -> [otros padres ordenados por hijos en común]
  for (const { a, b, kids } of sharedKids.values()) {
    if (!coparentsOf.has(a)) coparentsOf.set(a, []);
    if (!coparentsOf.has(b)) coparentsOf.set(b, []);
    coparentsOf.get(a).push({ id: b, n: kids.length });
    coparentsOf.get(b).push({ id: a, n: kids.length });
  }
  for (const [id, list] of coparentsOf) {
    if (pairOf.has(id)) continue;
    list.sort((x, y) => y.n - x.n || (birthKey(x.id) < birthKey(y.id) ? -1 : 1) || (x.id < y.id ? -1 : 1));
    pairOf.set(id, list[0].id);
  }

  // 1. Generaciones: camino más largo desde raíces (sin padres en el set).
  // Quienes son/han sido pareja, o tienen un hijo en común, comparten
  // generación (la más profunda): nadie queda en la fila de sus suegros.
  const gen = new Map();
  for (const id of ids) {
    if (!(parentsOf.get(id) ?? []).length) gen.set(id, 0);
  }
  const unionsIn = (input.unions ?? []).filter((u) => ids.has(u.person_a_id) && ids.has(u.person_b_id));
  // Pares de co-padres (comparten al menos un hijo), haya o no unión.
  const coparentPairs = new Map(); // key -> [a, b]
  for (const [child, ps] of parentsOf) {
    const list = ps.filter((p) => ids.has(p));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = [list[i], list[j]].sort().join('<');
        if (!coparentPairs.has(key)) coparentPairs.set(key, [list[i], list[j]]);
      }
    }
  }
  const alignPairs = [
    ...unionsIn.map((u) => [u.person_a_id, u.person_b_id]),
    ...coparentPairs.values(),
  ];
  let changed = true;
  for (let iter = 0; iter < 60 && changed; iter++) {
    changed = false;
    for (const [child, ps] of parentsOf) {
      const known = ps.filter((p) => gen.has(p));
      if (!known.length) continue;
      const g = Math.max(...known.map((p) => gen.get(p))) + 1;
      if (!gen.has(child) || g > gen.get(child)) {
        gen.set(child, g);
        changed = true;
      }
    }
    for (const [a, b] of alignPairs) {
      const g = Math.max(gen.get(a) ?? 0, gen.get(b) ?? 0);
      if (gen.get(a) !== g) {
        gen.set(a, g);
        changed = true;
      }
      if (gen.get(b) !== g) {
        gen.set(b, g);
        changed = true;
      }
    }
  }
  for (const id of ids) if (!gen.has(id)) gen.set(id, 0); // ciclo defensivo

  // 2. Orden por generación: gen 0 por fecha; el resto por posición de padres.
  const maxGen = Math.max(0, ...gen.values());
  const order = new Map(); // gen -> [ids]
  const posIndex = new Map(); // id -> índice en su generación
  {
    const g0 = [...ids].filter((id) => gen.get(id) === 0)
      .sort((a, b) => birthKey(a) < birthKey(b) ? -1 : birthKey(a) > birthKey(b) ? 1 : a < b ? -1 : 1);
    order.set(0, g0);
    g0.forEach((id, i) => posIndex.set(id, i));
    for (let g = 1; g <= maxGen; g++) {
      const members = [...ids].filter((id) => gen.get(id) === g);
      const withKey = members.map((id) => {
        const ps = parentsOf.get(id) ?? [];
        const idx = ps.filter((p) => posIndex.has(p)).map((p) => posIndex.get(p));
        return { id, key: idx.length ? Math.min(...idx) : Infinity };
      });
      withKey.sort((a, b) =>
        a.key - b.key || (birthKey(a.id) < birthKey(b.id) ? -1 : birthKey(a.id) > birthKey(b.id) ? 1 : a.id < b.id ? -1 : 1));
      order.set(g, withKey.map((x) => x.id));
      withKey.forEach((x, i) => posIndex.set(x.id, i));
    }
  }

  // 3. Coordenadas X de arriba hacia abajo: parejas juntas; hermanos
  // consecutivos (mismos padres) con X_GAP, FAMILY_GAP entre grupos.
  // Se guardan los grupos por generación para el barrido del paso 4.
  const x = new Map();
  const STEP = NODE_W + X_GAP;
  const groupKey = (id, partner) => {
    if (partner && gen.get(partner) === gen.get(id)) {
      return 'couple:' + [id, partner].sort().join('<');
    }
    return ' sib:' + [...(parentsOf.get(id) ?? [])].sort().join('<');
  };
  const groupsByGen = new Map();
  for (let g = 0; g <= maxGen; g++) {
    const ids0 = order.get(g) ?? [];
    // Agrupar consecutivos con misma clave.
    const groups = [];
    const placed = new Set();
    for (const id of ids0) {
      if (placed.has(id)) continue;
      const partner = pairOf.get(id);
      if (partner && gen.get(partner) === g && !placed.has(partner)) {
        groups.push([id, partner]);
        placed.add(id);
        placed.add(partner);
      } else {
        const key = groupKey(id, null);
        const last = groups[groups.length - 1];
        const lastKey = last && last._key;
        if (last && lastKey === key && !last._couple) {
          last.push(id);
        } else {
          const grp = [id];
          grp._key = key;
          grp._couple = false;
          groups.push(grp);
        }
        placed.add(id);
      }
    }
    groupsByGen.set(g, groups);
    let cursor = 0;
    for (const grp of groups) {
      for (const id of grp) {
        x.set(id, cursor);
        cursor += STEP;
      }
      cursor += FAMILY_GAP - X_GAP; // compensa el último X_GAP
    }
  }

  // 4. Recentrado de padres sobre sus hijos (de abajo hacia arriba).
  // Barrido por grupos en orden de ubicación (izquierda a derecha): cada
  // grupo se acerca a la media de sus hijos sin pisar al anterior.
  // Parejas se centran sobre hijos EN COMÚN; solteros sobre los suyos.
  const centerX = (id) => x.get(id) + NODE_W / 2;
  for (let g = maxGen; g >= 0; g--) {
    let cursor = -Infinity;
    for (const members of groupsByGen.get(g) ?? []) {
      let kids;
      if (members.length === 2) {
        const setA = new Set(childrenOf.get(members[0]) ?? []);
        kids = (childrenOf.get(members[1]) ?? []).filter((c) => setA.has(c));
      } else {
        kids = childrenOf.get(members[0]) ?? [];
      }
      const left = Math.min(...members.map((m) => x.get(m)));
      const width = Math.max(...members.map((m) => x.get(m) + NODE_W)) - left;
      let shift = 0;
      if (kids.length) {
        const mean = kids.reduce((s, c) => s + centerX(c), 0) / kids.length;
        shift = mean - (left + width / 2);
      }
      const target = Math.max(cursor, left + shift);
      const dx = target - left;
      if (dx !== 0) {
        for (const m of members) x.set(m, x.get(m) + dx);
      }
      cursor = target + width + FAMILY_GAP;
    }
  }

  const nodes = [...ids].map((id) => ({
    id,
    x: x.get(id) ?? 0,
    y: gen.get(id) * (NODE_H + GEN_GAP),
    gen: gen.get(id),
  }));

  // 5. Familias (núcleos pareja+hijos, más padres solteros con hijos).
  const families = [];
  const seenUnion = new Set();
  for (const u of input.unions ?? []) {
    if (!ids.has(u.person_a_id) || !ids.has(u.person_b_id)) continue;
    const key = [u.person_a_id, u.person_b_id].sort().join('<');
    if (seenUnion.has(key)) continue;
    seenUnion.add(key);
    const kids = new Set();
    for (const p of [u.person_a_id, u.person_b_id]) {
      for (const c of childrenOf.get(p) ?? []) kids.add(c);
    }
    const cx = (centerX(u.person_a_id) + centerX(u.person_b_id)) / 2;
    const cy = (gen.get(u.person_a_id) ?? 0) * (NODE_H + GEN_GAP) + NODE_H / 2;
    families.push({ id: `u:${key}`, partners: [u.person_a_id, u.person_b_id], children: [...kids], cx, cy });
  }
  const inUnion = new Set([...seenUnion].flatMap((k) => k.split('<')));
  for (const [p, kids] of childrenOf) {
    if (inUnion.has(p)) continue;
    if (!kids.length) continue;
    families.push({
      id: `s:${p}`, partners: [p], children: [...kids],
      cx: centerX(p), cy: (gen.get(p) ?? 0) * (NODE_H + GEN_GAP) + NODE_H / 2,
    });
  }

  return { nodes, families };
}

/**
 * Huecos visibles: personas con 0 padres (fundadores sin registrar) o con
 * exactamente 1 (les falta el otro). Se dibuja un solo "?" por persona.
 * @param {Array<{id:string}>} nodes
 * @param {Array<{parent_id:string,child_id:string}>} parent_links
 * @returns {Array<{ forPersonId: string, missing: number }>}
 */
export function computeGaps(nodes, parent_links) {
  const counts = new Map();
  for (const l of parent_links ?? []) {
    counts.set(l.child_id, (counts.get(l.child_id) ?? 0) + 1);
  }
  const ids = new Set((nodes ?? []).map((n) => n.id));
  const gaps = [];
  for (const id of ids) {
    const n = counts.get(id) ?? 0;
    if (n < 2) gaps.push({ forPersonId: id, missing: 2 - n });
  }
  return gaps;
}
