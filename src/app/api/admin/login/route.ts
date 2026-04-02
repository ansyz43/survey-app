import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword, createToken } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Введите логин и пароль' }, { status: 400 })
    }

    const admin = await prisma.admin.findUnique({ where: { username } })

    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 })
    }

    const token = await createToken({ userId: admin.id, username: admin.username })

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
