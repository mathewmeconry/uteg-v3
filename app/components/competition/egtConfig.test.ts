import { egtModule } from '~/modules/egt/module';
import { getAffectedGrades, getVaultRule, setAllHonour, setVaultRule } from './egtConfig';

const config = egtModule.defaultConfig;
const AVERAGE = { attempts: 2, aggregation: 'AVG' } as const;

describe('setVaultRule', () => {
  it('overrides one category', () => {
    const changed = setVaultRule(config, 'K5', AVERAGE);
    expect(getVaultRule(changed, 'K5')).toEqual(AVERAGE);
    expect(getVaultRule(changed, 'K4')).toEqual({ attempts: 2, aggregation: 'MAX' });
    expect(getVaultRule(config, 'K5')).toEqual({ attempts: 2, aggregation: 'MAX' });
  });

  it('drops the override when it equals the default', () => {
    const changed = setVaultRule(config, 'K6', { attempts: 2, aggregation: 'MAX' });
    expect(Object.keys(changed.inputs.sprung!.categories)).toEqual(['K7']);
  });

  it('keeps attempts and aggregation consistent', () => {
    const single = setVaultRule(config, 'K5', { attempts: 1, aggregation: 'MAX' });
    expect(getVaultRule(single, 'K5')).toEqual({ attempts: 1, aggregation: 'NONE' });
    const several = setVaultRule(single, 'K5', { attempts: 3, aggregation: 'NONE' });
    expect(getVaultRule(several, 'K5')).toEqual({ attempts: 3, aggregation: 'MAX' });
  });

  it('works without vault rules', () => {
    const changed = setVaultRule({ ...config, inputs: {} }, 'K5', AVERAGE);
    expect(getVaultRule(changed, 'K5')).toEqual(AVERAGE);
    expect(getVaultRule(changed, 'K4')).toEqual({ attempts: 1, aggregation: 'NONE' });
  });
});

describe('getAffectedGrades', () => {
  const counts = [
    { apparatus: 'sprung', category: 'K5', attempts: 2, count: 12 },
    { apparatus: 'sprung', category: 'K5', attempts: 1, count: 3 },
    { apparatus: 'sprung', category: 'K4', attempts: 2, count: 7 },
  ];

  it('counts what is recomputed and what stays', () => {
    const changed = setVaultRule(config, 'K5', AVERAGE);
    expect(getAffectedGrades(config, changed, counts)).toEqual({ recompute: 12, keep: 3 });
  });

  it('is empty without changes', () => {
    expect(getAffectedGrades(config, config, counts)).toEqual({ recompute: 0, keep: 0 });
  });
});

describe('setAllHonour', () => {
  it('sets every category of both sexes', () => {
    const { FEMALE, MALE } = setAllHonour(40);
    expect(Object.keys(FEMALE)).toContain('KD');
    expect(Object.keys(MALE)).toContain('KH');
    expect(new Set([...Object.values(FEMALE), ...Object.values(MALE)])).toEqual(new Set([40]));
  });
});
