import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword, createToken } from '@/lib/auth'
import { auditLog } from '@/lib/audit'

// In-memory lockout tracker (works per PM2 instance, good enough for 1-2 admins)
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes

function getClientKey(request: Request): string {
  return request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || 'unknown'
}

function isLocked(key: string): boolean {
  const entry = failedAttempts.get(key)
  if (!entry) return false
  if (Date.now() > entry.lockedUntil) { failedAttempts.delete(key); return false }
  return entry.count >= MAX_ATTEMPTS
}

function recordFailure(key: string) {
  const entry = failedAttempts.get(key) || { count: 0, lockedUntil: 0 }
  entry.count++
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = Date.now() + LOCKOUT_MS
  failedAttempts.set(key, entry)
}

function clearFailures(key: string) {
  failedAttempts.delete(key)
}

export async function POST(request: Request) {
  try {
    const ip = getClientKey(request)

    if (isLocked(ip)) {
      return NextResponse.json({ error: 'Слишком много попыток. Попробуйте через 15 минут' }, { status: 429 })
    }

    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Введите логин и пароль' }, { status: 400 })
    }

    const admin = await prisma.admin.findUnique({ where: { username } })

    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      recordFailure(ip)
      await auditLog({ action: 'login_failed', username: username || 'unknown', ip })
      return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 })
    }

    clearFailures(ip)
    const token = await createToken({ userId: admin.id, username: admin.username })
    await auditLog({ action: 'login', username: admin.username, ip })

    const response = NextResponse.json({ ok: true })
    response.cookies.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NEXTAUTH_URL?.startsWith('https'),
      sameSite: 'lax',
      maxAge: 86400,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
