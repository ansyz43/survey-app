'use client'

export default function ProgressBar({ current, total, skipped = 0 }: { current: number; total: number; skipped?: number }) {
  const effective = total - skipped
  const pct = Math.round((Math.min(current, effective) / effective) * 100)
  return (
    <div className="w-full mb-6">
      <div className="flex justify-between text-sm text-gray-500 mb-1">
        <span>{Math.min(current, effective)}/{effective}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
