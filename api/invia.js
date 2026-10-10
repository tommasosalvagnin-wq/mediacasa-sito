// Riceve i moduli del sito e li inoltra per email all'agenzia.
// Configurazione (Vercel → Settings → Environment Variables):
//   SMTP_USER  casella che spedisce, es. info@mediacasaimmobiliare.com (obbligatoria)
//   SMTP_PASS  password di quella casella (obbligatoria)
//   MAIL_TO    destinatario, predefinito info@mediacasaimmobiliare.com
//   SMTP_HOST / SMTP_PORT  predefiniti authsmtp.securemail.pro / 465 (register.it)
import nodemailer from 'nodemailer';

const MODULI = {
  stima: {
    oggetto: 'Richiesta di stima',
    campi: [
      { nome: 'nome', etichetta: 'Nome e cognome', obbligatorio: true, max: 120 },
      { nome: 'telefono', etichetta: 'Telefono', obbligatorio: true, max: 40 },
      { nome: 'email', etichetta: 'Email', obbligatorio: true, max: 200 },
      { nome: 'tipo', etichetta: 'Tipo di immobile', obbligatorio: true, max: 80 },
      { nome: 'mq', etichetta: 'Superficie (m²)', obbligatorio: true, max: 10 },
      { nome: 'indirizzo', etichetta: 'Indirizzo / Zona', obbligatorio: true, max: 200 },
      { nome: 'note', etichetta: 'Note aggiuntive', obbligatorio: false, max: 3000 },
    ],
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, errore: 'Metodo non consentito' });
  }

  let dati = req.body;
  if (typeof dati === 'string') {
    try { dati = JSON.parse(dati); } catch { dati = null; }
  }
  if (!dati || typeof dati !== 'object') {
    return res.status(400).json({ ok: false, errore: 'Richiesta non valida' });
  }

  // Campo nascosto: lo compilano solo i bot. Rispondiamo "ok" senza inviare nulla.
  if (dati.sito_web) return res.status(200).json({ ok: true });

  const modulo = MODULI[dati.modulo];
  if (!modulo) return res.status(400).json({ ok: false, errore: 'Modulo sconosciuto' });

  const valori = {};
  for (const campo of modulo.campi) {
    const valore = typeof dati[campo.nome] === 'string' ? dati[campo.nome].trim() : '';
    if (campo.obbligatorio && !valore) {
      return res.status(400).json({ ok: false, errore: `Campo mancante: ${campo.etichetta}` });
    }
    if (valore.length > campo.max) {
      return res.status(400).json({ ok: false, errore: `Campo troppo lungo: ${campo.etichetta}` });
    }
    valori[campo.nome] = valore;
  }
  if (!EMAIL_RE.test(valori.email)) {
    return res.status(400).json({ ok: false, errore: 'Indirizzo email non valido' });
  }

  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) {
    console.error('SMTP_USER o SMTP_PASS non configurati su Vercel');
    return res.status(500).json({ ok: false, errore: 'Invio email non configurato' });
  }
  const porta = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'authsmtp.securemail.pro',
    port: porta,
    secure: porta === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const nomeMittente = valori.nome.replace(/[\r\n]+/g, ' ');
  const testo = modulo.campi
    .filter((campo) => valori[campo.nome])
    .map((campo) => `${campo.etichetta}: ${valori[campo.nome]}`)
    .join('\n');

  try {
    await transporter.sendMail({
      from: { name: 'Sito MediaCasa', address: SMTP_USER },
      to: process.env.MAIL_TO || 'info@mediacasaimmobiliare.com',
      replyTo: { name: nomeMittente, address: valori.email },
      subject: `${modulo.oggetto} — ${nomeMittente}`,
      text: `${testo}\n\n—\nInviato dal modulo "${modulo.oggetto}" su mediacasaimmobiliare.com.\nRispondi a questa email per scrivere direttamente al cliente.`,
    });
  } catch (err) {
    console.error('Invio email non riuscito:', err);
    return res.status(502).json({ ok: false, errore: 'Invio non riuscito' });
  }

  return res.status(200).json({ ok: true });
}
