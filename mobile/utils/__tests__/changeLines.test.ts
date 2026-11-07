import { getChangeLines } from '../changeLines';

describe('getChangeLines', () => {
  it('returns label/value pairs from meta.changes in order', () => {
    expect(getChangeLines({ changes: [
      { field: 'when', label: 'When', value: 'Fri, Nov 20 at 8:00 PM' },
      { field: 'capacity', label: 'Spots', value: '12' },
    ] })).toEqual([
      { label: 'When', value: 'Fri, Nov 20 at 8:00 PM' },
      { label: 'Spots', value: '12' },
    ]);
  });

  it('returns an empty list for older notifications without changes', () => {
    expect(getChangeLines(undefined)).toEqual([]);
    expect(getChangeLines({ changedFields: ['schedule'] })).toEqual([]);
    expect(getChangeLines({ changes: [] })).toEqual([]);
  });

  it('skips malformed entries instead of crashing', () => {
    expect(getChangeLines({ changes: [null, { label: 'When' }, { label: 'Spots', value: '5' }] as any })).toEqual([
      { label: 'Spots', value: '5' },
    ]);
  });
});
