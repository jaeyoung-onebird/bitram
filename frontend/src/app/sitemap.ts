import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bitram.co.kr";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  // Static pages
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  // Dynamic community post entries
  let postEntries: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${apiUrl}/api/posts/sitemap`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const posts: Array<{ id: string; updated_at: string }> = await res.json();
      postEntries = posts.map((post) => ({
        url: `${siteUrl}/community/${post.id}`,
        lastModified: new Date(post.updated_at),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    }
  } catch {
    // If API is down, sitemap still works with static entries only
  }

  return [...staticEntries, ...postEntries];
}
