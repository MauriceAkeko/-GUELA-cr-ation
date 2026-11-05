import boutique from '../data/boutique.json';

export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${boutique.siteUrl}/sitemap.xml`,
  };
}