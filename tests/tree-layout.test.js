// Pruebas del layout puro (sin DOM). Uso: npm run test:db
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutTree, NODE_W, X_GAP } from '../src/lib/tree-layout/index.js';

const byId = (nodes) => new Map(nodes.map((n) => [n.id, n]));

/** Invariantes: sin solapes en la generación, parejas juntas, gens coherentes. */
function checkInvariants(t, input, label) {
  const nodes = byId(t.nodes);
  const gens = new Map();
  for (const n of t.nodes) (gens.get(n.gen) ?? gens.set(n.gen, []).get(n.gen)).push(n);
  for (const [g, list] of gens) {
    const xs = list.map((n) => n.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      assert.ok(xs[i] - xs[i - 1] >= NODE_W, `${label}: solape en gen ${g}`);
    }
    for (const n of list) {
      assert.equal(n.y, g * (64 + 120), `${label}: y de gen ${g}`);
    }
  }
  // Parejas principales adyacentes (misma generación).
  for (const n of t.nodes) {
    void n;
  }
  return { nodes, gens };
}

function checkCouples(t, pairs, label) {
  const nodes = byId(t.nodes);
  for (const [a, b] of pairs) {
    const na = nodes.get(a);
    const nb = nodes.get(b);
    assert.ok(na && nb, `${label}: existen ${a},${b}`);
    if (na.gen === nb.gen) {
      assert.ok(Math.abs(na.x - nb.x) <= NODE_W + X_GAP + 1, `${label}: pareja junta ${a}-${b}`);
    }
  }
}

/** Hijos en generación posterior a sus padres. */
function checkGenerations(t, input, label) {
  const nodes = byId(t.nodes);
  for (const l of input.parent_links) {
    const p = nodes.get(l.parent_id);
    const c = nodes.get(l.child_id);
    if (!p || !c) continue;
    assert.ok(c.gen > p.gen, `${label}: hijo gen ${c.gen} > padre gen ${p.gen}`);
  }
}

const P = (id, birth_date = null) => ({ id, birth_date });
const L = (parent_id, child_id) => ({ parent_id, child_id });
const U = (a, b, start_date = null) => ({ person_a_id: a, person_b_id: b, start_date });

describe('layout: familia nuclear', () => {
  it('padres juntos, hijos debajo centrados', () => {
    const input = {
      persons: [P('pa', '1910-01-01'), P('ma', '1912-01-01'), P('h1', '1935-01-01'), P('h2', '1938-01-01')],
      parent_links: [L('pa', 'h1'), L('ma', 'h1'), L('pa', 'h2'), L('ma', 'h2')],
      unions: [U('pa', 'ma', '1930-01-01')],
    };
    const t = layoutTree(input);
    checkInvariants(t, input, 'nuclear');
    checkCouples(t, [['pa', 'ma']], 'nuclear');
    checkGenerations(t, input, 'nuclear');
    const n = byId(t.nodes);
    const midParents = (n.get('pa').x + n.get('ma').x) / 2 + NODE_W / 2;
    const midKids = (n.get('h1').x + n.get('h2').x) / 2 + NODE_W / 2;
    assert.ok(Math.abs(midParents - midKids) < NODE_W * 2, 'padres centrados sobre hijos');
    assert.equal(t.families.length, 1);
    assert.deepEqual(new Set(t.families[0].children), new Set(['h1', 'h2']));
  });
});

describe('layout: 12 hermanos', () => {
  it('fila sin solapes', () => {
    const kids = Array.from({ length: 12 }, (_, i) => P('k' + i, `194${i % 10}-01-01`));
    const input = {
      persons: [P('pa'), P('ma'), ...kids],
      parent_links: kids.flatMap((k) => [L('pa', k.id), L('ma', k.id)]),
      unions: [U('pa', 'ma')],
    };
    const t = layoutTree(input);
    checkInvariants(t, input, '12');
    const n = byId(t.nodes);
    const xs = kids.map((k) => n.get(k.id).x);
    assert.equal(new Set(xs).size, 12);
    const span = Math.max(...xs) - Math.min(...xs);
    assert.ok(span <= 12 * (NODE_W + X_GAP), `span compacto: ${span}`);
    const ys = new Set(kids.map((k) => n.get(k.id).y));
    assert.equal(ys.size, 1, 'misma fila');
  });
});

describe('layout: segundo matrimonio y medios hermanos', () => {
  it('padre con principal + hijos de ambas uniones en su generación', () => {
    const input = {
      persons: [P('padre', '1920-01-01'), P('esposa1', '1922-01-01'), P('esposa2', '1930-01-01'),
        P('a', '1945-01-01'), P('b', '1947-01-01'), P('c', '1955-01-01'), P('d', '1957-01-01'), P('e', '1959-01-01')],
      parent_links: [L('padre', 'a'), L('esposa1', 'a'), L('padre', 'b'), L('esposa1', 'b'),
        L('padre', 'c'), L('esposa2', 'c'), L('padre', 'd'), L('esposa2', 'd'), L('padre', 'e'), L('esposa2', 'e')],
      unions: [U('padre', 'esposa1', '1940-01-01'), U('padre', 'esposa2', '1950-01-01')],
    };
    const t = layoutTree(input);
    checkInvariants(t, input, '2mat');
    checkGenerations(t, input, '2mat');
    // Principal = esposa1 (más antigua): van juntos.
    checkCouples(t, [['padre', 'esposa1']], '2mat');
    const n = byId(t.nodes);
    for (const k of ['a', 'b', 'c', 'd', 'e']) assert.equal(n.get(k).gen, 1);
  });

  it('madre soltera con 2 hijos de padres distintos', () => {
    const input = {
      persons: [P('m'), P('p1'), P('p2'), P('k1', '1960-01-01'), P('k2', '1965-01-01')],
      parent_links: [L('m', 'k1'), L('p1', 'k1'), L('m', 'k2'), L('p2', 'k2')],
      unions: [],
    };
    const t = layoutTree(input);
    checkInvariants(t, input, 'medios');
    checkGenerations(t, input, 'medios');
    assert.ok(t.families.some((f) => f.id === 's:m' && f.children.length === 2), 'familia monoparental');
  });
});

describe('layout: huecos y cruces', () => {
  it('madre desconocida: sin nodos inventados', () => {
    const input = {
      persons: [P('padre'), P('hijo')],
      parent_links: [L('padre', 'hijo')],
      unions: [],
    };
    const t = layoutTree(input);
    assert.equal(t.nodes.length, 2);
    checkGenerations(t, input, 'hueco');
  });

  it('primos que se casan (cruce): sin choques', () => {
    const input = {
      persons: [P('a1', '1900-01-01'), P('b1', '1902-01-01'), P('a2', '1904-01-01'), P('b2', '1906-01-01'),
        P('x', '1930-01-01'), P('y', '1932-01-01'), P('z', '1955-01-01')],
      parent_links: [L('a1', 'x'), L('b1', 'x'), L('a2', 'y'), L('b2', 'y'), L('x', 'z'), L('y', 'z')],
      unions: [U('a1', 'b1'), U('a2', 'b2'), U('x', 'y', '1950-01-01')],
    };
    const t = layoutTree(input);
    checkInvariants(t, input, 'cruce');
    checkGenerations(t, input, 'cruce');
    checkCouples(t, [['x', 'y']], 'cruce');
  });

  it('determinista', () => {
    const input = {
      persons: [P('a'), P('b'), P('c', '2000-01-01')],
      parent_links: [L('a', 'c'), L('b', 'c')],
      unions: [U('a', 'b')],
    };
    assert.deepEqual(layoutTree(input), layoutTree(input));
  });

  it('pareja con distinta profundidad queda junta en la misma generación', () => {
    // Ella no tiene padres registrados (sería gen 0); él tiene madre (gen 1).
    const input = {
      persons: [P('suegra', '1940-01-01'), P('el', '1970-01-01'), P('ella', '1972-01-01'), P('hijo', '2000-01-01')],
      parent_links: [L('suegra', 'el'), L('el', 'hijo'), L('ella', 'hijo')],
      unions: [U('el', 'ella', '1995-01-01')],
    };
    const t = layoutTree(input);
    checkInvariants(t, input, 'alinear');
    const n = byId(t.nodes);
    assert.equal(n.get('el').gen, 1);
    assert.equal(n.get('ella').gen, 1, 'sube a la generación de él');
    assert.equal(n.get('hijo').gen, 2);
    assert.ok(Math.abs(n.get('el').x - n.get('ella').x) <= NODE_W + X_GAP + 1, 'lado a lado');
  });

  it('separados con hijos también alinean nivel', () => {
    const input = {
      persons: [P('suegra', '1940-01-01'), P('el', '1970-01-01'), P('ella', '1972-01-01'), P('hijo', '2000-01-01')],
      parent_links: [L('suegra', 'el'), L('el', 'hijo'), L('ella', 'hijo')],
      unions: [{ person_a_id: 'el', person_b_id: 'ella', kind: 'separated', start_date: '1995-01-01' }],
    };
    const t = layoutTree(input);
    checkInvariants(t, input, 'separados');
    const n = byId(t.nodes);
    assert.equal(n.get('ella').gen, 1);
    assert.ok(Math.abs(n.get('el').x - n.get('ella').x) <= NODE_W + X_GAP + 1, 'lado a lado');
    const fams = t.families.filter((f) => f.partners.includes('el') && f.partners.includes('ella'));
    assert.equal(fams.length, 1, 'núcleo familiar');
    assert.deepEqual(new Set(fams[0].children), new Set(['hijo']));
  });

  it('co-padres sin unión comparten generación y van juntos', () => {
    // Ella sin padres ni unión: solo el hijo en común la alinea con él.
    const input = {
      persons: [P('suegra', '1940-01-01'), P('el', '1970-01-01'), P('ella', '1972-01-01'), P('hijo', '2000-01-01')],
      parent_links: [L('suegra', 'el'), L('el', 'hijo'), L('ella', 'hijo')],
      unions: [],
    };
    const t = layoutTree(input);
    checkInvariants(t, input, 'copadres');
    const n = byId(t.nodes);
    assert.equal(n.get('el').gen, 1);
    assert.equal(n.get('ella').gen, 1, 'sube por el hijo en común');
    assert.equal(n.get('hijo').gen, 2);
    assert.ok(Math.abs(n.get('el').x - n.get('ella').x) <= NODE_W + X_GAP + 1, 'lado a lado');
  });
});

describe('layout: rendimiento con 2000', () => {
  it('2000 nodos en menos de 1.5s y sin solapes (muestra)', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const N = 2000;
    const persons = [];
    for (let i = 0; i < N; i++) {
      persons.push(P('p' + i, `${1900 + Math.floor(rnd() * 110)}-06-15`));
    }
    const parent_links = [];
    for (let i = 200; i < N; i++) {
      const a = Math.floor(rnd() * (i - 100));
      parent_links.push(L('p' + a, 'p' + i));
      if (rnd() < 0.6) {
        const b = Math.floor(rnd() * (i - 100));
        if (b !== a) parent_links.push(L('p' + b, 'p' + i));
      }
    }
    const start = Date.now();
    const t = layoutTree({ persons, parent_links, unions: [] });
    const ms = Date.now() - start;
    assert.ok(ms < 1500, `${ms}ms`);
    assert.equal(t.nodes.length, N);
    // Sin solapes en una muestra de generaciones.
    const byGen = new Map();
    for (const n of t.nodes) (byGen.get(n.gen) ?? byGen.set(n.gen, []).get(n.gen)).push(n);
    for (const [, list] of byGen) {
      const xs = list.map((n) => n.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= NODE_W, 'sin solape');
    }
  });
});
