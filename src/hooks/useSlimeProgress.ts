import { useEffect, useRef } from 'react';
import { usePersistentState } from './usePersistentState';
import { savedSlimeColor } from '../lib/dowzy';
import { activeMinuteEligible, awardSlimeXp, emptySlimeProgress, isSlimeProgress, slimeProgressKey, xpDay, type XpEvent } from '../lib/slimeProgress';
import type { Subject, TaskItem, AssessmentRecord } from '../types';

export function useSlimeProgress(accountId: string, formationId: string, subjects: Subject[], tasks: TaskItem[], assessments: AssessmentRecord[]) {
  const [progress, setProgress] = usePersistentState(slimeProgressKey(accountId), emptySlimeProgress(), isSlimeProgress);
  const setter = useRef(setProgress); setter.current = setProgress;
  useEffect(() => {
    const color = savedSlimeColor(accountId), at = Date.now(), day = xpDay(new Date(at));
    const events: XpEvent[] = [];
    const add = (id: string, kind: XpEvent['kind']) => events.push({ id: `${formationId}:${id}`, kind, color, day, at });
    for (const subject of subjects) for (const module of subject.modules) for (const chapter of module.items) {
      const id = `${subject.id}:${module.id}:${chapter.id}`;
      if (chapter.completed) add(`course:${id}`, 'course');
      for (const lesson of chapter.lessons ?? []) if (lesson.completed) add(`lesson:${id}:${lesson.id}`, 'lesson');
    }
    for (const task of tasks) if (task.completed) add(`goal:${task.id}`, 'goal');
    for (const assessment of assessments) add(`assessment:${assessment.id}`, 'assessment');
    setter.current(current => awardSlimeXp(current, events));
  }, [accountId, formationId, subjects, tasks, assessments]);
  useEffect(() => {
    let lastInteraction = 0, lastSample = Date.now();
    const interaction = (event: Event) => { if (event.isTrusted) lastInteraction = Date.now(); };
    const reset = () => { lastSample = Date.now(); lastInteraction = 0; };
    const events = ['pointerdown','pointermove','keydown','wheel','touchstart'];
    for (const name of events) window.addEventListener(name, interaction, { passive: true });
    window.addEventListener('blur', reset); document.addEventListener('visibilitychange', reset);
    const timer = setInterval(() => {
      const now = Date.now();
      if (activeMinuteEligible({visible: !document.hidden, focused: document.hasFocus(), lastInteraction, now, lastSample})) {
        const day = xpDay(new Date(now)), color = savedSlimeColor(accountId);
        // UTC minute identity prevents simultaneous windows/devices from multiplying connected-time rewards.
        setter.current(current => awardSlimeXp(current,[{id:`active-minute:${Math.floor(now/60000)}`,day,color,kind:'active-minute',at:now}]));
      }
      lastSample = now;
    }, 60000);
    return () => { clearInterval(timer); for (const name of events) window.removeEventListener(name,interaction); window.removeEventListener('blur',reset); document.removeEventListener('visibilitychange',reset); };
  }, [accountId]);
  return [progress, setProgress] as const;
}
