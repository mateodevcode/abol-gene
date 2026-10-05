'use client';

/**
 * Minimapa: puntos del árbol + rectángulo de la vista. Tocar centra ahí.
 */
export default function MiniMap({ nodes, bbox, view, onGo }) {
  const W = 150;
  const bw = Math.max(bbox.x1 - bbox.x0, 1);
  const bh = Math.max(bbox.y1 - bbox.y0, 1);
  const H = Math.max(60, Math.min(150, (W * bh) / bw));
  const sx = (x) => ((x - bbox.x0) / bw) * W;
  const sy = (y) => ((y - bbox.y0) / bh) * H;

  // Rectángulo visible en coordenadas de mundo.
  const vx0 = -view.tx / view.k;
  const vy0 = -view.ty / view.k;
  const vw = view.w / view.k;
  const vh = view.h / view.k;

  function go(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    onGo(bbox.x0 + px * bw, bbox.y0 + py * bh);
  }

  return (
    <button
      onClick={go} aria-label="Minimapa: tocar para ir"
      className="absolute bottom-24 right-3 z-30 overflow-hidden rounded-xl border border-stone-300 bg-white/95 shadow"
      style={{ width: W, height: H }}
    >
      <svg width={W} height={H}>
        {nodes.map((n) => (
          <circle key={n.id} cx={sx(n.x + 88)} cy={sy(n.y + 32)} r={1.6} fill={n.branch_color ?? '#a8a29e'} />
        ))}
        <rect
          x={sx(vx0)} y={sy(vy0)} width={Math.max((vw / bw) * W, 6)} height={Math.max((vh / bh) * H, 6)}
          fill="none" stroke="#047857" strokeWidth={2}
        />
      </svg>
    </button>
  );
}
