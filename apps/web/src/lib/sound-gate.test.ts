import { describe, expect, it } from 'vitest';
import { createSoundGate, type SharedMarks } from './sound-gate';

function sharedMarks(): SharedMarks {
  const set = new Set<string>();
  return { has: (k) => set.has(k), add: (k) => void set.add(k) };
}

describe('deduplicação do som entre abas', () => {
  it('somente a aba líder toca', () => {
    const marks = sharedMarks();
    const leader = createSoundGate({ marks, isLeader: () => true });
    const follower = createSoundGate({ marks, isLeader: () => false });
    expect(follower.shouldPlay('evt-1')).toBe(false);
    expect(leader.shouldPlay('evt-1')).toBe(true);
  });

  it('cada evento toca uma única vez, mesmo reentregue', () => {
    const gate = createSoundGate({ marks: sharedMarks(), isLeader: () => true });
    expect(gate.shouldPlay('evt-1')).toBe(true);
    expect(gate.shouldPlay('evt-1')).toBe(false);
    expect(gate.shouldPlay('evt-2')).toBe(true);
  });

  it('sem Web Locks (todas candidatas), a marca compartilhada evita som duplicado', () => {
    const marks = sharedMarks();
    const tabA = createSoundGate({ marks, isLeader: () => true });
    const tabB = createSoundGate({ marks, isLeader: () => true });
    const played = [tabA.shouldPlay('evt-9'), tabB.shouldPlay('evt-9')];
    expect(played.filter(Boolean)).toHaveLength(1);
  });

  it('troca de liderança: a nova líder não repete eventos já tocados', () => {
    const marks = sharedMarks();
    let leaderIsA = true;
    const tabA = createSoundGate({ marks, isLeader: () => leaderIsA });
    const tabB = createSoundGate({ marks, isLeader: () => !leaderIsA });
    expect(tabA.shouldPlay('evt-1')).toBe(true);
    leaderIsA = false;
    expect(tabB.shouldPlay('evt-1')).toBe(false);
    expect(tabB.shouldPlay('evt-2')).toBe(true);
  });
});
