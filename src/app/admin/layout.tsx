'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  // Don't show layout on login page
  if (pathname === '/admin') {
    return <>{children}</>
  }

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin')
  }

  const navItems = [
    { href: '/admin/dashboard', label: 'Дашборд' },
    { href: '/admin/responses', label: 'Ответы' },
    { href: '/admin/analytics', label: 'AI Аналитика' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-lg">📊 Админка</span>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === item.href
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          Выйти
        </button>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
