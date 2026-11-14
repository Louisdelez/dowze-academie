import { isInstalledFormation, type FormationManifest } from './formations';

export function sharedFormationManifest(content: unknown): FormationManifest | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const value = content as { schema?: unknown; manifest?: FormationManifest };
  if (value.schema !== 1 || !value.manifest) return null;
  const manifest = value.manifest;
  return isInstalledFormation({ instanceId: '00000000-0000-4000-8000-000000000000',
    packageId: manifest.id, packageVersion: manifest.packageVersion, manifest,
    installedAt: '2026-01-01T00:00:00.000Z', storageKind: 'formation-v1' }) ? manifest : null;
}
