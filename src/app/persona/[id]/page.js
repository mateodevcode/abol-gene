import { notFound } from 'next/navigation';
import { query } from '@/lib/db/client';
import { getProfile, getProfileDescendants, getProfileAncestors } from '@/lib/db/profile';
import { listBranches } from '@/lib/db/branches';
import { fullName, formatLifespan, formatDate, unionKindEs } from '@/lib/format';
import { photoUrl } from '@/lib/photo-url';
import PersonAvatar from '@/components/person/PersonAvatar';
import PersonLink from '@/components/person/PersonLink';
import PersonSearch from '@/components/person/PersonSearch';
import PersonGallery from '@/components/person/PersonGallery';
import PersonEditor from '@/components/person/PersonEditor';
import ConnectRelatives from '@/components/person/ConnectRelatives';
import Stories from '@/components/person/Stories';
import Facts from '@/components/person/Facts';
import Timeline from '@/components/person/Timeline';
import ViewToggle from '@/components/ui/ViewToggle';

const VISTAS = [
  ['ficha', 'Ficha'],
  ['descendencia', 'Descendencia'],
  ['ascendencia', 'Ascendencia'],
];

export default async function PersonaPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const vista = ['descendencia', 'ascendencia'].includes(sp?.vista) ? sp.vista : 'ficha';
  const db = { query };

  let profile;
  try {
    profile = await getProfile(db, id);
  } catch {
    notFound();
  }
  const { person } = profile;
  const branches = await listBranches(db);
  const descendencia = vista === 'descendencia' ? await getProfileDescendants(db, id) : null;
  const ascendencia = vista === 'ascendencia' ? await getProfileAncestors(db, id) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6">
      <PersonSearch />

      <header className="mt-6 flex items-start gap-4">
        <PersonAvatar
          person={person} size="lg"
          photoUrl={person.cover_photo_id ? photoUrl(person.cover_photo_id, 'thumb') : null}
        />
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-stone-900">{fullName(person)}</h1>
          <p className="mt-1 text-xl text-stone-600">{formatLifespan(person) ?? 'Fechas por completar'}</p>
          {person.branch_name && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-stone-200 px-3 py-1 text-base">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: person.branch_color }} />
              Rama {person.branch_name}
            </p>
          )}
        </div>
      </header>

      {person.bio_short && <p className="mt-4 text-xl leading-relaxed text-stone-800">{person.bio_short}</p>}
      {(person.birth_place || person.death_place) && (
        <p className="mt-2 text-lg text-stone-600">
          {[person.birth_place && `Nació en ${person.birth_place}`, person.death_place && `Falleció en ${person.death_place}`].filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <a href={`/arbol?persona=${person.id}`} className="rounded-xl bg-emerald-700 px-4 py-3 text-lg font-semibold text-white">
          Ver en el árbol
        </a>
      </div>

      <nav className="mt-6 flex gap-2 border-b border-stone-200" aria-label="Vistas de la ficha">
        {VISTAS.map(([key, label]) => (
          <a
            key={key}
            href={`/persona/${person.id}${key === 'ficha' ? '' : `?vista=${key}`}`}
            aria-current={vista === key ? 'page' : undefined}
            className={`px-4 py-3 text-lg font-semibold ${vista === key ? 'border-b-4 border-emerald-700 text-emerald-900' : 'text-stone-500'}`}
          >
            {label}
            {key === 'descendencia' && profile.counts.children > 0 ? ` (${profile.counts.children} hijos)` : ''}
          </a>
        ))}
      </nav>

      {vista === 'ficha' && <Ficha profile={profile} branches={branches} editOpen={sp?.editar === '1'} />}
      {vista === 'descendencia' && descendencia && <Descendencia data={descendencia} />}
      {vista === 'ascendencia' && ascendencia && <Ascendencia data={ascendencia} />}

      <ViewToggle mode="data" personId={person.id} />
    </main>
  );
}

function Section({ title, children, empty = null }) {
  return (
    <section className="mt-8">
      <h2 className="text-2xl font-bold text-stone-900">{title}</h2>
      <div className="mt-3 flex flex-col gap-2">{children ?? <p className="text-lg text-stone-500">{empty}</p>}</div>
    </section>
  );
}

function Ficha({ profile, branches, editOpen = false }) {
  const { person, parents, grandparents, siblings, partners, children, uncles, cousins, facts, stories, mentions, photos } = profile;
  const branchOptions = [];
  if (!person.branch_id) {
    const seen = new Set();
    for (const p of [...parents, ...partners]) {
      if (p.branch_id && !seen.has(p.branch_id)) {
        seen.add(p.branch_id);
        branchOptions.push({ id: p.branch_id, name: p.branch_name ?? 'Rama', color: p.branch_color ?? '#78716c' });
      }
    }
  }
  return (
    <>
      <PersonEditor person={person} branches={branches} startOpen={editOpen} />

      <Section title="Conectar parientes">
        <ConnectRelatives personId={person.id} personName={person.given_names} branchOptions={branchOptions} />
      </Section>

      <Section title={`Padres (${parents.length})`} empty="Padres por registrar.">
        {parents.map((p) => <PersonLink key={p.id} person={p} sub={p.link_kind !== 'biological' ? `Vínculo ${p.link_kind}` : null} />)}
      </Section>

      <Section title={`Hermanos (${siblings.full.length})`} empty="Sin hermanos registrados.">
        {siblings.full.map((p) => <PersonLink key={p.id} person={p} />)}
      </Section>
      {siblings.half.length > 0 && (
        <Section title={`Medios hermanos (${siblings.half.length})`}>
          {siblings.half.map((p) => <PersonLink key={p.id} person={p} />)}
        </Section>
      )}

      <Section title={`Pareja${partners.length === 1 ? '' : 's'} (${partners.length})`} empty="Sin parejas registradas.">
        {partners.map((p) => (
          <PersonLink
            key={p.union_id} person={p}
            sub={`${unionKindEs(p.union_kind)}${p.start_date ? ` · desde ${formatDate(p.start_date, p.start_date_precision)}` : ''}${p.end_reason ? ` · fin: ${p.end_reason}` : ''}`}
          />
        ))}
      </Section>

      <Section title={`Hijos (${children.length})`} empty="Sin hijos registrados.">
        {children.map((p) => <PersonLink key={p.id} person={p} />)}
      </Section>

      {grandparents.length > 0 && (
        <Section title={`Abuelos (${grandparents.length})`}>
          {grandparents.map((p) => <PersonLink key={p.id} person={p} />)}
        </Section>
      )}
      {uncles.length > 0 && (
        <Section title={`Tíos (${uncles.length})`}>
          {uncles.map((p) => <PersonLink key={p.id} person={p} />)}
        </Section>
      )}
      {cousins.length > 0 && (
        <Section title={`Primos (${cousins.length})`}>
          {cousins.map((p) => <PersonLink key={p.id} person={p} />)}
        </Section>
      )}

      <Section title={`Línea de vida`}>
        <Timeline profile={profile} />
      </Section>

      <Section title={`Fotos (${photos.length})`}>
        <PersonGallery personId={person.id} initialPhotos={photos} initialTags={profile.tags} coverPhotoId={person.cover_photo_id} />
      </Section>

      <Section title={`Historias (${stories.length})`}>
        <Stories personId={person.id} initialStories={stories} initialMentions={mentions} />
      </Section>

      <Section title={`Datos (${facts.length})`}>
        <Facts personId={person.id} initialFacts={facts} />
      </Section>
    </>
  );
}

function Descendencia({ data }) {
  if (data.total === 0) return <p className="mt-6 text-xl text-stone-500">Sin descendencia registrada.</p>;
  return (
    <div className="mt-6 flex flex-col gap-6">
      <p className="text-xl font-semibold text-stone-900">
        {data.total} descendiente{data.total === 1 ? '' : 's'} en {data.generations === 1 ? '1 generación' : `${data.generations} generaciones`}
      </p>
      {data.children.map((g) => (
        <section key={g.child.id} className="rounded-2xl border border-stone-200 p-4">
          <PersonLink person={g.child} sub={`${g.count} descendiente${g.count === 1 ? '' : 's'} por esta rama`} />
          {Object.entries(g.byGeneration).sort(([a], [b]) => a - b).map(([gen, people]) => (
            <div key={gen} className="mt-3">
              <h3 className="text-lg font-semibold text-stone-700">Generación {gen}</h3>
              <div className="mt-2 flex flex-col gap-2">
                {people.filter((p) => p.id !== g.child.id).map((p) => <PersonLink key={p.id} person={p} />)}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function Ascendencia({ data }) {
  if (data.length === 0) return <p className="mt-6 text-xl text-stone-500">Sin ascendencia registrada.</p>;
  const byGen = new Map();
  for (const p of data) (byGen.get(p.depth) ?? byGen.set(p.depth, []).get(p.depth)).push(p);
  return (
    <div className="mt-6 flex flex-col gap-6">
      {[...byGen.entries()].sort(([a], [b]) => a - b).map(([gen, people]) => (
        <section key={gen}>
          <h3 className="text-xl font-semibold text-stone-900">
            {gen === 1 ? 'Padres' : gen === 2 ? 'Abuelos' : gen === 3 ? 'Bisabuelos' : `Generación ${gen}`}
          </h3>
          <div className="mt-2 flex flex-col gap-2">
            {people.map((p) => <PersonLink key={p.id} person={p} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
