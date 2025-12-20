document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('demoForm');
  const formMsg = document.getElementById('formMsg');
  const modal = document.getElementById('modal');
  const modalMessage = document.getElementById('modalMessage');
  const modalActions = document.getElementById('modalActions');
  const loader = document.getElementById('loader');

  function showModal(message, showLoader = false, actionsHtml = '') {
    modal.setAttribute('aria-hidden', 'false');
    modalMessage.innerHTML = message;
    modalActions.innerHTML = actionsHtml;
    loader.hidden = !showLoader;
  }

  function hideModal() {
    modal.setAttribute('aria-hidden', 'true');
    modalMessage.innerHTML = '';
    modalActions.innerHTML = '';
    loader.hidden = true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      note: form.note.value.trim()
    };

    if (!data.name || !data.phone) {
      formMsg.textContent = 'Por favor completa nombre y teléfono.';
      return;
    }

    showModal('Enviando solicitud...<br>Te contactaremos pronto.', true);

    try {
      const res = await fetch('/send-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Error del servidor');
      }

      // Éxito: mostrar opciones - abrir WhatsApp o cerrar
      showModal('✔ Tu demo ha sido enviada correctamente!<br>¿Quieres abrir WhatsApp para continuar?', false,
        `<a class="btn" href="${json.whatsapp}" target="_blank">Abrir WhatsApp</a> <button class="btn" id="closeBtn">Cerrar</button>`);

      document.getElementById('closeBtn').addEventListener('click', () => {
        hideModal();
      });

      // Scroll up
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 150);
      form.reset();
      formMsg.textContent = '';

    } catch (err) {
      console.error('Envio error:', err);
      showModal('❌ Error al enviar la solicitud. Intenta de nuevo más tarde.', false,
        `<button class="btn" id="closeBtn2">Cerrar</button>`);
      document.getElementById('closeBtn2').addEventListener('click', () => hideModal());
    }
  });

  // quick ping to wake server (on page load)
  fetch(window.location.href).catch(() => {});
});
