import { create } from 'zustand';

/**
 * Estado de interfaz del mapa (los datos viven en TanStack Query).
 * La cámara (transform d3) vive en refs del canvas, no aquí.
 */
export const useTreeStore = create((set) => ({
  focusId: null,
  /** Profundidad de carga parcial (se expande con el botón +Nivel). */
  depth: { up: 2, down: 3 },
  /** Persona seleccionada (popup). */
  selectedId: null,
  /** Familia enfocada (atenúa el resto). */
  familyFocusId: null,
  /** Ruta iluminada A→NCA→B ("Camino hasta mí"). */
  routeIds: null,
  /** Filtro por generación (null = todas). */
  genFilter: null,
  /** true = ventana ignorada, se carga el árbol completo. */
  fullTree: false,

  setFocus: (focusId) => set({ focusId, selectedId: null, familyFocusId: null, routeIds: null, genFilter: null, fullTree: false }),
  setDepth: (depth) => set({ depth }),
  expand: () => set((s) => ({ depth: { up: Math.min(s.depth.up + 1, 6), down: Math.min(s.depth.down + 1, 6) } })),
  select: (selectedId) => set({ selectedId }),
  focusFamily: (familyFocusId) => set({ familyFocusId, routeIds: null }),
  clearFamily: () => set({ familyFocusId: null }),
  setRoute: (routeIds) => set({ routeIds, familyFocusId: null }),
  clearRoute: () => set({ routeIds: null }),
  setGenFilter: (genFilter) => set({ genFilter }),
  setFullTree: (fullTree) => set((s) => ({ fullTree, ...(fullTree ? { familyFocusId: null, routeIds: null, genFilter: null } : {}) })),
}));
