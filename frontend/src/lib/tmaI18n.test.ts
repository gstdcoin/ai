import { describe, expect, it } from 'vitest';
import { resolveTmaLang } from './tmaI18n';

describe('resolveTmaLang', () => {
  it('maps regional codes to a supported overlay language', () => {
    expect(resolveTmaLang('pt-BR')).toBe('pt');
    expect(resolveTmaLang('ZH-hans')).toBe('zh');
  });

  it('leaves en/ru and unknown languages to the regular catalog', () => {
    expect(resolveTmaLang('ru')).toBeNull();
    expect(resolveTmaLang('en-US')).toBeNull();
    expect(resolveTmaLang('xx')).toBeNull();
    expect(resolveTmaLang(undefined)).toBeNull();
  });
});
