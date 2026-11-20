try {
  process.loadEnvFile?.(".env");
} catch {
  // .env may not exist in production
}

async function main() {
  const { getPayload } = await import("payload");
  const { default: config } = await import("@payload-config");
  const { seedDatabase } = await import("@/seed/index");
  const payload = await getPayload({ config });
  await seedDatabase(payload);
  console.log("✅ PLU Analyzer database seeded successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
