import { getCurrentRound, isEnded } from './progress';

const progress = (...rounds: number[]) => rounds.map((completedRounds) => ({ completedRounds }));

describe('getCurrentRound', () => {
  it('is the lowest confirmed count', () => {
    expect(getCurrentRound(progress(2, 1, 3))).toBe(1);
  });

  it('is 0 without progress', () => {
    expect(getCurrentRound([])).toBe(0);
  });
});

describe('isEnded', () => {
  it('needs all rounds of every apparatus', () => {
    expect(isEnded(progress(4, 4, 4, 4))).toBe(true);
    expect(isEnded(progress(4, 4, 3, 4))).toBe(false);
    expect(isEnded([])).toBe(false);
  });
});
