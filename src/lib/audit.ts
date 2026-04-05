import { prisma } from './db'

export async function auditLog(opts: {
  action: string
  username: string
  ip?: string | null
  details?: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action: opts.action,
        username: opts.username,
        ip: opts.ip || undefined,
        details: opts.details,
      },
    })
  } catch (e) {
    console.error('[AuditLog] failed to write:', e)
  }
}
