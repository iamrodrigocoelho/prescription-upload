import { lockoutSeconds } from './lockout.js';

describe('lockoutSeconds', () => {
  const calc = (count: number) => lockoutSeconds(count, 5, 60, 1800);

  it('não bloqueia abaixo do limite', () => {
    expect([0, 1, 4].map(calc)).toEqual([0, 0, 0]);
  });

  it('bloqueia progressivamente a partir do limite', () => {
    expect([5, 6, 7, 8].map(calc)).toEqual([60, 120, 240, 480]);
  });

  it('respeita o teto', () => {
    expect(calc(10)).toBe(1800);
    expect(calc(1000)).toBe(1800);
  });
});
