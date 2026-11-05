import boutique from '../data/boutique.json';

export default function sitemap() {
  return [
    { url: boutique.siteUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
  ];
}