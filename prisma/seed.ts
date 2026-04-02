import { PrismaClient } from '@prisma/client'
import bcryptjs from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin'
  const password = process.env.ADMIN_PASSWORD || 'admin123'

  const existing = await prisma.admin.findUnique({ where: { username } })
  if (existing) {
    console.log(`Admin "${username}" already exists`)
    return
  }

  const passwordHash = await bcryptjs.hash(password, 12)
  await prisma.admin.create({
    data: { username, passwordHash },
  })

  console.log(`Admin "${username}" created successfully`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
