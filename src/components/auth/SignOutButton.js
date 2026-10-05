"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton({ label = "Salir" }) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-xl border border-stone-300 px-4 py-1.5 text-lg hover:bg-stone-50"
    >
      {label}
    </button>
  );
}
