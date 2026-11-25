import { planGrounds } from './groundPlan';

/** A category with divisions that have no clubs. */
function empty(count: number) {
  return Array.from({ length: count }, () => []);
}

function countPerGround(plan: ReturnType<typeof planGrounds>) {
  const counts: number[] = [];
  for (const { ground } of plan) counts[ground] = (counts[ground] ?? 0) + 1;
  return counts;
}

describe('planGrounds', () => {
  it('keeps categories on one ground and balances the divisions', () => {
    const plan = planGrounds([5, 5, 4, 4, 3, 3].map(empty), [0, 0, 0], true);
    expect(countPerGround(plan)).toEqual([8, 8, 8]);
    for (let group = 0; group < 6; group++) {
      const own = plan.filter((division) => division.group === group);
      expect(new Set(own.map(({ ground }) => ground)).size).toBe(1);
    }
  });

  it('spreads categories over the grounds, one after the other', () => {
    const plan = planGrounds([5, 2].map(empty), [0, 0, 0], false);
    expect(plan.map(({ group, ground, slot }) => [group, ground, slot])).toEqual([
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
      [0, 0, 1],
      [0, 1, 1],
      [1, 2, 1],
      [1, 0, 2],
    ]);
  });

  it.each([true, false])('takes into account what is already due (%s)', (keepTogether) => {
    expect(planGrounds([empty(2)], [3, 1], keepTogether)).toMatchObject([
      { ground: 1, slot: 1 },
      { ground: 1, slot: 2 },
    ]);
  });

  it('orders the divisions so that clubs are not on two grounds at once', () => {
    const group = [['a'], ['b'], ['c']];
    const plan = planGrounds([group, group], [0, 0], true);
    expect(plan.map(({ clashes }) => clashes)).toEqual(empty(6));
    expect(plan.map(({ group, division }) => `${group}${division}`).sort()).toEqual([
      '00',
      '01',
      '02',
      '10',
      '11',
      '12',
    ]);

    const spread = planGrounds([[['a'], ['a'], ['b'], ['b']]], [0, 0], false);
    expect(spread.map(({ clashes }) => clashes)).toEqual(empty(4));
  });

  it('says which clubs are on two grounds when it cannot be avoided', () => {
    const plan = planGrounds([[['a', 'b']], [['b', 'c']]], [0, 0], true);
    expect(plan.map(({ clashes }) => clashes)).toEqual([['b'], ['b']]);
  });

  it('has no clashes on one ground or at different times', () => {
    const one = planGrounds([[['a']], [['a']]], [0], true);
    expect(one.map(({ clashes }) => clashes)).toEqual([[], []]);
    // The other ground has divisions that are already due.
    const later = planGrounds([[['a'], ['b']], [['a']]], [1, 2], true);
    expect(later.map(({ clashes }) => clashes)).toEqual([[], [], []]);
  });
});
