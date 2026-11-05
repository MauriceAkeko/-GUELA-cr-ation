'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  FaWhatsapp,
  FaPlus,
  FaMinus,
  FaXmark,
  FaBagShopping,
  FaCopy,
  FaCheck,
  FaArrowLeft,
  FaTruckFast,
  FaStore,
  FaHeart,
  FaScissors,
  FaCircleInfo,
  FaShieldHalved,
} from 'react-icons/fa6';
import boutique from '../data/boutique.json';
import articles from '../data/vetements.json';
import Footer from '../components/Footer/Footer';
import styles from './page.module.css';

/* ------------------------------------------------------------------ */
/* Constantes de sécurité                                              */
/* ------------------------------------------------------------------ */
const MAX_QTY = 20; // quantité max par article
const MAX_LINES = 30; // nombre max d'articles différents
const COOLDOWN_MS = 30000; // délai mini entre deux envois
const MIN_FILL_MS = 4000; // temps mini de remplissage (anti-robot)
const MAX_URL_LEN = 3500; // longueur max de l'URL WhatsApp
const COOLDOWN_KEY = 'lastOrderAt';

const MODES = ['livraison', 'retrait'];
const RIDERS = ['boutique', 'yango'];

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */
const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');

const fcfa = (n) => `${new Intl.NumberFormat('fr-FR').format(n)} ${boutique.currency}`;

// Nettoie un texte saisi : normalisation Unicode, retrait des caractères de
// contrôle/invisibles, des chevrons et des symboles de mise en forme WhatsApp.
const clean = (s, max) =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/[<>*_~`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

// Numéro ivoirien : 10 chiffres, avec ou sans +225.
const normalizePhone = (v) =>
  String(v ?? '')
    .replace(/[\s.\-()]/g, '')
    .replace(/^(\+|00)?225/, '');

// Images : uniquement des chemins locaux (jamais d'URL externe venant du JSON).
const safeImage = (src) => (typeof src === 'string' && /^\/(?![/\\])[\w\-./]+$/.test(src) ? src : null);

// Numéro de facture imprévisible.
const orderNumber = () => {
  try {
    const b = new Uint32Array(2);
    crypto.getRandomValues(b);
    return `CMD-${(b[0].toString(36) + b[1].toString(36)).toUpperCase().slice(0, 8)}`;
  } catch {
    return `CMD-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }
};

const readLastSent = () => {
  try {
    return Number(sessionStorage.getItem(COOLDOWN_KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeLastSent = (t) => {
  try {
    sessionStorage.setItem(COOLDOWN_KEY, String(t));
  } catch {}
};

// WhatsApp de la boutique : validé une seule fois.
const WA_NUMBER = onlyDigits(boutique.whatsapp);
const WA_OK = /^\d{8,15}$/.test(WA_NUMBER);
const waUrl = (text) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

// Catalogue assaini : on écarte tout article mal formé.
const CATALOG = (() => {
  const seen = new Set();
  return (Array.isArray(articles) ? articles : []).filter((a) => {
    if (!a || a.id === undefined || a.id === null) return false;
    const key = String(a.id);
    if (seen.has(key)) return false;
    if (typeof a.price !== 'number' || !Number.isFinite(a.price) || a.price < 0) return false;
    seen.add(key);
    return true;
  });
})();
const BY_ID = new Map(CATALOG.map((a) => [String(a.id), a]));

const INITIAL = {
  name: '',
  phone: '',
  mode: 'livraison',
  address: '',
  rider: 'boutique',
  payWhen: 'livraison',
  payMethod: '',
  amount: '',
  note: '',
  hp: '',
};

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([tabindex="-1"]),textarea:not([disabled]),select:not([disabled])';

export default function Page() {
  const [cat, setCat] = useState('Tout');
  const [cart, setCart] = useState({});
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('cart'); // cart | form | done
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState(false);

  const drawerRef = useRef(null);
  const lastFocus = useRef(null);
  const formOpenedAt = useRef(0);

  // Panier : Échap ferme, Tab reste piégé dans la boîte de dialogue,
  // le défilement de la page est bloqué, le focus est restitué à la fermeture.
  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement;
    drawerRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !drawerRef.current) return;
      const nodes = drawerRef.current.querySelectorAll(FOCUSABLE);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      lastFocus.current?.focus?.();
    };
  }, [open]);

  // À la fermeture, on efface la facture (nom, téléphone, adresse) de la mémoire.
  useEffect(() => {
    if (!open && step === 'done') {
      setDone(null);
      setStep('cart');
    }
  }, [open, step]);

  // Début du remplissage du formulaire (anti-robot).
  useEffect(() => {
    if (step === 'form') formOpenedAt.current = Date.now();
  }, [step]);

  const categories = useMemo(() => ['Tout', ...new Set(CATALOG.map((a) => a.category))], []);
  const visible = cat === 'Tout' ? CATALOG : CATALOG.filter((a) => a.category === cat);

  // Les prix viennent uniquement du fichier JSON, jamais du formulaire.
  const items = CATALOG.filter((a) => cart[a.id] && a.available !== false).map((a) => ({
    ...a,
    qty: cart[a.id],
  }));
  const count = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);

  const change = (id, delta) =>
    setCart((c) => {
      const article = BY_ID.get(String(id));
      if (!article || article.available === false) return c;
      const current = c[id] || 0;
      if (current === 0 && delta > 0 && Object.keys(c).length >= MAX_LINES) return c;
      const next = Math.min(current + delta, MAX_QTY);
      const copy = { ...c };
      if (next <= 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  const openDrawer = () => {
    setStep((s) => (s === 'done' ? 'cart' : s));
    setOpen(true);
  };

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setMode = (mode) =>
    setForm((f) => ({ ...f, mode, payWhen: mode === 'retrait' ? 'boutique' : 'livraison', payMethod: '' }));
  const setPayWhen = (payWhen) => setForm((f) => ({ ...f, payWhen, payMethod: '' }));

  const payWhenOptions =
    form.mode === 'retrait'
      ? [
          ['boutique', 'Payer en boutique'],
          ['avant', 'Payer avant (Mobile Money)'],
        ]
      : [
          ['livraison', 'Payer à la livraison'],
          ['avant', 'Payer avant la livraison'],
        ];
  const methods =
    form.payWhen === 'avant' ? boutique.paymentMethods.filter((m) => m !== 'Espèces') : boutique.paymentMethods;
  const amountNum = Number(onlyDigits(form.amount)) || 0;

  const validate = () => {
    const e = {};
    if (!items.length) e.cart = 'Votre panier est vide.';
    if (!MODES.includes(form.mode) || !RIDERS.includes(form.rider) || !payWhenOptions.some(([v]) => v === form.payWhen))
      e.cart = 'Formulaire invalide. Rechargez la page et réessayez.';
    if (clean(form.name, 60).length < 2) e.name = 'Entrez votre nom.';
    if (!/^\d{10}$/.test(normalizePhone(form.phone))) e.phone = 'Entrez un numéro à 10 chiffres.';
    if (form.mode === 'livraison' && clean(form.address, 140).length < 3)
      e.address = 'Indiquez votre quartier ou adresse.';
    if (!methods.includes(form.payMethod)) e.payMethod = 'Choisissez un moyen de paiement.';
    if (!amountNum) e.amount = 'Indiquez le montant dont vous disposez.';
    return e;
  };

  const submit = (ev) => {
    ev.preventDefault();
    if (form.hp) return; // champ piège anti-robot : on ignore en silence

    if (!WA_OK) {
      setErrors({ cart: 'Commande indisponible pour le moment.' });
      return;
    }
    if (Date.now() - formOpenedAt.current < MIN_FILL_MS) {
      setErrors({ cart: 'Vérifiez vos informations puis renvoyez la facture.' });
      return;
    }
    if (Date.now() - readLastSent() < COOLDOWN_MS) {
      setErrors({ cart: 'Patientez quelques secondes avant un nouvel envoi.' });
      return;
    }

    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const num = orderNumber();
    const date = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const name = clean(form.name, 60);
    const phone = normalizePhone(form.phone);
    const note = clean(form.note, 200);
    const payWhenLabel = payWhenOptions.find(([v]) => v === form.payWhen)?.[1];

    const delivery =
      form.mode === 'livraison'
        ? [
            '*Mode* : Livraison',
            `*Adresse* : ${clean(form.address, 140)}`,
            form.rider === 'boutique'
              ? '*Livreur* : Livreur de la boutique (frais à confirmer)'
              : '*Livreur* : Yango (frais de course en plus, à ma charge)',
          ]
        : ['*Mode* : Retrait en boutique'];

    const msg = [
      `🧾 *FACTURE ${num}*`,
      `${boutique.name} | ${date}`,
      '',
      `*Client* : ${name}`,
      `*Téléphone* : +225 ${phone}`,
      ...delivery,
      '',
      ...items.map((i) => `• ${clean(i.name, 80)} x${i.qty} = ${fcfa(i.qty * i.price)}`),
      '',
      `*TOTAL ARTICLES : ${fcfa(total)}*`,
      form.mode === 'livraison' ? '_Frais de livraison non inclus, à confirmer._' : '',
      '',
      `*Paiement* : ${payWhenLabel}`,
      `*Moyen* : ${form.payMethod}`,
      `*Montant disponible* : ${fcfa(amountNum)}`,
      note ? `\n*Remarque* : ${note}` : '',
      '',
      'Merci de confirmer ma commande 🙏',
    ].join('\n');

    const url = waUrl(msg);
    if (url.length > MAX_URL_LEN) {
      setErrors({ cart: 'Commande trop longue. Réduisez le nombre d’articles ou la remarque.' });
      return;
    }

    writeLastSent(Date.now());
    setDone({ num, msg, url });
    setCart({});
    setForm(INITIAL);
    setErrors({});
    setStep('done');

    // Ouverture automatique ; si elle est bloquée, le bouton « Ouvrir WhatsApp » prend le relais.
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {}
  };

  const copyInvoice = async () => {
    if (!done) return;
    try {
      await navigator.clipboard.writeText(done.msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const helloUrl = WA_OK ? waUrl(`Bonjour ${clean(boutique.name, 60)}, je souhaite des informations.`) : null;

  return (
    <div className={styles.page}>
      {/* ---------- En-tête fixe ---------- */}
      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerRow}`}>
          <a href="#accueil" className={styles.brand} aria-label={`${boutique.name}, accueil`}>
            <Image
              src="/LogoMain.png"
              alt={`Logo ${boutique.name}`}
              width={180}
              height={72}
              priority
              className={styles.logo}
              style={{ width: 'auto', height: '46px' }}
            />
          </a>
          <nav className={styles.nav} aria-label="Navigation principale">
            <a href="#catalogue">Collection</a>
            <a href="#atouts">Nos atouts</a>
            <a href="#contact">Contact</a>
          </nav>
          <button className={styles.cartBtn} onClick={openDrawer} aria-label={`Ouvrir le panier, ${count} article(s)`}>
            <FaBagShopping aria-hidden="true" />
            <span>Panier</span>
            {count > 0 && <b className={styles.badge}>{count}</b>}
          </button>
        </div>
      </header>

      {/* ---------- Accueil ---------- */}
      <section className={styles.hero} id="accueil">
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>
              <FaHeart aria-hidden="true" /> Boutique de mode à Attoban, Abidjan
            </p>
            <h1>
              {boutique.name}, <em>{boutique.slogan}</em>
            </h1>
            <p className={styles.lead}>
              Robes, ensembles pagne, robes de fêtes, vêtements pour enfants et tenues scolaires.
              Choisissez, commandez sur WhatsApp et soyez livrée à Abidjan.
            </p>
            {helloUrl && (
              <a className={styles.ctaGhost} href={helloUrl} target="_blank" rel="noopener noreferrer">
                <FaWhatsapp aria-hidden="true" /> Nous écrire
              </a>
            )}
            <ul className={styles.pills}>
              <li>
                <FaTruckFast aria-hidden="true" /> Livraison à Abidjan
              </li>
              <li>
                <FaScissors aria-hidden="true" /> Finitions soignées
              </li>
              <li>
                <FaShieldHalved aria-hidden="true" /> Commande sécurisée
              </li>
            </ul>
          </div>
          <div className={styles.heroCard} aria-hidden="true">
            <Image
              src="/LogoMain.png"
              alt=""
              width={600}
              height={400}
              loading="eager"
              style={{ width: '100%', height: 'auto' }}
            />
          </div>
        </div>
      </section>

      {/* ---------- Catalogue ---------- */}
      <main className={styles.container} id="catalogue">
        <h2 className={styles.sectionTitle}>Notre collection</h2>
        <p className={styles.sectionSub}>Touchez un article pour l’ajouter au panier, puis passez à la facture.</p>

        <div className={styles.chips} role="tablist" aria-label="Catégories">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={cat === c}
              className={cat === c ? styles.chipOn : styles.chip}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <ul className={styles.grid}>
          {visible.map((p) => {
            const qty = cart[p.id] || 0;
            const unavailable = p.available === false;
            const img = safeImage(p.image);
            return (
              <li key={p.id} className={styles.card}>
                <div className={styles.thumb}>
                  {img ? (
                    <Image
                      src={img}
                      alt={p.name}
                      fill
                      sizes="(max-width: 600px) 50vw, 280px"
                      className={styles.thumbImg}
                    />
                  ) : (
                    <span aria-hidden="true">{p.emoji}</span>
                  )}
                  {p.badge && !unavailable && <span className={styles.tag}>{p.badge}</span>}
                  {unavailable && <span className={styles.tagOff}>Indisponible</span>}
                </div>
                <div className={styles.cardBody}>
                  <p className={styles.catLabel}>{p.category}</p>
                  <h3>{p.name}</h3>
                  {p.description && <p className={styles.desc}>{p.description}</p>}
                  <p className={styles.price}>
                    {fcfa(p.price)}
                    {p.oldPrice && <s>{fcfa(p.oldPrice)}</s>}
                  </p>
                </div>
                {unavailable ? (
                  <button type="button" className={styles.addBtn} disabled>
                    Indisponible
                  </button>
                ) : qty === 0 ? (
                  <button type="button" className={styles.addBtn} onClick={() => change(p.id, 1)}>
                    <FaBagShopping aria-hidden="true" /> Ajouter au panier
                  </button>
                ) : (
                  <div className={styles.stepper}>
                    <button type="button" onClick={() => change(p.id, -1)} aria-label={`Retirer un ${p.name}`}>
                      <FaMinus />
                    </button>
                    <b>{qty}</b>
                    <button type="button" onClick={() => change(p.id, 1)} aria-label={`Ajouter un ${p.name}`}>
                      <FaPlus />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className={styles.delivery}>{boutique.delivery.note}</p>
      </main>

      {/* ---------- Atouts ---------- */}
      <section className={styles.perks} id="atouts" aria-labelledby="atouts-title">
        <div className={styles.container}>
          <h2 id="atouts-title" className={styles.sectionTitle}>
            Pourquoi choisir {boutique.name} ?
          </h2>
          <ul className={styles.perkGrid}>
            <li>
              <FaTruckFast aria-hidden="true" />
              <h3>Livré chez vous</h3>
              <p>Par notre livreur ou par Yango, partout à Abidjan.</p>
            </li>
            <li>
              <FaStore aria-hidden="true" />
              <h3>Paiement flexible</h3>
              <p>À la livraison, avant la livraison ou directement en boutique.</p>
            </li>
            <li>
              <FaHeart aria-hidden="true" />
              <h3>Pour toute la famille</h3>
              <p>Femmes, enfants, robes de fêtes et tenues scolaires.</p>
            </li>
          </ul>
        </div>
      </section>

      <Footer />

      {/* ---------- Barre panier fixe ---------- */}
      {count > 0 && !open && (
        <button type="button" className={styles.floatBar} onClick={openDrawer}>
          <span className={styles.floatCount}>{count}</span>
          <span className={styles.floatTxt}>Voir mon panier</span>
          <strong>{fcfa(total)}</strong>
        </button>
      )}

      {/* ---------- Panier / Facture ---------- */}
      {open && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div
            className={styles.drawer}
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Fermer">
              <FaXmark />
            </button>

            {step !== 'done' && (
              <ol className={styles.steps} aria-label="Étapes">
                <li className={styles.stepOn}>
                  <span>1</span> Panier
                </li>
                <li className={step === 'form' ? styles.stepOn : ''}>
                  <span>2</span> Facture
                </li>
                <li>
                  <span>3</span> WhatsApp
                </li>
              </ol>
            )}

            {/* Étape 1 : panier */}
            {step === 'cart' && (
              <div>
                <h2 id="drawer-title">Mon panier</h2>
                <ul className={styles.lines}>
                  {items.length === 0 && (
                    <li className={styles.empty}>Votre panier est vide. Choisissez un article dans la collection.</li>
                  )}
                  {items.map((i) => (
                    <li key={i.id}>
                      <span className={styles.lineName}>
                        {i.emoji} {i.name}
                      </span>
                      <div className={styles.qty}>
                        <button type="button" onClick={() => change(i.id, -1)} aria-label={`Retirer un ${i.name}`}>
                          <FaMinus />
                        </button>
                        <b>{i.qty}</b>
                        <button type="button" onClick={() => change(i.id, 1)} aria-label={`Ajouter un ${i.name}`}>
                          <FaPlus />
                        </button>
                      </div>
                      <em>{fcfa(i.qty * i.price)}</em>
                    </li>
                  ))}
                </ul>
                <p className={styles.total}>
                  Total articles <strong>{fcfa(total)}</strong>
                </p>
                <p className={styles.small}>Les frais de livraison éventuels s’ajoutent au total.</p>

                <button type="button" className={styles.secondary} onClick={() => setOpen(false)}>
                  <FaArrowLeft aria-hidden="true" /> Continuer mes achats
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!items.length}
                  onClick={() => {
                    setErrors({});
                    setStep('form');
                  }}
                >
                  Passer à la facture
                </button>
              </div>
            )}

            {/* Étape 2 : facture */}
            {step === 'form' && (
              <form onSubmit={submit} noValidate autoComplete="on">
                <button type="button" className={styles.back} onClick={() => setStep('cart')}>
                  <FaArrowLeft aria-hidden="true" /> Retour au panier
                </button>
                <h2 id="drawer-title">Ma facture</h2>

                <div className={styles.recap}>
                  <span>
                    {count} article{count > 1 ? 's' : ''}
                  </span>
                  <strong>{fcfa(total)}</strong>
                </div>
                {errors.cart && (
                  <p className={styles.err} role="alert">
                    {errors.cart}
                  </p>
                )}

                <label className={styles.field}>
                  Nom
                  <input
                    value={form.name}
                    onChange={setField('name')}
                    maxLength={60}
                    autoComplete="name"
                    placeholder="Votre nom"
                  />
                  {errors.name && <span className={styles.err}>{errors.name}</span>}
                </label>
                <label className={styles.field}>
                  Téléphone
                  <input
                    value={form.phone}
                    onChange={setField('phone')}
                    maxLength={20}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="07 00 00 00 00"
                  />
                  {errors.phone && <span className={styles.err}>{errors.phone}</span>}
                </label>

                <fieldset className={styles.group}>
                  <legend>Comment recevoir ma commande ?</legend>
                  <div className={styles.choices}>
                    <label className={styles.choice}>
                      <input
                        type="radio"
                        name="mode"
                        checked={form.mode === 'livraison'}
                        onChange={() => setMode('livraison')}
                      />
                      <FaTruckFast aria-hidden="true" /> Livraison
                    </label>
                    <label className={styles.choice}>
                      <input
                        type="radio"
                        name="mode"
                        checked={form.mode === 'retrait'}
                        onChange={() => setMode('retrait')}
                      />
                      <FaStore aria-hidden="true" /> En boutique
                    </label>
                  </div>
                </fieldset>

                {form.mode === 'livraison' && (
                  <>
                    <label className={styles.field}>
                      Adresse de livraison
                      <input
                        value={form.address}
                        onChange={setField('address')}
                        maxLength={140}
                        autoComplete="street-address"
                        placeholder="Quartier, rue, repère"
                      />
                      {errors.address && <span className={styles.err}>{errors.address}</span>}
                    </label>

                    <fieldset className={styles.group}>
                      <legend>Qui vous livre ?</legend>
                      <div className={styles.choices}>
                        <label className={styles.choice}>
                          <input
                            type="radio"
                            name="rider"
                            checked={form.rider === 'boutique'}
                            onChange={() => setForm((f) => ({ ...f, rider: 'boutique' }))}
                          />
                          Livreur de la boutique
                        </label>
                        <label className={styles.choice}>
                          <input
                            type="radio"
                            name="rider"
                            checked={form.rider === 'yango'}
                            onChange={() => setForm((f) => ({ ...f, rider: 'yango' }))}
                          />
                          Yango
                        </label>
                      </div>
                      <p className={form.rider === 'yango' ? styles.notice : styles.small}>
                        {form.rider === 'yango' && <FaCircleInfo aria-hidden="true" />}
                        {form.rider === 'yango' ? boutique.delivery.yango : boutique.delivery.shopRider}
                      </p>
                    </fieldset>
                  </>
                )}

                <fieldset className={styles.group}>
                  <legend>Quand voulez-vous payer ?</legend>
                  <div className={styles.choices}>
                    {payWhenOptions.map(([value, label]) => (
                      <label key={value} className={styles.choice}>
                        <input
                          type="radio"
                          name="payWhen"
                          checked={form.payWhen === value}
                          onChange={() => setPayWhen(value)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className={styles.group}>
                  <legend>Moyen de paiement</legend>
                  <div className={styles.choices}>
                    {methods.map((m) => (
                      <label key={m} className={styles.choice}>
                        <input
                          type="radio"
                          name="payMethod"
                          checked={form.payMethod === m}
                          onChange={() => setForm((f) => ({ ...f, payMethod: m }))}
                        />
                        {m}
                      </label>
                    ))}
                  </div>
                  {errors.payMethod && <span className={styles.err}>{errors.payMethod}</span>}
                </fieldset>

                <label className={styles.field}>
                  Montant dont vous disposez ({boutique.currency})
                  <input
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: onlyDigits(e.target.value).slice(0, 8) }))}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Ex : 20000"
                  />
                  {errors.amount && <span className={styles.err}>{errors.amount}</span>}
                  {amountNum > 0 && amountNum < total && (
                    <span className={styles.warn}>Ce montant est inférieur au total des articles ({fcfa(total)}).</span>
                  )}
                </label>

                <label className={styles.field}>
                  Remarque (facultatif)
                  <textarea
                    value={form.note}
                    onChange={setField('note')}
                    maxLength={200}
                    rows={2}
                    placeholder={boutique.notePlaceholder}
                  />
                </label>

                {/* Champ piège : invisible pour les humains, rempli par les robots */}
                <input
                  className={styles.trap}
                  tabIndex={-1}
                  autoComplete="new-password"
                  aria-hidden="true"
                  value={form.hp}
                  onChange={setField('hp')}
                  name="hp_field"
                />

                <button type="submit" className={styles.primary}>
                  <FaWhatsapp aria-hidden="true" /> Envoyer la facture sur WhatsApp
                </button>
              </form>
            )}

            {/* Étape 3 : terminé */}
            {step === 'done' && done && (
              <div className={styles.success}>
                <span className={styles.check}>
                  <FaCheck />
                </span>
                <h2 id="drawer-title">Facture {done.num} prête</h2>
                <p>
                  Appuyez sur le bouton ci-dessous pour ouvrir WhatsApp, puis sur Envoyer pour transmettre votre
                  facture à la boutique.
                </p>

                <a className={styles.primary} href={done.url} target="_blank" rel="noopener noreferrer">
                  <FaWhatsapp aria-hidden="true" /> Ouvrir WhatsApp
                </a>
                <button type="button" className={styles.secondary} onClick={copyInvoice}>
                  <FaCopy aria-hidden="true" /> {copied ? 'Copié' : 'Copier la facture'}
                </button>
                <button type="button" className={styles.secondary} onClick={() => setOpen(false)}>
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}