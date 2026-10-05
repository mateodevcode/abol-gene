"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  layoutTree,
  computeGaps,
  NODE_W,
  NODE_H,
  GEN_GAP,
} from "@/lib/tree-layout/index";
import { useTreeStore } from "@/store/tree";
import { useTreeData } from "@/components/tree/useTreeData";
import TreeCanvas from "@/components/tree/TreeCanvas";
import TreeToolbar from "@/components/tree/TreeToolbar";
import MiniMap from "@/components/tree/MiniMap";
import PersonPopup from "@/components/tree/PersonPopup";
import ViewToggle from "@/components/ui/ViewToggle";
import SignOutButton from "@/components/auth/SignOutButton";

/** Orquestador del mapa: datos (caché) → layout (puro) → canvas (cámara). */
export default function TreeApp({ user, initialFocusId }) {
  const {
    focusId,
    depth,
    selectedId,
    familyFocusId,
    routeIds,
    genFilter,
    setFocus,
    expand,
    select,
    focusFamily,
    clearFamily,
    setRoute,
    clearRoute,
    setGenFilter,
    fullTree,
    setFullTree,
  } = useTreeStore();
  const canvasRef = useRef(null);
  const [mapView, setMapView] = useState({
    k: 1,
    tx: 0,
    ty: 0,
    w: 800,
    h: 600,
  });
  const [gapHintFor, setGapHint] = useState(null);
  const [routeLabel, setRouteLabel] = useState("");
  const fitPending = useRef(false);
  const centeredFor = useRef(null);
  const fittedLayout = useRef(null);

  useEffect(() => {
    setFocus(initialFocusId ?? user.person_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusId]);

  const { data, isLoading, isError, refetch } = useTreeData(
    focusId,
    depth,
    fullTree,
  );

  const layout = useMemo(() => {
    if (!data) return null;
    return layoutTree({
      persons: data.persons ?? [],
      parent_links: data.parent_links ?? [],
      unions: data.unions ?? [],
    });
  }, [data]);

  const nodes = useMemo(() => {
    if (!data || !layout) return [];
    const byId = new Map((data.persons ?? []).map((p) => [p.id, p]));
    const pos = new Map(layout.nodes.map((n) => [n.id, n]));
    return [...byId.values()].map((p) => ({
      ...p,
      ...(pos.get(p.id) ?? { x: 0, y: 0, gen: 0 }),
    }));
  }, [data, layout]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const bbox = useMemo(() => {
    if (!nodes.length) return { x0: 0, y0: 0, x1: 800, y1: 600 };
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const n of nodes) {
      x0 = Math.min(x0, n.x);
      y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + NODE_W);
      y1 = Math.max(y1, n.y + NODE_H);
    }
    return { x0: x0 - 200, y0: y0 - 200, x1: x1 + 200, y1: y1 + 200 };
  }, [nodes]);

  // Mezcla de ramas: colores distintos de los padres → degradado.
  const mixMap = useMemo(() => {
    const map = new Map();
    const colors = new Map(nodes.map((n) => [n.id, n.branch_color ?? null]));
    for (const l of data?.parent_links ?? []) {
      if (!map.has(l.child_id)) map.set(l.child_id, new Set());
      const c = colors.get(l.parent_id);
      if (c) map.get(l.child_id).add(c);
    }
    const out = new Map();
    for (const [id, set] of map) {
      if (set.size > 1) out.set(id, [...set]);
    }
    return out;
  }, [nodes, data]);

  // Cumpleaños del mes (vivos, con día o mes conocido).
  const birthdayIds = useMemo(() => {
    const month = new Date().getMonth() + 1;
    const set = new Set();
    for (const n of nodes) {
      if (!n.is_living || !n.birth_date) continue;
      if (!["day", "month"].includes(n.birth_date_precision)) continue;
      const m = Number(String(n.birth_date).slice(5, 7));
      if (m === month) set.add(n.id);
    }
    return set;
  }, [nodes]);

  // Huecos: 1 padre conocido → fantasma clicable encima.
  const ghosts = useMemo(() => {
    if (!layout || !data) return [];
    const list = computeGaps(layout.nodes, data.parent_links ?? []);
    return list
      .map((g, i) => {
        const n = nodeById.get(g.forPersonId);
        if (!n) return null;
        return {
          id: `ghost:${g.forPersonId}`,
          forPersonId: g.forPersonId,
          x: n.x + NODE_W / 2,
          y: n.y - GEN_GAP / 2 - 20 + (i % 2) * 8,
        };
      })
      .filter(Boolean);
  }, [layout, data, nodeById]);

  const generations = useMemo(() => {
    const s = new Set(nodes.map((n) => n.gen));
    return [...s].sort((a, b) => a - b);
  }, [nodes]);

  // Centrar al cargar o cambiar de foco; encuadrar al pedir Todo.
  // Ojo: encuadrar solo con datos nuevos (si no, el efecto se come el flag
  // con el layout viejo y al llegar todos ya no re-encuadra).
  useEffect(() => {
    if (!layout || !focusId) return;
    if (fullTree) {
      if ((fitPending.current || fittedLayout.current !== layout) && canvasRef.current) {
        fitPending.current = false;
        fittedLayout.current = layout;
        canvasRef.current.fitView(true);
      }
      return;
    }
    fittedLayout.current = null;
    const n = nodeById.get(focusId);
    if (n && canvasRef.current && centeredFor.current !== focusId) {
      centeredFor.current = focusId;
      canvasRef.current.centerOn(n.x + NODE_W / 2, n.y + NODE_H / 2, 1, false);
    }
  }, [layout, focusId, fullTree, nodeById]);

  // Enfocar familia: atenuar resto + zoom animado a su caja.
  useEffect(() => {
    if (!familyFocusId || !layout) return;
    const f = layout.families.find((x) => x.id === familyFocusId);
    if (!f || !canvasRef.current) return;
    const members = [...f.partners, ...f.children]
      .map((id) => nodeById.get(id))
      .filter(Boolean);
    if (!members.length) return;
    canvasRef.current.focusBBox(
      {
        x0: Math.min(...members.map((m) => m.x)) - 60,
        y0: Math.min(...members.map((m) => m.y)) - 60,
        x1: Math.max(...members.map((m) => m.x + NODE_W)) + 60,
        y1: Math.max(...members.map((m) => m.y + NODE_H)) + 60,
      },
      true,
    );
  }, [familyFocusId, layout, nodeById]);

  const selected = selectedId ? (nodeById.get(selectedId) ?? null) : null;
  const selectedFamily = selected
    ? (layout?.families.find((f) => f.partners.includes(selected.id)) ??
      layout?.families.find((f) => f.children.includes(selected.id)) ??
      null)
    : null;

  const canExpand = !fullTree && (depth.up < 6 || depth.down < 6);

  function showAll() {
    clearFamily();
    clearRoute();
    setRouteLabel("");
    setGenFilter(null);
    setFullTree(true);
    // El efecto encuadra cuando el layout cambie (datos nuevos o caché).
    fitPending.current = true;
    canvasRef.current?.fitView(true);
  }

  function centerPerson(id) {
    setFocus(id);
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-start justify-between p-3">
        <p className="rounded-full bg-white/95 px-5 py-1.5 text-lg font-bold text-stone-900 shadow border border-stone-200">
          Árbol familiar
        </p>
        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          <Link
            href="/persona/nueva"
            className="rounded-full bg-emerald-700 px-5 py-1.5 text-lg font-semibold text-white shadow flex items-center justify-center"
            title="Agregar persona"
          >
            + Persona
          </Link>
          <a
            href="/estadisticas"
            className="rounded-full bg-white/95 px-5 py-1.5 text-lg font-semibold text-stone-800 shadow border border-stone-200 flex items-center justify-center"
          >
            Datos
          </a>
          <a
            href="/historial"
            className="rounded-full bg-white/95 px-5 py-1.5 text-lg font-semibold text-stone-800 shadow border border-stone-200 flex items-center justify-center"
          >
            Historial
          </a>
          {user.role === "admin" && (
            <>
              <a
                href="/invitar"
                className="rounded-full bg-white/95 px-5 py-1.5 text-lg font-semibold text-stone-800 shadow border border-stone-200 flex items-center justify-center"
              >
                Invitar
              </a>
              <a
                href="/duplicados"
                className="rounded-full bg-white/95 px-5 py-1.5 text-lg font-semibold text-stone-800 shadow border border-stone-200 flex items-center justify-center"
              >
                Duplicados
              </a>
            </>
          )}
          {generations.length > 1 && (
            <div className="">
              <select
                value={genFilter ?? ""}
                onChange={(e) =>
                  setGenFilter(
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                aria-label="Ver una generación"
                className="rounded-full bg-white/95 px-5 py-2.5 text-lg font-semibold text-stone-800 shadow border border-stone-200"
              >
                <option value="">Todas las generaciones</option>
                {generations.map((g) => (
                  <option key={g} value={g}>
                    Generación {g + 1}
                  </option>
                ))}
              </select>
            </div>
          )}
          <SignOutButton label="Salir" />
        </div>
      </header>

      <div className="relative flex-1">
        {isLoading && nodes.length === 0 && (
          <p className="absolute inset-0 z-20 grid place-items-center bg-stone-100 text-xl text-stone-600">
            Cargando el árbol…
          </p>
        )}
        {isLoading && nodes.length > 0 && (
          <p className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-base text-stone-600 shadow">
            Cargando más…
          </p>
        )}
        {isError && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-stone-100">
            <div className="text-center">
              <p className="text-xl text-stone-700">No se pudo cargar.</p>
              <button
                onClick={() => refetch()}
                className="mt-3 rounded-xl bg-emerald-700 px-4 py-3 text-lg font-semibold text-white"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}
        {layout && (
          <TreeCanvas
            ref={canvasRef}
            nodes={nodes}
            links={data.parent_links ?? []}
            unions={data.unions ?? []}
            mixMap={mixMap}
            families={layout.families}
            selectedId={selectedId}
            familyFocusId={familyFocusId}
            routeIds={routeIds}
            genFilter={genFilter}
            ghosts={ghosts}
            birthdayIds={birthdayIds}
            onOpenPerson={(id) => {
              clearFamily();
              clearRoute();
              setGapHint(null);
              select(id);
            }}
            onFocusFamily={(f) => {
              select(null);
              focusFamily(f.id);
            }}
            onGhostClick={(pid) => {
              clearFamily();
              clearRoute();
              setGapHint(pid);
              select(pid);
            }}
            onViewChange={setMapView}
          />
        )}
        <TreeToolbar
          onZoomIn={() => canvasRef.current?.zoomBy(1.3)}
          onZoomOut={() => canvasRef.current?.zoomBy(1 / 1.3)}
          onRecenter={() => {
            clearFamily();
            clearRoute();
            setRouteLabel("");
            const n = nodeById.get(user.person_id);
            if (n)
              canvasRef.current?.centerOn(
                n.x + NODE_W / 2,
                n.y + NODE_H / 2,
                1,
                true,
              );
          }}
          onExpand={expand}
          onShowAll={showAll}
          canExpand={canExpand}
          loading={isLoading}
          count={nodes.length}
        />

        {layout && !isLoading && (
          <MiniMap
            nodes={nodes}
            bbox={bbox}
            view={mapView}
            onGo={(x, y) => canvasRef.current?.centerOn(x, y, mapView.k, true)}
          />
        )}
        {(familyFocusId || routeIds) && (
          <button
            onClick={showAll}
            className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-stone-900/90 px-5 py-2.5 text-lg font-semibold text-white shadow"
          >
            {routeIds ? `${routeLabel} · ver todo` : "Ver todo el árbol"}
          </button>
        )}
      </div>

      <PersonPopup
        person={selected}
        myPersonId={user.person_id}
        family={selectedFamily}
        gapHint={gapHintFor != null && gapHintFor === selected?.id}
        onClose={() => {
          select(null);
          setGapHint(null);
        }}
        onFocusFamily={() => selectedFamily && focusFamily(selectedFamily.id)}
        onCenterPerson={() => selected && centerPerson(selected.id)}
        onShowRoute={(kin) => {
          select(null);
          setRouteLabel(kin.label ?? "");
          setRoute(kin.route ?? []);
        }}
      />
      <ViewToggle mode="tree" personId={focusId} />
    </div>
  );
}
