import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'

import { Users } from '@/collections/Users'
import { Projects } from '@/collections/Projects'
import { Parcels } from '@/collections/Parcels'
import { Documents } from '@/collections/Documents'
import { Regulations } from '@/collections/Regulations'
import { GISData } from '@/collections/GISData'
import { Executions } from '@/collections/Executions'
import { Analyses } from '@/collections/Analyses'
import { AnalysisSnapshots } from '@/collections/AnalysisSnapshots'
import { PromptHistory } from '@/collections/PromptHistory'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '— PLU Analyzer Platform',
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Projects,
    Analyses,
    Parcels,
    PromptHistory,
    AnalysisSnapshots,
    Documents,
    Regulations,
    GISData,
    Executions,
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'plu-analyzer-fallback-secret-change-me',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString:
        process.env.DATABASE_URI ||
        'postgresql://plu_user:plu_password@localhost:5433/plu_analyzer',
    },
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  sharp,
})
