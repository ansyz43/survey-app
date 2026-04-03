'use client'

export default function PrintButton() {
  return (
    <div className="no-print flex gap-3 mb-6">
      <button
        onClick={() => window.print()}
        className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 text-sm font-medium"
      >
        🖨 Печать / Сохранить PDF
      </button>
      <button
        onClick={() => window.close()}
        className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
      >
        ✕ Закрыть
      </button>
    </div>
  )
}
