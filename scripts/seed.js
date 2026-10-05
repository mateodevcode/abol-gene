// Seed Fase 1: familia demo realista + generador sintético (2000+).
// Uso:
//   npm run db:seed                    -> demo + sintéticos (si la DB está vacía)
//   npm run db:seed -- --force         -> borra datos y resiembra todo
//   npm run db:seed -- --demo-only     -> solo familia demo
//   npm run db:seed -- --synthetic-only --count 2000
//
// NOTA: el seed escribe directo (bootstrap) sin pasar por change_log;
// el historial se genera desde Fase 3 en cada escritura de la app.
import pg from 'pg';

const args = process.argv.slice(2);
const OPT = {
  force: args.includes('--force'),
  demoOnly: args.includes('--demo-only'),
  syntheticOnly: args.includes('--synthetic-only'),
  count: Number((args.find((a) => a.startsWith('--count=')) || '').split('=')[1] ?? 2000) || 2000,
};

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const DATA_TABLES = [
  'merge_candidates', 'change_log', 'invites', 'users', 'photo_tags', 'photos',
  'facts', 'story_mentions', 'stories', 'unions', 'parent_links', 'persons', 'branches',
];

try {
  const { rows: [{ count }] } = await client.query('SELECT count(*)::int AS count FROM persons');
  if (count > 0 && !OPT.force && !OPT.syntheticOnly) {
    console.log(`Hay ${count} personas. Usa --force para resembrar o --synthetic-only para agregar sintéticos.`);
    process.exit(0);
  }
  if (OPT.force) {
    // Seguro contra borrado de datos reales: --force con usuarios exige confirmación.
    const { rows: [u] } = await client.query('SELECT count(*)::int AS n FROM users');
    if (u.n > 0 && !args.includes('--i-am-sure')) {
      console.error(`Hay ${u.n} usuario(s) reales. --force BORRA TODO (incluye datos reales).`);
      console.error('Si de verdad quieres resembrar desde cero, repite con --i-am-sure.');
      process.exit(1);
    }
    console.log('Limpiando datos...');
    await client.query(`TRUNCATE ${DATA_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  }

  if (!OPT.syntheticOnly) await seedDemo();
  if (!OPT.demoOnly) await seedSynthetic(OPT.count);

  const stats = await client.query(`
    SELECT (SELECT count(*) FROM persons) AS persons,
           (SELECT count(*) FROM parent_links) AS links,
           (SELECT count(*) FROM unions) AS unions,
           (SELECT count(*) FROM branches) AS branches`);
  console.log('STATS ' + JSON.stringify(stats.rows[0]));
} finally {
  await client.end();
}

// ================= familia demo =================
// Claves: G1 fundadores -> G2 -> G3 (12 hermanos incl.) -> G4 -> G5.
async function seedDemo() {
  const ids = {};
  const mkBranch = async (name, color, founderKey) => {
    const { rows: [b] } = await client.query(
      'INSERT INTO branches (name, color) VALUES ($1,$2) RETURNING id', [name, color]);
    ids['br:' + name] = b.id;
    if (founderKey) ids['founder:' + name] = founderKey;
  };
  await mkBranch('García', '#4F86C6');
  await mkBranch('Torres', '#E07A5F');

  // [key, given, paternal, maternal, nick, gender, birth, birthPrec, death, deathPrec, living, branch, bio, birthSurname]
  const P = [
    // G1 fundadores (fechas aproximadas)
    ['jose', 'José María', 'García', 'López', null, 'M', '1880-01-01', 'decade', '1955-03-10', 'year', false, 'García', 'Fundador de la rama García. Finca cafetalera.', null],
    ['rosa', 'Rosa', 'Martínez', 'Ruiz', 'Rosita', 'F', '1885-06-01', 'approximate', '1960-01-01', 'year', false, 'García', 'Famosa por sus tamales de diciembre.', null],
    ['manuel', 'Manuel', 'Torres', 'Vega', null, 'M', '1882-01-01', 'decade', '1950-01-01', 'year', false, 'Torres', 'Fundador de la rama Torres. Carpintero de Cartago.', null],
    ['carmenR', 'Carmen', 'Ruiz', 'Díaz', null, 'F', '1888-01-01', 'approximate', '1962-01-01', 'year', false, 'Torres', null, null],
    // G2 hijos de José+Rosa
    ['francisco', 'Francisco', 'García', 'Martínez', 'Paco', 'M', '1910-04-12', 'day', '1990-11-02', 'day', false, 'García', null, null],
    ['carmenG', 'Carmen', 'García', 'Martínez', null, 'F', '1912-09-03', 'day', '2001-05-20', 'day', false, 'García', 'Madre de doce hijos en dos uniones.', 'García Martínez'],
    ['pedro', 'Pedro', 'García', 'Martínez', null, 'M', '1915-01-01', 'year', '1988-01-01', 'year', false, 'García', null, null],
    ['ana', 'Ana', 'García', 'Martínez', 'Anita', 'F', '1920-01-25', 'day', '2015-06-30', 'day', false, 'García', null, 'García Martínez'],
    // G2 hijos de Manuel+CarmenR
    ['antonio', 'Antonio', 'Torres', 'Ruiz', null, 'M', '1910-07-19', 'day', '1985-02-11', 'day', false, 'Torres', 'Segundo esposo de Carmen García.', null],
    ['luciaT', 'Lucía', 'Torres', 'Ruiz', null, 'F', '1914-12-01', 'day', '1998-08-08', 'day', false, 'Torres', null, 'Torres Ruiz'],
    // cónyuges G2
    ['miguel', 'Miguel', 'Hernández', 'Vega', null, 'M', '1908-01-01', 'year', '1975-01-01', 'year', false, null, 'Primera pareja de Carmen (unión libre).', null],
    ['elenaV', 'Elena', 'Vargas', 'Soto', null, 'F', '1913-03-15', 'day', '1995-09-09', 'day', false, null, null, null],
    ['marta', 'Marta', 'Jiménez', 'Castro', null, 'F', '1918-05-05', 'day', '2000-12-12', 'day', false, null, null, null],
    ['luis', 'Luis', 'Ramírez', 'Mora', null, 'M', '1916-02-02', 'day', '1982-04-04', 'day', false, null, null, null],
    ['jorge', 'Jorge', 'Castillo', 'Núñez', null, 'M', '1912-10-10', 'day', '1990-07-07', 'day', false, null, null, null],
    // G3: los 12 hijos de Carmen (2 con Miguel, 10 con Antonio)
    ['raul', 'Raúl', 'Hernández', 'García', null, 'M', '1931-02-20', 'day', '2010-01-01', 'year', false, 'García', null, null],
    ['sonia', 'Sonia', 'Hernández', 'García', null, 'F', '1934-06-11', 'day', '2018-03-03', 'day', false, 'García', null, null],
    ['elenaL', 'Elena', 'Torres', 'García', null, 'F', '1948-01-30', 'day', null, null, true, 'García', 'Maestra pensionada.', null],
    ['rosa2', 'Rosa', 'Torres', 'García', 'Rosita', 'F', '1949-04-04', 'day', null, null, true, 'García', null, null],
    ['manuel2', 'Manuel', 'Torres', 'García', null, 'M', '1950-01-01', 'approximate', '2020-02-02', 'day', false, 'García', 'Fecha de nacimiento aproximada: hacia 1950.', null],
    ['jose2', 'José', 'Torres', 'García', 'Chepe', 'M', '1951-08-17', 'day', null, null, true, 'García', null, null],
    ['carmen2', 'Carmen', 'Torres', 'García', null, 'F', '1953-11-23', 'day', null, null, true, 'García', null, null],
    ['francisco2', 'Francisco', 'Torres', 'García', 'Paquito', 'M', '1954-01-01', 'year', '2022-09-09', 'day', false, 'García', null, null],
    ['luis2', 'Luis', 'Torres', 'García', null, 'M', '1956-05-06', 'day', null, null, true, 'García', null, null],
    ['ana2', 'Ana', 'Torres', 'García', null, 'F', '1958-12-12', 'day', null, null, true, 'García', null, null],
    ['pedro2', 'Pedro', 'Torres', 'García', null, 'M', '1960-03-03', 'day', null, null, true, 'García', null, null],
    ['teresa', 'Teresa', 'Torres', 'García', 'Tere', 'F', '1962-07-07', 'day', null, null, true, 'García', 'Médica. La menor de los doce.', null],
    // parejas e hijos extra G3
    ['roberto', 'Roberto', 'Salas', 'Quirós', null, 'M', '1945-09-09', 'day', '2000-04-04', 'day', false, null, 'Primer esposo de Elena.', null],
    ['luciaF', 'Lucía', 'Fernández', 'Mora', null, 'F', '1950-02-14', 'day', null, null, true, 'Torres', null, null],
    ['gabriela', 'Gabriela', 'Salas', 'Torres', 'Gaby', 'F', '1975-06-06', 'day', null, null, true, 'García', null, null],
    ['diego', 'Diego', 'Torres', 'Fernández', null, 'M', '2010-02-14', 'day', null, null, true, 'Torres', 'Hijo adoptivo de Elena y Lucía.', null],
    ['andres', 'Andrés', 'García', 'Vargas', null, 'M', '1936-01-01', 'year', '2005-01-01', 'year', false, 'García', null, null],
    ['maria', 'María', 'García', 'Vargas', null, 'F', '1939-07-07', 'day', null, null, true, 'García', null, null],
    ['jorgeCh', 'Jorge', 'García', 'Vargas', null, 'M', '1942-03-03', 'day', null, null, true, 'García', null, null],
    ['carlos', 'Carlos', 'García', 'Jiménez', null, 'M', '1941-11-11', 'day', null, null, true, 'García', null, null],
    ['sofia', 'Sofía', 'García', 'Jiménez', null, 'F', '1944-04-04', 'day', null, null, true, 'García', null, null],
    ['ricardo', 'Ricardo', 'Ramírez', 'García', null, 'M', '1943-08-08', 'day', '2021-01-01', 'year', false, 'García', null, null],
    ['fernando', 'Fernando', 'Castillo', 'Torres', null, 'M', '1937-05-05', 'day', '2019-06-06', 'day', false, 'Torres', null, null],
    ['patricia', 'Patricia', 'Castillo', 'Torres', 'Paty', 'F', '1940-10-10', 'day', null, null, true, 'Torres', null, null],
    ['daniel', 'Daniel', 'Castillo', 'Torres', null, 'M', '1945-12-12', 'day', null, null, true, 'Torres', null, null],
    // cónyuges G3 (para G4)
    ['sara', 'Sara', 'Monge', 'Blanco', null, 'F', '1978-01-01', 'year', null, null, true, null, null, null],
    ['david', 'David', 'Rojas', 'Alvarado', null, 'M', '1973-02-02', 'day', null, null, true, null, null, null],
    ['karla', 'Karla', 'Soto', 'Mena', null, 'F', '1968-03-03', 'day', null, null, true, null, null, null],
    ['esteban', 'Esteban', 'Vega', 'Cordero', null, 'M', '1970-04-04', 'day', null, null, true, null, null, null],
    ['natalia', 'Natalia', 'Pérez', 'Guzmán', null, 'F', '1980-05-05', 'day', null, null, true, null, null, null],
    ['marco', 'Marco', 'Herrera', 'León', null, 'M', '1965-06-06', 'day', null, null, true, null, null, null],
    // G4
    ['valeria', 'Valeria', 'Rojas', 'Salas', null, 'F', '2000-09-09', 'day', null, null, true, 'García', null, null],
    ['sebas', 'Sebastián', 'Rojas', 'Salas', null, 'M', '2003-04-04', 'day', null, null, true, 'García', null, null],
    ['camila', 'Camila', 'Torres', 'Soto', null, 'F', '1995-02-02', 'day', null, null, true, 'García', null, null],
    ['felipe', 'Felipe', 'Torres', 'Soto', null, 'M', '1998-08-08', 'day', null, null, true, 'García', null, null],
    ['luciana', 'Luciana', 'García', 'Vega', null, 'F', '1996-06-06', 'day', null, null, true, 'García', null, null],
    ['matias', 'Matías', 'García', 'Vega', null, 'M', '1999-01-01', 'year', null, null, true, 'García', null, null],
    ['emma', 'Emma', 'Castillo', 'Pérez', null, 'F', '2005-03-03', 'day', null, null, true, 'Torres', null, null],
    ['thiago', 'Thiago', 'Castillo', 'Pérez', null, 'M', '2008-07-07', 'day', null, null, true, 'Torres', null, null],
    ['renata', 'Renata', 'García', 'Herrera', null, 'F', '1992-11-11', 'day', null, null, true, 'García', null, null],
    ['santiago', 'Santiago', 'García', 'Herrera', null, 'M', '1994-12-12', 'day', null, null, true, 'García', null, null],
    // G5 (bisnietos: 5 generaciones completas)
    ['gael', 'Gael', 'Rojas', 'Valeria', null, 'M', '2024-05-05', 'day', null, null, true, 'García', 'Primer tataranieto de José y Rosa.', null],
    ['mia', 'Mía', 'Torres', 'Camila', null, 'F', '2022-02-02', 'day', null, null, true, 'García', null, null],
  ];

  for (const [k, given, pat, mat, nick, sex, b, bprec, d, dprec, liv, br, bio, bs] of P) {
    const { rows: [r] } = await client.query(
      `INSERT INTO persons (given_names, paternal_surname, maternal_surname, nickname, gender,
        birth_date, birth_date_precision, death_date, death_date_precision,
        is_living, branch_id, bio_short, birth_surname)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [given, pat, mat, nick, sex, b, bprec, d, dprec, liv, br ? ids['br:' + br] : null, bio, bs]);
    ids[k] = r.id;
  }
  // fundadores de rama
  await client.query('UPDATE branches SET founder_person_id=$1 WHERE name=$2', [ids.jose, 'García']);
  await client.query('UPDATE branches SET founder_person_id=$1 WHERE name=$2', [ids.manuel, 'Torres']);

  // vínculos padre/hijo [parent, child, kind, certainty]
  const L = [
    ['jose', 'francisco'], ['rosa', 'francisco'],
    ['jose', 'carmenG'], ['rosa', 'carmenG'],
    ['jose', 'pedro'], ['rosa', 'pedro'],
    ['jose', 'ana'], ['rosa', 'ana'],
    ['manuel', 'antonio'], ['carmenR', 'antonio'],
    ['manuel', 'luciaT'], ['carmenR', 'luciaT'],
    // Carmen + Miguel: 2 hijos (medios hermanos de los otros 10)
    ['carmenG', 'raul'], ['miguel', 'raul'],
    ['carmenG', 'sonia'], ['miguel', 'sonia'],
    // Carmen + Antonio: 10 hijos (completan los 12 hermanos)
    ...['elenaL', 'rosa2', 'manuel2', 'jose2', 'carmen2', 'francisco2', 'luis2', 'ana2', 'pedro2', 'teresa']
      .flatMap((c) => [[ 'carmenG', c], ['antonio', c]]),
    // Elena: hija biológica con Roberto + hijo adoptivo con Lucía (pareja mismo sexo)
    ['elenaL', 'gabriela'], ['roberto', 'gabriela'],
    ['elenaL', 'diego', 'adoptive'], ['luciaF', 'diego', 'adoptive'],
    ['francisco', 'andres'], ['elenaV', 'andres'],
    ['francisco', 'maria'], ['elenaV', 'maria'],
    ['francisco', 'jorgeCh'], ['elenaV', 'jorgeCh'],
    ['pedro', 'carlos'], ['marta', 'carlos'],
    ['pedro', 'sofia'], ['marta', 'sofia'],
    ['ana', 'ricardo'], ['luis', 'ricardo'],
    ['luciaT', 'fernando'], ['jorge', 'fernando'],
    ['luciaT', 'patricia'], ['jorge', 'patricia'],
    ['luciaT', 'daniel'], ['jorge', 'daniel'],
    // G4
    ['gabriela', 'valeria'], ['david', 'valeria'],
    ['gabriela', 'sebas'], ['david', 'sebas'],
    ['jose2', 'camila'], ['karla', 'camila'],
    ['jose2', 'felipe'], ['karla', 'felipe'],
    ['andres', 'luciana'], ['sara', 'luciana'],
    ['andres', 'matias'], ['sara', 'matias'],
    ['fernando', 'emma'], ['natalia', 'emma'],
    ['fernando', 'thiago'], ['natalia', 'thiago'],
    ['carlos', 'renata'], ['esteban', 'renata'],
    ['carlos', 'santiago'], ['esteban', 'santiago'],
    // G5
    ['valeria', 'gael'],
    ['camila', 'mia'], ['marco', 'mia'],
  ];
  for (const [p, c, kind = 'biological', cert = 'confirmed'] of L) {
    await client.query(
      'INSERT INTO parent_links (parent_id, child_id, kind, certainty) VALUES ($1,$2,$3,$4)',
      [ids[p], ids[c], kind, cert]);
  }

  // uniones [a, b, kind, start, startPrec, end, endPrec, endReason]
  const U = [
    ['jose', 'rosa', 'marriage', '1905-02-14', 'day', null, null, null],
    ['manuel', 'carmenR', 'marriage', '1908-01-01', 'year', null, null, null],
    ['carmenG', 'miguel', 'free_union', '1930-05-01', 'year', '1945-01-01', 'year', 'separation'],
    ['carmenG', 'antonio', 'marriage', '1947-06-21', 'day', null, null, null], // segundo matrimonio
    ['francisco', 'elenaV', 'marriage', '1935-01-01', 'year', null, null, null],
    ['pedro', 'marta', 'marriage', '1940-01-01', 'year', null, null, null],
    ['ana', 'luis', 'marriage', '1942-01-01', 'year', null, null, null],
    ['luciaT', 'jorge', 'marriage', '1936-01-01', 'year', null, null, null],
    ['elenaL', 'roberto', 'marriage', '1970-03-03', 'day', '2000-04-04', 'day', 'widowed'],
    ['elenaL', 'luciaF', 'partnership', '2005-07-18', 'day', null, null, null], // pareja mismo sexo
    ['gabriela', 'david', 'free_union', '1999-01-01', 'year', null, null, null],
    ['jose2', 'karla', 'marriage', '1994-01-01', 'year', null, null, null],
    ['andres', 'sara', 'marriage', '1995-01-01', 'year', null, null, null],
    ['fernando', 'natalia', 'marriage', '2004-01-01', 'year', null, null, null],
    ['carlos', 'esteban', 'partnership', '2015-01-01', 'year', null, null, null], // pareja mismo sexo G4
    ['camila', 'marco', 'free_union', '2021-01-01', 'year', null, null, null],
  ];
  for (const [a, b, kind, s, sp, e, ep, r] of U) {
    await client.query(
      `INSERT INTO unions (person_a_id, person_b_id, kind, start_date, start_date_precision,
        end_date, end_date_precision, end_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [ids[a], ids[b], kind, s, sp, e, ep, r]);
  }

  // hechos [person, type, value, certainty, source]
  const F = [
    ['jose', 'occupation', 'Agricultor de café en el Valle Central', 'confirmed', 'Acta de nacimiento de Francisco'],
    ['jose', 'origin', 'Familia originaria de Cartago, llegada al valle hacia 1880', 'unconfirmed', 'Relato de la abuela Rosa'],
    ['rosa', 'anecdote', 'Sus tamales de diciembre reunían a toda la familia', 'unconfirmed', 'Me lo contó la tía Anita'],
    ['manuel', 'occupation', 'Carpintero, construyó la casa familiar', 'confirmed', 'Fotografía del taller fechada 1930'],
    ['carmenG', 'anecdote', 'Crió a doce hijos entre dos uniones', 'confirmed', 'Registro civil'],
    ['miguel', 'residence', 'Puntarenas entre 1940 y 1975', 'confirmed', 'Cartas familiares'],
    ['elenaL', 'occupation', 'Maestra de escuela durante 30 años', 'confirmed', 'Título docente'],
    ['manuel2', 'origin', 'Fecha de nacimiento aproximada, hacia 1950', 'unconfirmed', 'Sin partida encontrada'],
  ];
  for (const [p, t, v, c, s] of F) {
    await client.query(
      'INSERT INTO facts (person_id, type, value, certainty, source) VALUES ($1,$2,$3,$4,$5)',
      [ids[p], t, v, c, s]);
  }

  // historias [key, person, title, body, date, datePrec, certainty, mentions[]]
  const S = [
    ['s1', 'jose', 'La finca de 1880',
      'El abuelo José llegó al valle hacia 1880 y levantó la finca donde crecieron cuatro hijos. El café daba para vivir y para ayudar a los vecinos.',
      '1930-01-01', 'year', 'confirmed', []],
    ['s2', 'carmenG', 'Madre de doce',
      'Mamá Carmen tuvo doce hijos: dos con Miguel y diez con Antonio. La casa siempre estaba llena y nadie se iba sin comer.',
      '1965-01-01', 'year', 'confirmed', ['raul', 'teresa']],
    ['s3', 'rosa', 'Los tamales de Rosita',
      'Dicen que los tamales de Rosita eran los mejores del pueblo. La receta se perdió con ella, aunque Anita jura acordarse.',
      null, null, 'unconfirmed', []],
    ['s4', 'elenaL', 'Una familia nueva',
      'Elena y Lucía adoptaron a Diego en 2010. La familia entera lo recibió con una fiesta en la casa de Carmen.',
      '2010-01-01', 'year', 'confirmed', ['diego', 'luciaF']],
  ];
  for (const [, p, title, body, d, dp, c, mentions] of S) {
    const { rows: [s] } = await client.query(
      `INSERT INTO stories (person_id, title, body, story_date, story_date_precision, certainty)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [ids[p], title, body, d, dp, c]);
    for (const m of mentions) {
      await client.query('INSERT INTO story_mentions (story_id, person_id) VALUES ($1,$2)', [s.id, ids[m]]);
    }
  }
  console.log('Demo OK: 5 generaciones, 12 hermanos, 2° matrimonio, adopción, 2 parejas mismo sexo.');
}

// ================= sintéticos =================
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedSynthetic(n) {
  const rnd = mulberry32(20261004);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const M = ['José', 'Manuel', 'Francisco', 'Pedro', 'Luis', 'Carlos', 'Miguel', 'Jorge', 'David', 'Andrés', 'Felipe', 'Diego', 'Santiago', 'Matías', 'Sebastián', 'Gabriel', 'Rafael', 'Emilio', 'Raúl', 'Esteban'];
  const F = ['María', 'Carmen', 'Ana', 'Rosa', 'Lucía', 'Elena', 'Sofía', 'Patricia', 'Teresa', 'Marta', 'Sara', 'Karla', 'Natalia', 'Valeria', 'Camila', 'Emma', 'Renata', 'Gabriela', 'Daniela', 'Fernanda'];
  const SUR = ['García', 'Martínez', 'Torres', 'Ruiz', 'Hernández', 'Vargas', 'Jiménez', 'Ramírez', 'Castillo', 'Mora', 'Soto', 'Vega', 'Rojas', 'Castro', 'Monge', 'Salas', 'Quirós', 'Herrera', 'León', 'Cordero', 'Blanco', 'Núñez', 'Pérez', 'Guzmán', 'López', 'Díaz', 'Fernández', 'Alvarado', 'Mena', 'Ortega'];
  const PALETTE = ['#4F86C6', '#E07A5F', '#81B29D', '#F2CC8F', '#9D8DF1', '#E9C46A'];
  const PREC = ['day', 'month', 'year', 'decade', 'approximate'];

  const branchIds = [];
  for (let i = 0; i < 6; i++) {
    const { rows: [b] } = await client.query(
      'INSERT INTO branches (name, color) VALUES ($1,$2) RETURNING id',
      [`Sintética ${i + 1}`, PALETTE[i % PALETTE.length]]);
    branchIds.push(b.id);
  }

  // Personas: años 1905-2015 (padres siempre estrictamente mayores -> DAG sin ciclos).
  // birth_place='Sintética' marca filas generadas (los tests las excluyen al fijar demo).
  const people = [];
  for (let i = 0; i < n; i++) {
    const female = rnd() < 0.5;
    const year = 1905 + Math.floor(rnd() * 111);
    const living = year > 1945 || rnd() < 0.15;
    people.push({
      g: female ? pick(F) : pick(M), p: pick(SUR), m: pick(SUR),
      sex: female ? 'F' : 'M', y: year, liv: living,
      br: rnd() < 0.85 ? pick(branchIds) : null,
    });
  }
  const ids = [];
  const BATCH = 250;
  for (let i = 0; i < people.length; i += BATCH) {
    const slice = people.slice(i, i + BATCH);
    const vals = [];
    const ph = slice.map((p, j) => {
      const o = j * 9;
      vals.push(p.g, p.p, p.m, p.sex, `${p.y}-06-15`, rnd() < 0.7 ? 'year' : pick(PREC), p.liv, p.br, 'Sintética');
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9})`;
    });
    const { rows } = await client.query(
      `INSERT INTO persons (given_names, paternal_surname, maternal_surname, gender,
        birth_date, birth_date_precision, is_living, branch_id, birth_place)
       VALUES ${ph.join(',')} RETURNING id`, vals);
    ids.push(...rows.map((r) => r.id));
  }
  people.forEach((p, i) => { p.id = ids[i]; });

  // Uniones: ~40% de la población emparejada con Δedad <= 8.
  const byId = new Map(people.map((p) => [p.id, p]));
  const shuffled = [...people].filter((p) => p.y < 2000).sort(() => rnd() - 0.5);
  let unions = 0;
  for (let i = 0; i + 1 < shuffled.length && unions < n * 0.4; i += 2) {
    const a = shuffled[i], b = shuffled[i + 1];
    if (Math.abs(a.y - b.y) > 8) continue;
    const kind = rnd() < 0.6 ? 'marriage' : rnd() < 0.8 ? 'free_union' : 'partnership';
    await client.query(
      'INSERT INTO unions (person_a_id, person_b_id, kind, start_date, start_date_precision) VALUES ($1,$2,$3,$4,$5)',
      [a.id, b.id, kind, `${Math.max(a.y, b.y) + 20}-01-01`, 'year']);
    unions++;
  }

  // Padres: cada persona con año > 1930 recibe 1-2 padres 20-45 años mayores.
  const elders = [...people].sort((a, b) => a.y - b.y);
  let links = 0;
  const linkVals = [];
  for (const p of people) {
    if (p.y <= 1930 || rnd() < 0.1) continue;
    const cands = elders.filter((e) => e.y <= p.y - 20 && e.y >= p.y - 45 && e.id !== p.id);
    if (!cands.length) continue;
    const k = rnd() < 0.6 ? Math.min(2, cands.length) : 1;
    for (let j = 0; j < k; j++) {
      const par = cands[Math.floor(rnd() * cands.length)];
      linkVals.push([par.id, p.id]);
      links++;
    }
  }
  for (let i = 0; i < linkVals.length; i += BATCH) {
    const slice = linkVals.slice(i, i + BATCH);
    const vals = [];
    const ph = slice.map(([a, b], j) => {
      vals.push(a, b);
      return `($${j * 2 + 1},$${j * 2 + 2},'biological','confirmed')`;
    });
    await client.query(
      `INSERT INTO parent_links (parent_id, child_id, kind, certainty) VALUES ${ph.join(',')}
       ON CONFLICT (parent_id, child_id) DO NOTHING`, vals);
  }
  console.log(`Sintéticos OK: ${n} personas, ${unions} uniones, ~${links} vínculos (padres siempre mayores: sin ciclos).`);
  void byId;
}
