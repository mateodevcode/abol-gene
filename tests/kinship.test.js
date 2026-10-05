// Pruebas puras de parentesco (sin DB). Uso: npm run test:db
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeKinship } from '../src/lib/kinship/index.js';

// Árbol fixture: dos ramas que se unen en bisB/bisBa.
const P = {
  yo: ['madre', 'padre'], hermana: ['madre', 'padre'], medio: ['padre', 'otra'],
  madre: ['abueloM', 'abuelaM'], tio: ['abueloM', 'abuelaM'],
  padre: ['abueloP', 'abuelaP'], tiaP: ['abueloP', 'abuelaP'],
  primo: ['tio', 'tia'], primoH: ['tiaP', 'esposoP'], hijoPrimo: ['primoH', 'esposaPH'],
  primoSeg: ['hijoTioBis', 'esposaHTB'], hijoTioBis: ['tioBis', 'tiaBis'],
  abueloP: ['bisB', 'bisBa'], tioBis: ['bisB', 'bisBa'],
  yo2: [], // sin conexión
};
const G = {
  yo: 'M', hermana: 'F', medio: 'M', madre: 'F', padre: 'M', tio: 'M',
  abuelaM: 'F', abueloM: 'M', abueloP: 'M', abuelaP: 'F', bisB: 'M',
  primo: 'M', primoH: 'M', hijoPrimo: 'M', primoSeg: 'M', tiaP: 'F', tia: 'F',
};
const graph = { parents: P, genders: G };
const label = (a, b) => describeKinship(a, b, graph).label;

describe('kinship: línea directa y misma persona', () => {
  it('misma persona', () => assert.equal(label('yo', 'yo'), 'es la misma persona'));
  it('padre y madre', () => {
    assert.equal(label('yo', 'padre'), 'tu padre');
    assert.equal(label('yo', 'madre'), 'tu madre');
  });
  it('abuelos con lado', () => {
    assert.equal(label('yo', 'abuelaM'), 'tu abuela por parte de tu madre');
    assert.equal(label('yo', 'abueloP'), 'tu abuelo por parte de tu padre');
  });
  it('bisabuelo con lado', () => {
    assert.equal(label('yo', 'bisB'), 'tu bisabuelo por parte de tu padre');
  });
  it('hacia abajo', () => {
    assert.equal(label('padre', 'yo'), 'tu hijo');
    assert.equal(label('abuelaM', 'hermana'), 'tu nieta');
  });
});

describe('kinship: colaterales', () => {
  it('hermana y medio hermano', () => {
    assert.equal(label('yo', 'hermana'), 'tu hermana');
    assert.equal(label('yo', 'medio'), 'tu medio hermano');
    assert.equal(label('medio', 'hermana'), 'tu media hermana');
  });
  it('tío y sobrino', () => {
    assert.equal(label('yo', 'tio'), 'tu tío');
    assert.equal(label('tio', 'yo'), 'tu sobrino');
  });
  it('primo hermano y primo segundo', () => {
    assert.equal(label('yo', 'primoH'), 'tu primo');
    assert.equal(label('yo', 'primoSeg'), 'tu primo segundo');
  });
  it('tío segundo y sobrino segundo', () => {
    assert.equal(label('hijoPrimo', 'yo'), 'tu tío segundo');
    assert.equal(label('yo', 'hijoPrimo'), 'tu sobrino segundo');
  });
  it('sin parentesco', () => {
    assert.equal(label('yo', 'yo2'), 'sin parentesco conocido');
  });
  it('ruta A→NCA→B para iluminar camino', () => {
    const r = describeKinship('yo', 'primoH', graph);
    assert.deepEqual(r.route, ['yo', 'padre', 'abueloP', 'tiaP', 'primoH']);
    assert.equal(r.commonAncestor, 'abueloP');
  });
});
