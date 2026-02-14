import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bitram.co.kr";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  // Only include publicly indexable pages here.
  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}

