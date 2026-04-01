import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

/**
 * Shared i18n props for Pages Router (getStaticProps / getServerSideProps).
 * Central place to add namespaces (e.g. `layout`) without editing every page.
 */
export async function getCommonStaticProps(locale?: string | null) {
  return {
    ...(await serverSideTranslations(locale ?? 'en', ['common'])),
  };
}
