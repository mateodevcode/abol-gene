"use client";

import { motion, AnimatePresence } from "motion/react";
import PersonAvatar from "@/components/person/PersonAvatar";
import { fullName, formatLifespan } from "@/lib/format";
import { useKinshipLabel } from "@/components/tree/useTreeData";

/**
 * Popup animado de persona (doble clic/toque): resumen + perfil + familia.
 */
export default function PersonPopup({
  person,
  myPersonId,
  family,
  gapHint,
  onClose,
  onFocusFamily,
  onCenterPerson,
  onShowRoute,
}) {
  const { data: kin } = useKinshipLabel(myPersonId, person?.id);
  const canRoute =
    kin &&
    myPersonId &&
    person &&
    myPersonId !== person.id &&
    kin.type !== "unrelated" &&
    kin.type !== "same";
  return (
    <AnimatePresence>
      {person && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-md rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-24 sm:mx-0 sm:w-96"
          role="dialog"
          aria-label={fullName(person)}
        >
          <div className="flex items-start gap-3">
            <PersonAvatar
              person={person} size="md"
              photoUrl={person.cover_photo_id ? `/api/photos/${person.cover_photo_id}/thumb` : null}
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold leading-tight text-stone-900">
                {fullName(person)}
              </h2>
              <p className="mt-0.5 text-lg text-stone-600">
                {formatLifespan(person) ?? "Fechas por completar"}
              </p>
              {kin && kin.label !== "es la misma persona" && (
                <p className="mt-1 inline-block rounded-full bg-emerald-50 px-3 py-1 text-base font-medium text-emerald-900">
                  {kin.label}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-full h-10 w-10 text-2xl text-stone-400 hover:bg-stone-100 flex items-center justify-center"
            >
              ×
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {gapHint && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-lg text-amber-900">
                Le falta registrar un padre o madre.{" "}
                <a
                  href={`/persona/${person.id}#conectar`}
                  className="font-semibold underline"
                >
                  Conectar uno existente
                </a>{" "}
                o{" "}
                <a
                  href={`/persona/nueva?progenitor=${person.id}`}
                  className="font-semibold underline"
                >
                  crear al padre/madre
                </a>
                .
              </p>
            )}
            <a
              href={`/persona/${person.id}`}
              className="rounded-xl bg-emerald-700 px-4 py-3 text-center text-lg font-semibold text-white"
            >
              Ver perfil completo
            </a>
            <button
              onClick={onCenterPerson}
              className="rounded-xl border border-stone-300 px-4 py-3 text-lg font-semibold text-stone-800"
            >
              Centrar aquí y explorar alrededor
            </button>
            <a
              href={`/persona/${person.id}?editar=1`}
              className="rounded-xl border border-stone-300 px-4 py-3 text-center text-lg font-semibold text-stone-800"
            >
              Editar datos
            </a>
            {family && (
              <button
                onClick={onFocusFamily}
                className="rounded-xl border border-stone-300 px-4 py-3 text-lg font-semibold text-stone-800"
              >
                Centrar a su familia
              </button>
            )}
            {canRoute && (
              <button
                onClick={() => onShowRoute?.(kin)}
                className="rounded-xl border border-emerald-700 px-4 py-3 text-lg font-semibold text-emerald-900"
              >
                Camino hasta mí ({kin.label})
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
