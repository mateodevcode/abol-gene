import { getPerson } from '@/lib/db/persons';
import {
  getChildren, getPartners, getSiblings, getUnclesAunts, getCousins,
  getDescendants, getAncestors,
} from '@/lib/db/tree';

/**
 * Ficha completa de una persona para el Modo Datos: datos, familia,
 * hechos, historias (con menciones) y fotos (con etiquetas).
 */
export async function getProfile(db, personId) {
  const person = await getPerson(db, personId);
  if (!person) throw new Error('Persona no encontrada.');

  const [
    parents, siblings, partners, children, uncles, cousins, facts, stories, photos,
  ] = await Promise.all([
    db.query(
      `SELECT p.*, b.name AS branch_name, b.color AS branch_color,
              pl.kind AS link_kind, pl.certainty AS link_certainty
         FROM parent_links pl JOIN persons p ON p.id = pl.parent_id
         LEFT JOIN branches b ON b.id = p.branch_id
        WHERE pl.child_id=$1 AND pl.deleted_at IS NULL AND p.deleted_at IS NULL
        ORDER BY p.birth_date`, [personId]).then((r) => r.rows),
    getSiblings(db, personId),
    getPartners(db, personId),
    getChildren(db, personId),
    getUnclesAunts(db, personId),
    getCousins(db, personId),
    db.query(
      `SELECT * FROM facts WHERE person_id=$1 AND deleted_at IS NULL ORDER BY created_at`,
      [personId]).then((r) => r.rows),
    db.query(
      `SELECT s.*, u.name AS author_name
         FROM stories s LEFT JOIN users u ON u.id = s.author_user_id
        WHERE s.person_id=$1 AND s.deleted_at IS NULL ORDER BY s.story_date NULLS LAST, s.created_at`,
      [personId]).then((r) => r.rows),
    db.query(
      `SELECT ph.* FROM photos ph WHERE ph.deleted_at IS NULL AND ph.id IN (
         SELECT photo_id FROM photo_tags WHERE person_id=$1
         UNION SELECT cover_photo_id FROM persons WHERE id=$1 AND cover_photo_id IS NOT NULL
       ) ORDER BY ph.photo_date NULLS LAST`, [personId]).then((r) => r.rows),
  ]);

  // Abuelos: padres de los padres.
  const grandparents = [];
  const seenGp = new Set();
  for (const parent of parents) {
    const { rows } = await db.query(
      `SELECT p.*, b.name AS branch_name, b.color AS branch_color
         FROM parent_links pl JOIN persons p ON p.id = pl.parent_id
         LEFT JOIN branches b ON b.id = p.branch_id
        WHERE pl.child_id=$1 AND pl.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [parent.id]);
    for (const gp of rows) {
      if (seenGp.has(gp.id)) continue;
      seenGp.add(gp.id);
      grandparents.push({ ...gp, via_parent_id: parent.id });
    }
  }

  // Menciones y etiquetas por historia/foto.
  const storyIds = stories.map((s) => s.id);
  const mentions = storyIds.length ? (await db.query(
    `SELECT sm.story_id, p.id, p.given_names, p.paternal_surname, p.maternal_surname
       FROM story_mentions sm JOIN persons p ON p.id = sm.person_id
      WHERE sm.story_id = ANY($1) AND p.deleted_at IS NULL`, [storyIds])).rows : [];
  const photoIds = photos.map((p) => p.id);
  const tags = photoIds.length ? (await db.query(
    `SELECT pt.photo_id, p.id, p.given_names, p.paternal_surname, p.maternal_surname
       FROM photo_tags pt JOIN persons p ON p.id = pt.person_id
      WHERE pt.photo_id = ANY($1) AND p.deleted_at IS NULL`, [photoIds])).rows : [];

  return {
    person, parents, grandparents, siblings, partners, children, uncles, cousins,
    facts, stories, mentions, photos, tags,
    counts: {
      parents: parents.length, children: children.length,
      stories: stories.length, photos: photos.length, facts: facts.length,
    },
  };
}

/** Descendencia y ascendencia para las vistas de la ficha. */
export async function getProfileDescendants(db, personId) {
  return getDescendants(db, personId, {});
}

export async function getProfileAncestors(db, personId) {
  return getAncestors(db, personId, {});
}
