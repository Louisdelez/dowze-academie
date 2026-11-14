export interface AutomaticUpdateController { snapshot(): { phase: string; checkedAt?: number }; check(): Promise<void>; download(): Promise<void> }
/** Background downloads never install or restart an active session. */
export async function automaticUpdateCycle(controller: AutomaticUpdateController, due: boolean) {
  const phase = controller.snapshot().phase;
  if (['checking','downloading','installing','installed','ready'].includes(phase)) return;
  if (due) await controller.check();
  if (controller.snapshot().phase === 'available') await controller.download();
}
