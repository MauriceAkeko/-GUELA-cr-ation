import { Plus_Jakarta_Sans, Playfair_Display } from 'next/font/google';
import boutique from '../data/boutique.json';
import articles from '../data/vetements.json';
import './globals.css';

const body = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const display = Playfair_Display({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

const title = `${boutique.name} | Mode femme, robes de fêtes et tenues scolaires à Abidjan`;

export const metadata = {
  metadataBase: new URL(boutique.siteUrl),
  title: { default: title, template: `%s | ${boutique.name}` },
  description: boutique.description,
  keywords: [
    'boutique de mode Abidjan',
    'robes de fêtes enfants Abidjan',
    'tenues scolaires Abidjan',
    'vêtements femme Attoban',
    'robe pagne Abidjan',
    'habits enfants Abidjan',
    'GUELA création',
    'mode Côte d’Ivoire',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    title,
    description: boutique.description,
    url: boutique.siteUrl,
    siteName: boutique.name,
    locale: 'fr_CI',
    type: 'website',
    images: [{ url: '/LogoMain.png', alt: `Logo ${boutique.name}` }],
  },
  twitter: { card: 'summary_large_image', title, description: boutique.description, images: ['/LogoMain.png'] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
  icons: { icon: '/LogoMain.png', apple: '/LogoMain.png' },
  category: 'fashion',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: boutique.theme.primary,
};

// Données structurées Google : boutique locale + liste des produits
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ClothingStore',
      name: boutique.name,
      slogan: boutique.slogan,
      description: boutique.description,
      url: boutique.siteUrl,
      image: `${boutique.siteUrl}/LogoMain.png`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: boutique.address.street,
        addressLocality: boutique.address.city,
        addressCountry: boutique.address.country,
      },
      areaServed: 'Abidjan',
    },
    {
      '@type': 'ItemList',
      itemListElement: articles
        .filter((a) => a.available !== false)
        .map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Product',
            name: a.name,
            description: a.description,
            category: a.category,
            offers: {
              '@type': 'Offer',
              price: a.price,
              priceCurrency: 'XOF',
              availability: 'https://schema.org/InStock',
            },
          },
        })),
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${body.variable} ${display.variable}`}>
      <body style={{ '--brand': boutique.theme.primary, '--navy': boutique.theme.navy }}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
        {children}
      </body>
    </html>
  );
}