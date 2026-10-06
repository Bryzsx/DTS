import type { AgencySettings } from "../lib/types"

/**
 * Letterhead shared by both print views.
 *
 * Rendered on paper rather than on screen — the screen chrome is hidden by the
 * print stylesheet, so this is the only branding that reaches the page.
 */
export function Letterhead({
  agency,
  printedAt,
  title,
}: {
  agency: AgencySettings
  printedAt: Date
  title: string
}) {
  return (
    <header className="print-letterhead">
      <div className="flex items-start gap-3">
        {agency.agency_seal_url && (
          <img src={agency.agency_seal_url} alt="" className="h-14 w-14 object-contain" />
        )}
        <div>
          <p className="font-serif text-base font-bold uppercase tracking-wide text-navy-900">
            {agency.agency_name}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-600">
            {agency.agency_subtitle}
          </p>
        </div>
      </div>
      <div className="text-right text-[9px] leading-relaxed text-slate-600">
        <p className="font-semibold text-navy-900">{title}</p>
        <p>
          Printed{" "}
          {printedAt.toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
          {" at "}
          {printedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </header>
  )
}
