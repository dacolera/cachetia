import { describe, expect, it } from 'vitest';
import { breakIntoNotes } from './Banknotes';

const summary = (cents: number) => breakIntoNotes(cents).map((n) => `${n.count}x${n.note / 100}`);

describe('pote em cédulas', () => {
  it('usa as maiores cédulas possíveis, de R$ 10 para cima', () => {
    expect(summary(5000)).toEqual(['1x50']);
    expect(summary(8000)).toEqual(['1x50', '1x20', '1x10']);
    expect(summary(4000)).toEqual(['2x20']);
    expect(summary(37000)).toEqual(['1x200', '1x100', '1x50', '1x20']);
  });
});
