import { expect, it } from 'vitest';
import { websiteUrl } from './website';
it('links to canonical guides in the current supported locale', () => {
 expect(websiteUrl('ru','nodes')).toBe('https://gstdtoken.xyz/nodes?lang=ru');
 expect(websiteUrl('en','docs')).toBe('https://gstdtoken.xyz/docs?lang=en');
 expect(websiteUrl(undefined)).toBe('https://gstdtoken.xyz/?lang=en');
 expect(websiteUrl('unsupported','developers')).toBe('https://gstdtoken.xyz/developers?lang=en');
});
