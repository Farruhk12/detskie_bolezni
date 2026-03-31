/**
 * Конфигурация приложения
 * GAS_API — URL вашего Google Apps Script (Развёртывание → Веб-приложение)
 * GEMINI_API_KEY — опционально: ключ из Google AI Studio. Если указан — ИИ работает без GAS и без сервера.
 */
window.CONFIG = {
  GAS_API: 'https://script.google.com/macros/s/AKfycbx7tfhmyJ1YwQRLXOOiFv-OWDtvPDCSRSiCX0fwAZu1JZSsWbSHkkDkUrdty2tahADmRg/exec',
  GEMINI_API_KEY: ''  // Вставьте ключ из aistudio.google.com/apikey — ИИ работает без сервера и GAS
};
