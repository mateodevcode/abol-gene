"use client";

/** Barra de controles de cámara del mapa. */
export default function TreeToolbar({
  onZoomIn,
  onZoomOut,
  onRecenter,
  onExpand,
  onShowAll,
  canExpand,
  loading,
  count,
}) {
  const btn =
    "rounded-full bg-white/95 px-4 py-2.5 text-lg font-semibold text-stone-800 shadow border border-stone-200 h-16 w-16";
  return (
    <div className="absolute left-3 bottom-3 z-30 flex flex-col gap-2">
      <div className="flex gap-2">
        <button className={btn} onClick={onZoomIn} aria-label="Acercar">
          +
        </button>
        <button className={btn} onClick={onZoomOut} aria-label="Alejar">
          −
        </button>
        <button className={btn} onClick={onRecenter} aria-label="Centrarme">
          ◎
        </button>
      </div>
      <div className="flex gap-2">
        <button
          className="rounded-full bg-emerald-700 px-6 py-2.5 text-lg font-semibold text-white shadow"
          onClick={onShowAll}
          aria-label="Mostrar todo el árbol"
        >
          Todo
        </button>
        <button
          className="rounded-full bg-white/95 px-6 py-2.5 text-lg font-semibold text-stone-800 shadow border border-stone-200"
          onClick={onExpand}
          disabled={!canExpand}
          aria-label="Cargar un nivel más"
        >
          {loading ? "…" : "+ Nivel"}
        </button>
      </div>
      {typeof count === "number" && (
        <p className="rounded-full bg-white/95 px-4 py-1.5 text-sm text-stone-600 shadow border border-stone-200">
          {count} personas
        </p>
      )}
    </div>
  );
}
