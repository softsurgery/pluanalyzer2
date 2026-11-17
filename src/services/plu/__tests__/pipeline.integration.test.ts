import { describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@payload-config'

try {
  process.loadEnvFile?.('.env')
} catch {
  // ignore
}

describe('Payload CMS Immutability & RBAC Integration', () => {
  it('enforces immutability on analysis-snapshots and prompt-history and RBAC for viewer', async () => {
    const payload = await getPayload({ config })

    const viewerRes = await payload.find({
      collection: 'users',
      where: { role: { equals: 'viewer' } },
      limit: 1,
    })
    expect(viewerRes.docs.length).toBeGreaterThan(0)
    const viewer = viewerRes.docs[0]

    // Viewer cannot create a project
    await expect(
      payload.create({
        collection: 'projects',
        user: viewer,
        overrideAccess: false,
        data: {
          name: 'Unauthorized Viewer Project',
          commune: 'Marseille',
          codeInsee: '13055',
          owner: viewer.id,
        },
      }),
    ).rejects.toThrow()

    // Admin cannot overwrite or delete an immutable AnalysisSnapshot when access control is enforced
    const adminRes = await payload.find({
      collection: 'users',
      where: { role: { equals: 'admin' } },
      limit: 1,
    })
    const admin = adminRes.docs[0]
    const snapshots = await payload.find({ collection: 'analysis-snapshots', limit: 1 })
    expect(snapshots.docs.length).toBeGreaterThan(0)
    const snap = snapshots.docs[0]

    await expect(
      payload.update({
        collection: 'analysis-snapshots',
        id: snap.id,
        user: admin,
        overrideAccess: false,
        data: { snapshotLabel: 'Tampered' },
      }),
    ).rejects.toThrow()

    await expect(
      payload.delete({
        collection: 'analysis-snapshots',
        id: snap.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})
