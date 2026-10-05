// Crea o promueve el primer admin (bootstrap sin invitación).
// Uso: npm run create-admin -- correo@ejemplo.com [Nombre] [--person <uuid>]
import pg from 'pg';

const email = (process.argv[2] || '').trim().toLowerCase();
const name = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : email.split('@')[0];
const personFlag = process.argv.indexOf('--person');
const personId = personFlag >= 0 ? process.argv[personFlag + 1] : null;

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Uso: npm run create-admin -- correo@ejemplo.com [Nombre] [--person <uuid>]');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  if (personId) {
    const p = await client.query('SELECT id FROM persons WHERE id=$1 AND deleted_at IS NULL', [personId]);
    if (!p.rows[0]) {
      console.error('Persona no encontrada.');
      process.exit(1);
    }
  }
  const { rows: [u] } = await client.query(
    `INSERT INTO users (email, name, role, person_id, email_verified)
     VALUES ($1,$2,'admin',$3,now())
     ON CONFLICT (email) DO UPDATE SET role='admin', person_id=COALESCE(users.person_id, $3)
     RETURNING id, email, role, person_id`,
    [email, name, personId]);
  console.log(`Admin listo: ${u.email} (rol ${u.role})${u.person_id ? ' vinculado a su persona' : ''}.`);
  console.log('Ingresa en /login con tu correo; el enlace aparece en la terminal (MAIL_DRIVER=console).');
} finally {
  await client.end();
}
