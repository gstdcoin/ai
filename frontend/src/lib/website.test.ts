import { expect, it } from 'vitest';
import { websiteUrl } from './website';
it('links to canonical guides in the current supported locale', () => {
 expect(websiteUrl('ru','nodes')).toBe('https://gstdtoken.com/nodes?lang=ru');
 expect(websiteUrl('en','docs')).toBe('https://gstdtoken.com/docs?lang=en');
 expect(websiteUrl(undefined)).toBe('https://gstdtoken.com/?lang=en');
 expect(websiteUrl('unsupported','developers')).toBe('https://gstdtoken.com/developers?lang=en');
});
