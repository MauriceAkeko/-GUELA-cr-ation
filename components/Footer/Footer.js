'use client';

import {
  FaWhatsapp,
  FaFacebookF,
  FaInstagram,
  FaTiktok,
  FaLocationDot,
  FaPhone,
  FaClock,
} from 'react-icons/fa6';
import boutique from '../../data/boutique.json';
import styles from './Footer.module.css';

const MAUCODE_URL = 'https://maucode-web.vercel.app/';

// Assemble le numéro uniquement au clic : il n'apparaît jamais dans le HTML de la page.
const assemble = (parts) => (Array.isArray(parts) ? parts.join('') : String(parts)).replace(/[^\d+]/g, '');

const callNumber = (parts) => window.location.assign(`tel:${assemble(parts)}`);

const openWhatsApp = () => {
  const num = assemble(boutique.whatsapp).replace(/\D/g, '');
  const text = encodeURIComponent(`Bonjour ${boutique.name}, je souhaite des informations.`);
  window.open(`https://wa.me/${num}?text=${text}`, '_blank', 'noopener,noreferrer');
};

export default function Footer() {
  const { address, phones, social, hours } = boutique;
  const fullAddress = `${address.street}, ${address.city}`;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

  const networks = [
    { key: 'facebook', label: 'Facebook', url: social.facebook, Icon: FaFacebookF },
    { key: 'instagram', label: 'Instagram', url: social.instagram, Icon: FaInstagram },
    { key: 'tiktok', label: 'TikTok', url: social.tiktok, Icon: FaTiktok },
  ].filter((n) => n.url);

  return (
    <footer className={styles.footer} id="contact">
      <div className={styles.inner}>
        <div className={styles.col}>
          <h2 className={styles.brand}>{boutique.name}</h2>
          <p className={styles.slogan}>{boutique.slogan}</p>
          <p className={styles.about}>{boutique.tagline}.</p>
          {networks.length > 0 && (
            <ul className={styles.social}>
              {networks.map(({ key, label, url, Icon }) => (
                <li key={key}>
                  <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${label} ${social.handle}`}>
                    <Icon aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.handle}>{social.handle}</p>
        </div>

        <div className={styles.col}>
          <h3>Nous contacter</h3>
          <div className={styles.actions}>
            <button type="button" className={`${styles.iconBtn} ${styles.wa}`} onClick={openWhatsApp}>
              <FaWhatsapp aria-hidden="true" /> Écrire sur WhatsApp
            </button>
            {phones.map((p) => (
              <button key={p.label} type="button" className={styles.iconBtn} onClick={() => callNumber(p.tel)}>
                <FaPhone aria-hidden="true" /> {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.col}>
          <h3>Nous trouver</h3>
          <ul className={styles.list}>
            <li>
              <FaLocationDot aria-hidden="true" />
              <span>
                {address.street}
                <a href={mapUrl} target="_blank" rel="noopener noreferrer">Voir sur la carte</a>
              </span>
            </li>
            {hours && (
              <li>
                <FaClock aria-hidden="true" />
                <span>{hours}</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className={styles.bottom}>
        <p>© {new Date().getFullYear()} {boutique.name}. Tous droits réservés.</p>
        <p>
          Site créé par{' '}
          <a href={MAUCODE_URL} target="_blank" rel="noopener noreferrer"><strong>Maucode</strong></a>
          , le digital autrement.
        </p>
      </div>
    </footer>
  );
}