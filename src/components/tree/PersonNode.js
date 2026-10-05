"use client";

import { NODE_W, NODE_H } from "@/lib/tree-layout/index";
import { initials, formatLifespan } from "@/lib/format";

/**
 * Tarjeta de persona con nivel de detalle según zoom.
 * @param {{ person: any, mix: string[]|null, lod: 'far'|'mid'|'near', dimmed: boolean, selected: boolean, birthday: boolean, onOpen: () => void }} props
 */
export default function PersonNode({
  person,
  mix,
  lod,
  dimmed,
  selected,
  birthday,
  onOpen,
}) {
  const color = person.branch_color ?? "#78716c";
  const photoUrl = person.cover_photo_id
    ? `/api/photos/${person.cover_photo_id}/thumb`
    : null;
  const dotStyle =
    mix && mix.length > 1
      ? {
          background: `linear-gradient(135deg, ${mix.map((c, i) => `${c} ${(i * 100) / mix.length}%, ${c} ${((i + 1) * 100) / mix.length}%`).join(", ")})`,
        }
      : { backgroundColor: color };
  const face = (cls) =>
    photoUrl ? (
      // <img> a propósito: con sesión, next/image recibiría 401.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        loading="lazy"
        className={`${cls} rounded-full object-cover`}
      />
    ) : (
      <span
        className={`flex items-center justify-center font-bold text-white ${cls}`}
        style={dotStyle}
      >
        {initials(person)}
      </span>
    );

  if (lod === "far") {
    return (
      <button
        onClick={onOpen}
        title={`${person.given_names ?? ""} ${person.paternal_surname ?? ""}`}
        className="absolute flex flex-col items-center"
        style={{
          left: person.x - 20,
          top: person.y - 6,
          width: 40 + NODE_W,
          opacity: dimmed ? 0.45 : 1,
        }}
      >
        <span
          className="block h-3.5 w-3.5 rounded-full border border-white shadow"
          style={dotStyle}
        />
        <span className="mt-1 max-w-44 truncate text-xs text-stone-700">
          {person.paternal_surname ?? person.given_names}
        </span>
      </button>
    );
  }

  if (lod === "mid") {
    return (
      <button
        onClick={onOpen}
        className={`absolute flex items-center gap-2 rounded-full border bg-white py-1 pl-1 pr-3 shadow ${selected ? "border-emerald-600 ring-2 ring-emerald-300" : "border-stone-200"}`}
        style={{
          left: person.x,
          top: person.y + 8,
          width: NODE_W,
          opacity: dimmed ? 0.45 : 1,
        }}
      >
        {face("h-9 w-9 shrink-0 text-sm")}
        <span className="truncate text-left text-sm font-medium text-stone-900">
          {person.given_names} {person.paternal_surname}
        </span>
        {birthday && (
          <span
            title="Cumple este mes"
            className="ml-auto h-3 w-3 shrink-0 rounded-full bg-amber-400"
          />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onOpen}
      className={`absolute rounded-2xl border bg-white p-2 text-left shadow ${selected ? "border-emerald-600 ring-2 ring-emerald-300" : "border-stone-200"}`}
      style={{
        left: person.x,
        top: person.y,
        width: NODE_W,
        minHeight: NODE_H,
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      <span className="flex items-center gap-2">
        {face("h-10 w-10 shrink-0 text-base")}
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold leading-tight text-stone-900">
            {person.given_names} {person.paternal_surname}{" "}
            {person.maternal_surname ?? ""}
          </span>
          {person.nickname && (
            <span className="block truncate text-sm text-stone-500">
              “{person.nickname}”
            </span>
          )}
        </span>
      </span>
      <span className="mt-1 block truncate text-sm text-stone-600">
        {formatLifespan(person) ?? ""}
      </span>
      {birthday && (
        <span
          title="Cumple este mes"
          className="absolute right-2 top-2 h-3 w-3 rounded-full bg-amber-400"
        />
      )}
    </button>
  );
}
