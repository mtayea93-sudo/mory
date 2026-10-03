/* موري — Service Worker: تخزين مؤقت للتصفح السريع والتشغيل أوفلاين */
const VERSION = 'mory-v1';
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/qrcode.min.js',
  '/settings.json',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/mory-cover.jpg',
  '/mory-hero.jpg',
  '/mory-back.jpg',
  '/mory2-cover.jpg',
  '/mory2-back.jpg',
  '/vodafone-qr.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // الإعدادات والأكواد: الشبكة أولاً وتحديث الكاش (عشان الأسعار واللينكات تفضل حديثة)
  if (url.pathname.endsWith('settings.json') || url.pathname.endsWith('sw.js')) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // PDFات الرواية: كاش أولاً (حجمها كبير ومش بتتغير)
  if (url.pathname.endsWith('.pdf')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // باقي الملفات: كاش أولاً ثم شبكة وتحديث الكاش
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    }).catch(() => {
      // طلبات التنقل أوفلاين → الصفحة الرئيسية
      if (req.mode === 'navigate') return caches.match('/index.html');
      return Response.error();
    }))
  );
});
