import { notFound } from "next/navigation";
import { ProductPreviewFixture } from "./ProductPreviewFixture";

export const metadata = { robots: { index: false, follow: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ baseline?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  return <ProductPreviewFixture baseline={query.baseline === "1"} />;
}
