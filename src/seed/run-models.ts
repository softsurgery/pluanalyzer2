try {
  process.loadEnvFile?.('.env')
} catch {
  // .env may not exist in production
}

async function run() {
  const { getPayload } = await import('payload')
  const { default: config } = await import('@payload-config')
  const { seedAiModels } = await import('@/seed/ai-models')
  const payload = await getPayload({ config })
  const res = await seedAiModels(payload)
  console.log(`✅ Seeded AI models (${res.created} created, ${res.total} total Ollama models).`)
  process.exit(0)
}

run().catch((err) => {
  console.error('❌ AI model seed failed:', err)
  process.exit(1)
})
