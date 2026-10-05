/**
 * Botón fijo Interactivo ↔ Datos. En la ficha lleva al mapa centrado en la
 * persona; en el mapa vuelve a la ficha.
 * @param {{ mode: 'tree'|'data', personId?: string|null }} props
 */
export default function ViewToggle({ mode, personId = null }) {
  const isTree = mode === 'tree';
  const treeHref = !isTree && personId ? `/arbol?persona=${personId}` : '/arbol';
  const dataHref = personId ? `/persona/${personId}` : null;
  const base = 'px-6 py-3 text-lg font-semibold';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
      <nav className="pointer-events-auto flex overflow-hidden rounded-full border border-stone-200 bg-white shadow-lg" aria-label="Cambiar vista">
        {isTree ? (
          <span aria-current="page" className={`${base} bg-emerald-700 text-white`}>Interactivo</span>
        ) : (
          <a href={treeHref} className={`${base} text-stone-700`}>Interactivo</a>
        )}
        {!isTree ? (
          <span aria-current="page" className={`${base} bg-emerald-700 text-white`}>Datos</span>
        ) : dataHref ? (
          <a href={dataHref} className={`${base} text-stone-700`}>Datos</a>
        ) : (
          <span className={`${base} text-stone-400`}>Datos</span>
        )}
      </nav>
    </div>
  );
}
