import type { AutomaticUpdateController } from './automaticUpdateCycle';
/** Only startup may apply: background checks keep active work uninterrupted. */
export async function startupUpdates(controller: AutomaticUpdateController, online: boolean, applyAtBoot: () => Promise<unknown>) {
  await applyAtBoot();
  if (!online) return;
  await controller.check();
  if (controller.snapshot().phase === 'available') await controller.download();
  if (controller.snapshot().phase === 'ready') await applyAtBoot();
}
