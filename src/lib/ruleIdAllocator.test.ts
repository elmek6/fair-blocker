import { describe, it, expect } from 'vitest';
import {
  whitelistRuleId,
  blacklistRuleId,
  pauseSessionRuleId,
} from './ruleIdAllocator';

describe('ruleIdAllocator bantları', () => {
  it('doğru başlangıç ofsetleri', () => {
    expect(whitelistRuleId(0)).toBe(1);
    expect(whitelistRuleId(5)).toBe(6);
    expect(blacklistRuleId(0)).toBe(10_000);
    expect(pauseSessionRuleId(0)).toBe(1);
  });

  it('bant taşınca hata fırlatır', () => {
    expect(() => whitelistRuleId(10_000)).toThrow();
  });
});
