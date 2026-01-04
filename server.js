require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const twilio = require('twilio');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

/* ======================
   MIDDLEWARES
====================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.ADMIN_PASS, 
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PROD,
    httpOnly: true,
    maxAge: 1000 * 60 * 60
  }
}));

/* ======================
   RATE LIMIT (ANTI-SPAM)
====================== */
const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Demasiadas solicitudes. Intenta más tarde.'
});

/* ======================
   GOOGLE SHEETS
====================== */
const auth = new JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, auth);
let sheetLoaded = false;

async function loadSheet() {
  if (!sheetLoaded) {
    await doc.loadInfo();
    sheetLoaded = true;
    console.log('📊 Google Sheets cargado');
  }
}

async function saveLeadToSheet({ name, phone, email, note, status = 'NEW' }) {
  await loadSheet();
  const sheet = doc.sheetsByTitle['Leads'];
  if (!sheet) throw new Error("No existe la hoja 'Leads'");

  await sheet.addRow({
    Date: new Date().toLocaleString(),
    Name: name,
    Phone: phone,
    Email: email,
    Note: note,
    Status: status
  });
}

async function getLeads() {
  await loadSheet();
  const sheet = doc.sheetsByTitle['Leads'];
  return sheet.getRows();
}

async function updateLeadStatus(index, status) {
  await loadSheet();
  const sheet = doc.sheetsByTitle['Leads'];
  const rows = await sheet.getRows();
  if (!rows[index]) throw new Error('Lead no encontrado');
  rows[index].Status = status;
  await rows[index].save();
}

/* ======================
   VALIDACIÓN
====================== */
function validateLead({ name, phone, email }) {
  if (!name || name.length < 2) return 'Nombre inválido';
  if (!phone || phone.replace(/\D/g, '').length < 8) return 'Teléfono inválido';
  if (!email || !email.includes('@')) return 'Email inválido';
  return null;
}

/* ======================
   EMAIL
====================== */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ======================
   WHATSAPP (TWILIO)
====================== */
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

function normalizePhone(phone) {
  let clean = phone.replace(/\D/g, '');
  if (!clean.startsWith('34')) clean = '34' + clean;
  return clean;
}

async function sendWhatsAppLead({ name, phone, email, note }) {
  const mode = process.env.WHATSAPP_MODE || 'sandbox';

  const body = `
🔥 Nuevo lead - Nowas Gym

👤 Nombre: ${name}
📞 Teléfono: ${phone}
📧 Email: ${email}
📝 Nota: ${note || '-'}
  `;

  // 🔒 SANDBOX → SIEMPRE a tu número
  if (mode === 'sandbox') {
    const res = await twilioClient.messages.create({
      from: 'whatsapp:+14155238886',
      to: `whatsapp:${process.env.WHATSAPP_ADMIN}`,
      body
    });
    console.log('✅ WhatsApp enviado (sandbox):', res.sid);
    return;
  }

  // 🚀 PRODUCCIÓN → al cliente
  const toPhone = normalizePhone(phone);

  const res = await twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:+${toPhone}`,
    body
  });

  console.log('🚀 WhatsApp enviado al cliente:', res.sid);
}

/* ======================
   GOOGLE ADS CONVERSION
====================== */
async function sendGoogleAdsConversion() {
  try {
    const url = `https://www.googleadservices.com/pagead/conversion/${process.env.GOOGLE_ADS_CONVERSION_ID.replace('AW-', '')}/`;

    await axios.post(url, null, {
      params: {
        label: process.env.GOOGLE_ADS_CONVERSION_LABEL,
        value: 1.0,
        currency_code: 'EUR',
      },
    });

    console.log('📈 Conversión Google Ads enviada');
  } catch (err) {
    console.error('❌ Error Google Ads:', err.message);
  }
}

/* ======================
   STATIC
====================== */
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ======================
   SEND DEMO (CORE)
====================== */
app.post('/send-demo', leadLimiter, async (req, res) => {
  try {
    console.log('🔥 Lead recibido:', req.body);

    const error = validateLead(req.body);
    if (error) return res.status(400).json({ ok: false, error });

    await saveLeadToSheet(req.body);
    console.log('📊 Guardado en Sheets');

    await transporter.sendMail({
      from: `"Nowas Gym" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: 'Nuevo lead - Demo',
      text: `
Nombre: ${req.body.name}
Teléfono: ${req.body.phone}
Email: ${req.body.email}
Nota: ${req.body.note}
      `
    });
    console.log('📧 Email enviado');

    await sendWhatsAppLead(req.body);
    
    await sendGoogleAdsConversion();

    res.json({ ok: true });

  } catch (err) {
    console.error('❌ Error general:', err);
    res.status(500).json({ ok: false });
  }
});

/* ======================
   ADMIN
====================== */
function checkAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

app.get('/admin/login', (_, res) => {
  res.send(`
    <form method="POST">
      <input type="password" name="password" placeholder="Admin pass" />
      <button>Entrar</button>
    </form>
  `);
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASS) {
    req.session.isAdmin = true;
    res.redirect('/admin/dashboard');
  } else {
    res.send('❌ Incorrecto');
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin/dashboard', checkAdmin, async (_, res) => {
  const leads = await getLeads();

  let html = `
  <h1>Dashboard Nowas Gym</h1>
  <a href="/admin/logout">Salir</a>
  <table border="1">
    <tr>
      <th>Fecha</th><th>Nombre</th><th>Tel</th>
      <th>Email</th><th>Nota</th><th>Status</th>
    </tr>
  `;

  leads.forEach(l => {
    html += `
      <tr>
        <td>${l.Date}</td>
        <td>${l.Name}</td>
        <td>${l.Phone}</td>
        <td>${l.Email}</td>
        <td>${l.Note}</td>
        <td>${l.Status}</td>
      </tr>
    `;
  });

  html += '</table>';
  res.send(html);
});

/* ======================
   START
====================== */
app.listen(PORT, () => {
  console.log(`✅ Servidor activo en http://localhost:${PORT}`);
});
