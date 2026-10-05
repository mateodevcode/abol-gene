import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Driver `s3` (producción): bucket privado, subida directa del navegador
 * con URLs prefirmadas (evita el límite de las funciones de Vercel) y
 * lectura con URLs firmadas de corta duración.
 * Solo servidor: usa las credenciales AWS del entorno.
 */

let client = null;
function s3() {
  if (client) return client;
  const region = process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Faltan credenciales AWS en el entorno.');
  }
  client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  return client;
}

export function s3Bucket() {
  const bucket = process.env.AWS_BUCKET;
  if (!bucket) throw new Error('Falta AWS_BUCKET en el entorno.');
  return bucket;
}

export function s3Prefix() {
  return `${process.env.AWS_BUCKET_SUBFOLDER ?? 'arbol-gene'}/`;
}

/** Clave ordenada por foto: arbol-gene/<photoId>/<size>.jpg */
export function s3Key(photoId, size, ext = 'jpg') {
  if (!['original', 'medium', 'thumb'].includes(size)) throw new Error('Tamaño no válido.');
  const cleanExt = String(ext).replace(/[^a-z]/g, '') || 'jpg';
  return `${s3Prefix()}${photoId}/${size}.${cleanExt}`;
}

const JPEG = 'image/jpeg';

/**
 * URLs prefirmadas de subida (PUT directo del navegador, 15 min).
 * @returns {Promise<{ photoId: string, keys: object, urls: object }>}
 */
export async function getUploadUrls(photoId, ext = 'jpg') {
  const keys = {
    original: s3Key(photoId, 'original', ext),
    medium: s3Key(photoId, 'medium', ext),
    thumb: s3Key(photoId, 'thumb', ext),
  };
  const urls = {};
  for (const size of Object.keys(keys)) {
    urls[size] = await getSignedUrl(
      s3(),
      new PutObjectCommand({ Bucket: s3Bucket(), Key: keys[size], ContentType: JPEG }),
      { expiresIn: 15 * 60 },
    );
  }
  return { photoId, keys, urls };
}

/** Verifica que los 3 objetos ya estén en el bucket (tras el PUT directo). */
export async function assertObjectsExist(keys) {
  for (const size of ['original', 'medium', 'thumb']) {
    await s3().send(new HeadObjectCommand({ Bucket: s3Bucket(), Key: keys[size] }));
  }
}

/** URL firmada de lectura (10 min). */
export async function getReadUrl(key) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: s3Bucket(), Key: key }),
    { expiresIn: 10 * 60 },
  );
}
