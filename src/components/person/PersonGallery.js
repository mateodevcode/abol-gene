'use client';

import { useState } from 'react';
import { fileToSizedBlobs } from '@/lib/images';
import { photoUrl } from '@/lib/photo-url';

/**
 * Galería de la persona: ver, subir (3 tamaños en navegador), etiquetar,
 * marcar portada y borrar. `coverPhotoId` es la portada actual.
 */
export default function PersonGallery({ personId, initialPhotos, initialTags, coverPhotoId }) {
  const [photos, setPhotos] = useState(initialPhotos ?? []);
  const [tags, setTags] = useState(initialTags ?? []);
  const [cover, setCover] = useState(coverPhotoId ?? null);
  const [viewer, setViewer] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [caption, setCaption] = useState('');
  const [photoDate, setPhotoDate] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [tagResults, setTagResults] = useState([]);
  const [taggedIds, setTaggedIds] = useState([personId]);
  const [makeCover, setMakeCover] = useState(true);
  const [preview, setPreview] = useState(null); // { url, name }

  function pickFile(e) {
    const file = e.target.files?.[0];
    if (preview?.url) URL.revokeObjectURL(preview.url);
    if (file && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      setPreview({ url: URL.createObjectURL(file), name: file.name });
    } else {
      setPreview(null);
    }
  }

  async function searchTag(e) {
    e.preventDefault();
    const res = await fetch(`/api/persons/search?q=${encodeURIComponent(tagQuery)}`);
    if (res.ok) setTagResults((await res.json()).persons ?? []);
  }

  async function upload(e) {
    e.preventDefault();
    setError('');
    const file = e.target.elements.photo.files?.[0];
    if (!file) {
      setError('Elige una foto.');
      return;
    }
    setUploading(true);
    try {
      const sized = await fileToSizedBlobs(file);
      const meta = {
        caption, photo_date: photoDate || null,
        width: sized.width, height: sized.height, size_bytes: sized.size_bytes,
        person_ids: taggedIds, make_cover_for: makeCover ? personId : null,
      };
      let photo;
      if ((process.env.NEXT_PUBLIC_STORAGE_DRIVER ?? 'local') === 's3') {
        // Producción: PUT directo al bucket y confirmación.
        const ru = await fetch('/api/photos/upload-urls', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ext: 'jpg' }),
        });
        const signed = await ru.json();
        if (!ru.ok) throw new Error(signed.error ?? 'No se pudo preparar la subida.');
        for (const size of ['original', 'medium', 'thumb']) {
          const put = await fetch(signed.urls[size], {
            method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: sized[size],
          });
          if (!put.ok) throw new Error('No se pudo subir a S3. Reintenta.');
        }
        const rc = await fetch('/api/photos/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoId: signed.photoId, ext: 'jpg', ...meta }),
        });
        const dc = await rc.json();
        if (!rc.ok) throw new Error(dc.error ?? 'No se pudo confirmar.');
        photo = dc.photo;
      } else {
        const form = new FormData();
        form.append('original', sized.original, 'original.jpg');
        form.append('medium', sized.medium, 'medium.jpg');
        form.append('thumb', sized.thumb, 'thumb.jpg');
        form.append('caption', caption);
        form.append('photo_date', photoDate);
        form.append('width', String(sized.width));
        form.append('height', String(sized.height));
        form.append('size_bytes', String(sized.size_bytes));
        form.append('person_ids', JSON.stringify(taggedIds));
        if (makeCover) form.append('make_cover_for', personId);
        const res = await fetch('/api/photos/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'No se pudo subir.');
        photo = data.photo;
      }
      setPhotos((ps) => [photo, ...ps]);
      if (makeCover) setCover(photo.id);
      setCaption('');
      setPhotoDate('');
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview(null);
      e.target.reset();
      setTaggedIds([personId]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function setAsCover(id) {
    const res = await fetch(`/api/persons/${personId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cover_photo_id: id }),
    });
    if (res.ok) {
      setCover(id);
      setViewer((v) => (v ? { ...v } : v));
    }
  }

  async function remove(id) {
    if (!confirm('¿Borrar esta foto? Se oculta pero queda en el historial.')) return;
    const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setPhotos((ps) => ps.filter((p) => p.id !== id));
      if (cover === id) setCover(null);
      if (viewer?.id === id) setViewer(null);
    }
  }

  const tagsOf = (pid) => tags.filter((t) => t.photo_id === pid);

  return (
    <div>
      <form onSubmit={searchTag} className="mb-2 flex gap-2">
        <input
          value={tagQuery} onChange={(e) => setTagQuery(e.target.value)}
          placeholder="Etiquetar a… (busca y toca +)" aria-label="Etiquetar a"
          className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5 text-lg"
        />
        <button className="rounded-xl border border-stone-300 px-4 py-2.5 text-lg">Buscar</button>
      </form>
      <form onSubmit={upload} className="flex flex-col gap-3 rounded-2xl border border-stone-200 p-4">
        <h3 className="text-xl font-semibold">Subir foto</h3>
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} className="text-lg" />
        {preview && (
          <figure className="overflow-hidden rounded-xl border border-stone-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt="Vista previa" className="max-h-72 w-full object-cover" />
            <figcaption className="px-3 py-2 text-base text-stone-600">
              Así se verá{makeCover ? ' (y quedará como portada)' : ''}.
            </figcaption>
          </figure>
        )}
        <input
          value={caption} onChange={(e) => setCaption(e.target.value)}
          placeholder="Descripción (opcional)" className="rounded-xl border border-stone-300 px-4 py-2.5 text-lg"
        />
        <label className="flex items-center gap-2 text-lg">
          Fecha
          <input type="date" value={photoDate} onChange={(e) => setPhotoDate(e.target.value)} className="rounded-xl border border-stone-300 px-3 py-2 text-lg" />
        </label>
        <div className="text-lg">
          <p className="font-medium">En la foto aparecen:</p>
          <p className="mt-1 flex flex-wrap gap-2">
            {taggedIds.map((id) => {
              const known = tagResults.find((p) => p.id === id);
              const name = id === personId ? 'esta persona' : known ? `${known.given_names} ${known.paternal_surname ?? ''}` : 'alguien';
              return (
                <span key={id} className="rounded-full bg-stone-100 px-3 py-1">
                  {name}
                  {id !== personId && (
                    <button type="button" aria-label="Quitar" className="ml-2 text-stone-500"
                      onClick={() => setTaggedIds((ids) => ids.filter((x) => x !== id))}>×</button>
                  )}
                </span>
              );
            })}
          </p>
          {tagResults.map((p) => (
            <button
              key={p.id} type="button"
              onClick={() => setTaggedIds((ids) => (ids.includes(p.id) ? ids : [...ids, p.id]))}
              className="mr-2 mt-2 rounded-full border border-stone-300 px-3 py-1"
            >
              + {p.given_names} {p.paternal_surname}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-lg">
          <input type="checkbox" checked={makeCover} onChange={(e) => setMakeCover(e.target.checked)} className="h-5 w-5" />
          Usar como portada
        </label>
        <button disabled={uploading} className="rounded-xl bg-emerald-700 px-4 py-3 text-lg font-semibold text-white disabled:opacity-50">
          {uploading ? 'Subiendo…' : 'Subir'}
        </button>
        {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-lg text-red-900">{error}</p>}
      </form>

      {photos.length === 0 ? (
        <p className="mt-4 text-lg text-stone-500">Sin fotos todavía.</p>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <button key={p.id} onClick={() => setViewer(p)} className="relative overflow-hidden rounded-xl border border-stone-200">
              {/* <img> a propósito: con sesión, next/image recibiría 401 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.id, 'thumb')} alt={p.caption ?? ''} loading="lazy" className="aspect-square w-full object-cover" />
              {cover === p.id && (
                <span className="absolute left-1 top-1 rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">Portada</span>
              )}
            </button>
          ))}
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setViewer(null)}>
          <div className="max-h-full w-full max-w-lg overflow-auto rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(viewer.id, 'medium')} alt={viewer.caption ?? ''} className="w-full rounded-xl" />
            {viewer.caption && <p className="mt-2 text-lg">{viewer.caption}</p>}
            {tagsOf(viewer.id).length > 0 && (
              <p className="mt-1 text-base text-stone-600">
                En la foto: {tagsOf(viewer.id).map((t) => `${t.given_names} ${t.paternal_surname ?? ''}`).join(', ')}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={photoUrl(viewer.id, 'original')} target="_blank" rel="noreferrer" className="rounded-xl border border-stone-300 px-4 py-2 text-lg">Original</a>
              {cover !== viewer.id && (
                <button onClick={() => setAsCover(viewer.id)} className="rounded-xl border border-stone-300 px-4 py-2 text-lg">Portada</button>
              )}
              <button onClick={() => remove(viewer.id)} className="rounded-xl border border-red-200 px-4 py-2 text-lg text-red-800">Borrar</button>
              <button onClick={() => setViewer(null)} className="rounded-xl bg-stone-800 px-4 py-2 text-lg text-white">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
