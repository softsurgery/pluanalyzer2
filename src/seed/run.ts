import { getPayload } from 'payload'
import config from '@payload-config'
import { seedDatabase } from '@/seed/index'

try {
  process.loadEnvFile?.('.env')
} catch {
  // .env may not exist in production
}

async function main() {
  const payload = await getPayload({ config })
  await seedDatabase(payload)
  console.log('✅ PLU Analyzer database seeded successfully.')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
