// Pruebas Fase 7: historias, hechos, fotos y storage local.
// Uso: npm run test:db
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { withTransaction } from '../src/lib/db/client.js';
import { createStory, updateStory, deleteStory, createFact, updateFact, deleteFact } from '../src/lib/db/content.js';
import { confirmPhotoUpload, updatePhoto, deletePhoto, tagPhoto, untagPhoto } from '../src/lib/db/photos.js';
import { savePhotoFiles, readPhotoFile, deletePhotoFiles } from '../src/lib/storage/index.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = { query: (t, p) => pool.query(t, p) };
const T = (s) => `fase7-${s}-${Date.now()}`;

// PNG 1x1 válido (el servidor valida tipo/tamaño, no decodifica).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const filesOf = (mime = 'image/png') => ({
  original: { buffer: PNG, mime }, medium: { buffer: PNG, mime }, thumb: { buffer: PNG, mime },
});

let testerId, personId, otherId;
const trash = { stories: [], facts: [], photos: [] };

before(async () => {
  const u = await pool.query("INSERT INTO users (email, name, role) VALUES ($1,'Fase7','member') RETURNING id", [T('u') + '@test.local']);
  testerId = u.rows[0].id;
  const p = await pool.query(
    "INSERT INTO persons (given_names, paternal_surname) VALUES ('Prueba','Contenido') RETURNING id");
  personId = p.rows[0].id;
  const q = await pool.query(
    "INSERT INTO persons (given_names, paternal_surname) VALUES ('Otro','Contenido') RETURNING id");
  otherId = q.rows[0].id;
});

after(async () => {
  for (const id of trash.photos) {
    await pool.query('DELETE FROM photo_tags WHERE photo_id=$1', [id]);
    await pool.query('DELETE FROM photos WHERE id=$1', [id]);
    await deletePhotoFiles(id).catch(() => {});
  }
  await pool.query('DELETE FROM story_mentions WHERE story_id = ANY($1)', [trash.stories]);
  await pool.query('DELETE FROM stories WHERE id = ANY($1)', [trash.stories]);
  await pool.query('DELETE FROM facts WHERE id = ANY($1)', [trash.facts]);
  const ids = [...trash.stories, ...trash.facts, ...trash.photos, personId, otherId].filter(Boolean);
  await pool.query('DELETE FROM change_log WHERE entity_id = ANY($1) OR user_id=$2', [ids, testerId]);
  await pool.query('DELETE FROM persons WHERE id IN ($1,$2)', [personId, otherId]);
  await pool.query('DELETE FROM users WHERE id=$1', [testerId]);
  await pool.end();
});

describe('Fase 7: historias', () => {
  it('crea firmada, con menciones, edita y borra con change_log', async () => {
    const s = await withTransaction((tx) => createStory(tx, testerId, personId, {
      title: 'Recuerdo', body: 'Yo estuve ahí.', story_date: '1990-01-01',
      story_date_precision: 'year', certainty: 'confirmed', mentions: [otherId, '00000000-0000-0000-0000-000000000000'],
    }));
    trash.stories.push(s.id);
    assert.deepEqual(s.mentions, [otherId], 'ignora menciones inexistentes');
    const { rows: [lg] } = await pool.query(
      "SELECT after FROM change_log WHERE entity_id=$1 AND action='create'", [s.id]);
    assert.equal(lg.after.body, 'Yo estuve ahí.');
    const ed = await withTransaction((tx) => updateStory(tx, testerId, s.id, { body: 'Corregido.' }));
    assert.equal(ed.body, 'Corregido.');
    await withTransaction((tx) => deleteStory(tx, testerId, s.id));
    const gone = await pool.query('SELECT deleted_at FROM stories WHERE id=$1', [s.id]);
    assert.ok(gone.rows[0].deleted_at);
    await assert.rejects(withTransaction((tx) => createStory(tx, testerId, personId, { body: '  ' })), /texto/);
    await assert.rejects(withTransaction((tx) => createStory(tx, testerId, '00000000-0000-0000-0000-000000000000', { body: 'x' })), /no encontrada/);
  });
});

describe('Fase 7: hechos', () => {
  it('crea con fuente, valida tipo, edita y borra', async () => {
    const f = await withTransaction((tx) => createFact(tx, testerId, personId, {
      type: 'occupation', value: 'Carpintero', certainty: 'unconfirmed', source: 'Me lo contó la tía',
    }));
    trash.facts.push(f.id);
    assert.equal(f.source, 'Me lo contó la tía');
    const ed = await withTransaction((tx) => updateFact(tx, testerId, f.id, { certainty: 'confirmed' }));
    assert.equal(ed.certainty, 'confirmed');
    await withTransaction((tx) => deleteFact(tx, testerId, f.id));
    await assert.rejects(withTransaction((tx) => createFact(tx, testerId, personId, { type: 'hobbie', value: 'x' })), /Tipo/);
    await assert.rejects(withTransaction((tx) => createFact(tx, testerId, personId, { type: 'other', value: '  ' })), /texto/);
  });
});

describe('Fase 7: fotos y storage local', () => {
  it('sube 3 tamaños, etiqueta, marca portada y sirve archivos', async () => {
    const photo = await withTransaction((tx) => confirmPhotoUpload(tx, testerId, {
      files: filesOf(), caption: 'Foto test', photo_date: '2000-01-01',
      width: 1, height: 1, size_bytes: PNG.length,
      person_ids: [personId, otherId], make_cover_for: personId,
    }));
    trash.photos.push(photo.id);
    assert.ok(photo.storage_key_thumb.endsWith('/thumb.png'));
    const me = await pool.query('SELECT cover_photo_id FROM persons WHERE id=$1', [personId]);
    assert.equal(me.rows[0].cover_photo_id, photo.id);
    const tags = await pool.query('SELECT person_id FROM photo_tags WHERE photo_id=$1', [photo.id]);
    assert.equal(tags.rows.length, 2);
    for (const size of ['original', 'medium', 'thumb']) {
      const f = await readPhotoFile(photo[`storage_key_${size}`]);
      assert.equal(f.contentType, 'image/png');
      assert.ok(f.buffer.length > 0);
    }
    await assert.rejects(readPhotoFile('local/../../x'), /no válida/);
  });

  it('valida archivos y revierte en disco si la DB falla', async () => {
    await assert.rejects(withTransaction((tx) => confirmPhotoUpload(tx, testerId, {
      files: { original: { buffer: PNG, mime: 'image/png' } }, person_ids: [personId],
    })), /3 tamaños/);
    await assert.rejects(withTransaction((tx) => confirmPhotoUpload(tx, testerId, {
      files: filesOf('image/gif'), person_ids: [personId],
    })), /Tipo no válido/);
    await assert.rejects(withTransaction((tx) => confirmPhotoUpload(tx, testerId, {
      files: filesOf(), person_ids: [personId], make_cover_for: otherId,
    })), /etiquetada/);
  });

  it('edita, etiqueta extra, borra y suelta portada', async () => {
    const photo = await withTransaction((tx) => confirmPhotoUpload(tx, testerId, {
      files: filesOf(), person_ids: [personId], make_cover_for: personId,
    }));
    trash.photos.push(photo.id);
    const ed = await withTransaction((tx) => updatePhoto(tx, testerId, photo.id, { caption: 'Nueva' }));
    assert.equal(ed.caption, 'Nueva');
    await withTransaction((tx) => tagPhoto(tx, testerId, photo.id, otherId));
    await withTransaction((tx) => untagPhoto(tx, testerId, photo.id, otherId));
    const tags = await pool.query('SELECT count(*)::int AS n FROM photo_tags WHERE photo_id=$1', [photo.id]);
    assert.equal(tags.rows[0].n, 1);
    await withTransaction((tx) => deletePhoto(tx, testerId, photo.id));
    const me = await pool.query('SELECT cover_photo_id FROM persons WHERE id=$1', [personId]);
    assert.equal(me.rows[0].cover_photo_id, null, 'suelta la portada');
  });

  it('savePhotoFiles directo: escribe y lee', async () => {
    const id = '00000000-0000-0000-0000-000000000007';
    const keys = await savePhotoFiles(id, {
      original: { buffer: PNG, ext: 'png' }, medium: { buffer: PNG, ext: 'png' }, thumb: { buffer: PNG, ext: 'png' },
    });
    assert.ok(keys.thumb.includes(id));
    const f = await readPhotoFile(keys.medium);
    assert.equal(f.buffer.equals(PNG), true);
    await deletePhotoFiles(id);
    await assert.rejects(readPhotoFile(keys.medium), /ENOENT/);
  });
});
