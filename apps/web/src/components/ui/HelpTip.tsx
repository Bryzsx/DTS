import { Tooltip } from "./Tooltip"

interface HelpTipProps {
  text: string
  className?: string
}

export function HelpTip({ text, className = "" }: HelpTipProps) {
  return (
    <Tooltip content={text}>
      <button
        type="button"
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 transition-colors text-[10px] font-bold ${className}`}
      >
        ?
      </button>
    </Tooltip>
  )
}
