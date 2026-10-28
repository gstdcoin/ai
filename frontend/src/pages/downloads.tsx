import { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import GuideHandoff from '../components/GuideHandoff';
export default function Page() { return <GuideHandoff kind='nodes' />; }
export const getStaticProps: GetStaticProps = async ({locale}) => ({props: await getCommonStaticProps(locale)});
