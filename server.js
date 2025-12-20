require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const path = require("path");

const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
// ruta raíz
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ================= GOOGLE SHEETS ================= */
async function saveLeadToSheet({ name, phone, email, note }) {
  const auth = new JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const doc = new GoogleSpreadsheet(
    process.env.SPREADSHEET_ID,
    auth
  );

  await doc.loadInfo();

  console.log("Hojas encontradas:", Object.keys(doc.sheetsByTitle));

  const sheet = doc.sheetsByTitle["Leads"];
  if (!sheet) throw new Error("No existe la hoja 'Leads'");

  await sheet.addRow({
    Fecha: new Date().toLocaleString(),
    Nombre: name,
    Teléfono: phone,
    Email: email || "",
    Nota: note || "",
  });

  console.log("✅ Lead guardado en Google Sheets");
}

/* ================= ENDPOINT ================= */
app.post("/send-demo", async (req, res) => {
  const { name, phone, email, note } = req.body;

  try {
    await saveLeadToSheet({ name, phone, email, note });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `Nueva demo - ${name}`,
      text: `
Nombre: ${name}
Teléfono: ${phone}
Email: ${email}
Nota: ${note}
      `,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ ok: false, error: "ERROR INTERNO" });
  }
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Servidor activo en puerto ${PORT}`)
);
