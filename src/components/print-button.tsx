"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 font-semibold text-brand-foreground hover:bg-brand/90 print:hidden">
      <Printer className="size-4" aria-hidden /> Print or save as PDF
    </button>
  );
}
