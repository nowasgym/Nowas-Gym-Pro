console.log("🟢 INICIO SCRIPT");

const axios = require("axios");

axios.post(
  "https://nowas-gym-pro-p9q1.onrender.com/send-demo",
  {
    name: "TEST FINAL NOWAS",
    phone: "600000000",
    email: "test@nowasgym.com",
    note: "Prueba definitiva backend Render"
  },
  {
    timeout: 60000 // ⏱ 60 segundos (Render free)
  }
)
.then(res => {
  console.log("✅ RESPUESTA DEL SERVIDOR:");
  console.log(res.data);
})
.catch(err => {
  console.error("❌ ERROR:");
  if (err.response) {
    console.error("Status:", err.response.status);
    console.error("Data:", err.response.data);
  } else {
    console.error(err.message);
  }
});
