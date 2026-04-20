/**
 * Конфигурация приложения
 * GAS_API — URL вашего Google Apps Script (Развёртывание → Веб-приложение)
 *
 * GEMINI_API_KEY здесь НЕ используется для ИИ при открытии сайта по http(s) —
 * запросы идут на /api/chat и /api/grade (локально: ключ из .env в папке с server.js;
 * на Vercel: переменная GEMINI_API_KEY в настройках проекта).
 */
window.CONFIG = {
  GAS_API: 'https://script.google.com/macros/s/AKfycbx7tfhmyJ1YwQRLXOOiFv-OWDtvPDCSRSiCX0fwAZu1JZSsWbSHkkDkUrdty2tahADmRg/exec',
  GEMINI_API_KEY: ''
};
