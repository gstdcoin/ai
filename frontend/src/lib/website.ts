/** Public guides have one home; never forward wallet/session/history parameters. */
const SECTIONS = { about: '/', docs: '/docs', nodes: '/nodes', developers: '/developers' } as const;
export function websiteUrl(locale: string | undefined, section: keyof typeof SECTIONS = 'about'): string {
  const url = new URL(SECTIONS[section], 'https://gstdtoken.com');
  url.searchParams.set('lang', locale === 'ru' ? 'ru' : 'en');
  return url.toString();
}
