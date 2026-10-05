'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import { NODE_W, NODE_H, GEN_GAP } from '@/lib/tree-layout/index';
import PersonNode from '@/components/tree/PersonNode';

const MIN_K = 0.15;
const MAX_K = 2.5;
const CULL_MARGIN = 500;

/**
 * Canvas del mapa: cámara d3-zoom, culling por viewport y LOD por escala.
 * Métodos imperativos: zoomBy(f), centerOn(x, y, k), focusBBox(b), resetView().
 */
const TreeCanvas = forwardRef(function TreeCanvas({
  nodes, links, unions, mixMap, families, selectedId, familyFocusId,
  routeIds, genFilter, ghosts, birthdayIds,
  onOpenPerson, onFocusFamily, onGhostClick, onViewChange,
}, ref) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const zoomRef = useRef(null);
  const sizeRef = useRef({ w: 800, h: 600 });
  const rafRef = useRef(0);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0, w: 800, h: 600 });

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const highlight = useMemo(() => {
    if (familyFocusId) {
      const f = families.find((x) => x.id === familyFocusId);
      if (f) return new Set([...f.partners, ...f.children]);
      return null;
    }
    if (routeIds?.length) return new Set(routeIds);
    return null;
  }, [families, familyFocusId, routeIds]);

  // Contenido total (para dimensionar el SVG de aristas).
  const bbox = useMemo(() => {
    if (!nodes.length) return { x0: 0, y0: 0, x1: 800, y1: 600 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + NODE_W); y1 = Math.max(y1, n.y + NODE_H);
    }
    return { x0: x0 - 200, y0: y0 - 200, x1: x1 + 200, y1: y1 + 200 };
  }, [nodes]);
  const bboxRef = useRef(bbox);
  bboxRef.current = bbox;

  // Cámara.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const apply = (t) => {
      if (contentRef.current) {
        contentRef.current.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.k})`;
      }
    };
    const zb = zoom()
      .scaleExtent([MIN_K, MAX_K])
      .on('zoom', (e) => {
        apply(e.transform);
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            const { w, h } = sizeRef.current;
            const v = { k: e.transform.k, tx: e.transform.x, ty: e.transform.y, w, h };
            setView(v);
            onViewChangeRef.current?.(v);
          });
        }
      });
    zoomRef.current = zb;
    const sel = select(container).call(zb);
    sel.on('dblclick.zoom', null); // el doble clic abre el popup, no zoom
    const ro = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height };
      setView((v) => ({ ...v, w: r.width, h: r.height }));
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      select(container).on('.zoom', null);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    zoomBy(f) {
      const c = containerRef.current;
      if (c && zoomRef.current) select(c).transition().duration(250).call(zoomRef.current.scaleBy, f);
    },
    centerOn(x, y, k = 1, animate = true) {
      const c = containerRef.current;
      if (!c || !zoomRef.current) return;
      const { w, h } = sizeRef.current;
      const t = zoomIdentity.translate(w / 2 - x * k, h / 2 - y * k).scale(k);
      const sel = select(c);
      if (animate) sel.transition().duration(750).call(zoomRef.current.transform, t);
      else sel.call(zoomRef.current.transform, t);
    },
    focusBBox(b, animate = true) {
      const c = containerRef.current;
      if (!c || !zoomRef.current) return;
      const { w, h } = sizeRef.current;
      const bw = Math.max(b.x1 - b.x0, 1);
      const bh = Math.max(b.y1 - b.y0, 1);
      const k = Math.max(MIN_K, Math.min(1.6, Math.min((w * 0.7) / bw, (h * 0.6) / bh)));
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      const t = zoomIdentity.translate(w / 2 - cx * k, h / 2 - cy * k).scale(k);
      const sel = select(c);
      if (animate) sel.transition().duration(750).call(zoomRef.current.transform, t);
      else sel.call(zoomRef.current.transform, t);
    },
    /** Muestra todo el árbol cargado (quita atenuados y encuadra). */
    fitView(animate = true) {
      const c = containerRef.current;
      if (!c || !zoomRef.current) return;
      const b = bboxRef.current;
      const { w, h } = sizeRef.current;
      const bw = Math.max(b.x1 - b.x0, 1);
      const bh = Math.max(b.y1 - b.y0, 1);
      const k = Math.max(MIN_K, Math.min(1.2, Math.min((w * 0.9) / bw, (h * 0.9) / bh)));
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      const t = zoomIdentity.translate(w / 2 - cx * k, h / 2 - cy * k).scale(k);
      const sel = select(c);
      if (animate) sel.transition().duration(750).call(zoomRef.current.transform, t);
      else sel.call(zoomRef.current.transform, t);
    },
  }), []);

  // Culling + LOD (+ filtro por generación).
  const lod = view.k < 0.4 ? 'far' : view.k < 0.85 ? 'mid' : 'near';
  const inGen = (n) => genFilter == null || n.gen === genFilter;
  const visible = useMemo(() => {
    const { k, tx, ty, w, h } = view;
    const x0 = -tx / k - CULL_MARGIN;
    const y0 = -ty / k - CULL_MARGIN;
    const x1 = (w - tx) / k + CULL_MARGIN;
    const y1 = (h - ty) / k + CULL_MARGIN;
    return nodes.filter((n) => inGen(n) && n.x + NODE_W >= x0 && n.x <= x1 && n.y + NODE_H >= y0 && n.y <= y1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, view, genFilter]);

  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);
  const edges = useMemo(() => genFilter == null
    ? links.filter((l) => visibleIds.has(l.parent_id) || visibleIds.has(l.child_id))
    : [], [links, visibleIds, genFilter]);
  const unionEdges = useMemo(() => genFilter == null
    ? unions.filter((u) => visibleIds.has(u.person_a_id) || visibleIds.has(u.person_b_id))
    : [], [unions, visibleIds, genFilter]);
  const visibleGhosts = useMemo(() => (ghosts ?? []).filter((g) => {
    const n = nodeById.get(g.forPersonId);
    if (!n || !inGen(n)) return false;
    const { k, tx, ty, w, h } = view;
    const x0 = -tx / k - CULL_MARGIN;
    const y0 = -ty / k - CULL_MARGIN;
    const x1 = (w - tx) / k + CULL_MARGIN;
    const y1 = (h - ty) / k + CULL_MARGIN;
    return g.x >= x0 && g.x <= x1 && g.y >= y0 && g.y <= y1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ghosts, nodeById, view, genFilter]);

  const edgePath = (x1, y1, x2, y2) => {
    if (Math.abs(x1 - x2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const my = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
  };

  // Bandas de generación: línea + etiqueta (se ocultan al filtrar una).
  const genBands = useMemo(() => {
    if (genFilter != null) return [];
    const seen = new Map();
    for (const n of nodes) if (!seen.has(n.gen)) seen.set(n.gen, n.y);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]);
  }, [nodes, genFilter]);

  return (
    <div ref={containerRef} className="relative h-full w-full cursor-grab overflow-hidden bg-stone-100 select-none active:cursor-grabbing" style={{ touchAction: 'none' }}>
      <div ref={contentRef} className="absolute left-0 top-0" style={{ transformOrigin: '0 0', width: bbox.x1 - bbox.x0, height: bbox.y1 - bbox.y0 }}>
        {genBands.map(([g, y]) => (
          <div key={g} className="pointer-events-none absolute left-0" style={{ top: y - GEN_GAP / 2, width: bbox.x1 - bbox.x0 }}>
            <div className="border-t-2 border-dashed border-stone-300" />
            <span className="absolute rounded-full bg-white/90 px-3 py-0.5 text-sm font-semibold text-stone-500 shadow-sm" style={{ left: bbox.x0 + 8, top: 4 }}>
              Generación {g + 1}
            </span>
          </div>
        ))}
        <svg
          className="absolute"
          style={{ left: bbox.x0, top: bbox.y0 }}
          width={bbox.x1 - bbox.x0}
          height={bbox.y1 - bbox.y0}
          overflow="visible"
        >
          <g transform={`translate(${-bbox.x0},${-bbox.y0})`}>
            {edges.map((l) => {
              const p = nodeById.get(l.parent_id);
              const c = nodeById.get(l.child_id);
              if (!p || !c) return null;
              const dim = highlight && !(highlight.has(l.parent_id) && highlight.has(l.child_id));
              const inRoute = routeIds?.length && routeIds.includes(l.parent_id) && routeIds.includes(l.child_id);
              return (
                <path
                  key={`${l.parent_id}>${l.child_id}`}
                  d={edgePath(p.x + NODE_W / 2, p.y + NODE_H, c.x + NODE_W / 2, c.y)}
                  fill="none" strokeWidth={inRoute ? 5 : 2.5}
                  stroke={inRoute ? '#047857' : l.kind === 'biological' ? '#a8a29e' : '#34d399'}
                  opacity={dim ? 0.35 : 0.9}
                />
              );
            })}
            {unionEdges.map((u) => {
              const a = nodeById.get(u.person_a_id);
              const b = nodeById.get(u.person_b_id);
              if (!a || !b || a.gen !== b.gen) return null;
              const dim = highlight && !(highlight.has(u.person_a_id) && highlight.has(u.person_b_id));
              const y = a.y + NODE_H / 2;
              const key = [u.person_a_id, u.person_b_id].sort().join('<');
              return (
                <g key={key} opacity={dim ? 0.35 : 0.9}>
                  <line x1={a.x + NODE_W / 2} y1={y} x2={b.x + NODE_W / 2} y2={y} stroke="#78716c" strokeWidth={3} />
                  <line
                    x1={a.x + NODE_W / 2} y1={y} x2={b.x + NODE_W / 2} y2={y}
                    stroke="transparent" strokeWidth={24} style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const f = families.find((x) => x.id === `u:${key}`);
                      if (f) onFocusFamily(f);
                    }}
                  />
                </g>
              );
            })}
          </g>
        </svg>
        {visible.map((n) => (
          <PersonNode
            key={n.id}
            person={n}
            mix={mixMap.get(n.id) ?? null}
            lod={lod}
            dimmed={!!(highlight && !highlight.has(n.id))}
            selected={selectedId === n.id || routeIds?.includes(n.id)}
            birthday={birthdayIds?.has(n.id)}
            onOpen={() => onOpenPerson(n.id)}
          />
        ))}
        {visibleGhosts.map((g) => (
          <button
            key={g.id}
            onClick={() => onGhostClick?.(g.forPersonId)}
            title="Ancestro por registrar"
            className="absolute grid place-items-center rounded-full border-2 border-dashed border-stone-400 bg-white/70 text-xl font-bold text-stone-500"
            style={{ left: g.x - 20, top: g.y - 20, width: 40, height: 40, opacity: highlight && !highlight.has(g.forPersonId) ? 0.35 : 0.9 }}
          >
            ?
          </button>
        ))}
      </div>
    </div>
  );
});

export default TreeCanvas;
