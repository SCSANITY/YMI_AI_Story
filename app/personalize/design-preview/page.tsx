import { notFound } from "next/navigation";
import { ProductPreviewFixture } from "./ProductPreviewFixture";
import { BookMaterialFixture } from "./BookMaterialFixture";

export const metadata = { robots: { index: false, follow: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ baseline?: string; section?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  if (query.section === "book") return <BookMaterialFixture />;
  return <ProductPreviewFixture baseline={query.baseline === "1"} />;
}
