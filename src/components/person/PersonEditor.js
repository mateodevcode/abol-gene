'use client';

import { useState } from 'react';
import EditPersonForm from '@/components/person/EditPersonForm';

/** Botón Editar + formulario en la ficha. */
export default function PersonEditor({ person, branches, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 rounded-xl border border-stone-300 px-4 py-3 text-lg font-semibold text-stone-800"
      >
        Editar datos
      </button>
    );
  }
  return (
    <div className="mt-4">
      <EditPersonForm person={person} branches={branches} onDone={() => setOpen(false)} />
    </div>
  );
}
