import PersonalizePage from '@/components/PersonalizePage';

export default async function Page({
  params,
}: {
  params: Promise<{ bookID: string }>;
}) {
  const { bookID } = await params;

  console.log('[Route] bookID =', bookID);

  return <PersonalizePage bookID={bookID} />;
}
