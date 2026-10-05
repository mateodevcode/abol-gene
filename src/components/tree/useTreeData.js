'use client';

import { useQuery } from '@tanstack/react-query';

/** Rama del árbol alrededor del foco (cacheada por foco y profundidad). */
export async function fetchTreeAround(focusId, { up, down }) {
  const res = await fetch(`/api/persons/${focusId}/tree?up=${up}&down=${down}`);
  if (!res.ok) throw new Error('No se pudo cargar el árbol.');
  return res.json();
}

export function useTreeData(focusId, depth, full = false) {
  return useQuery({
    queryKey: ['tree', focusId, full ? 'full' : depth.up, full ? 'full' : depth.down],
    queryFn: () => fetchTreeAround(focusId, full ? { up: 30, down: 30 } : depth),
    enabled: !!focusId,
  });
}

/** Etiqueta de parentesco con mi persona (para el popup). */
export function useKinshipLabel(fromId, toId) {
  return useQuery({
    queryKey: ['kinship', fromId, toId],
    queryFn: async () => {
      const res = await fetch(`/api/persons/${fromId}/kinship?to=${toId}`);
      if (!res.ok) throw new Error('x');
      return res.json();
    },
    enabled: !!fromId && !!toId && fromId !== toId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
