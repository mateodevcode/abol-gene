/** URL de foto servida por el backend (válido en cliente y servidor). */
export function photoUrl(photoId, size = 'thumb') {
  return `/api/photos/${photoId}/${size}`;
}
