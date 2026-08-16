// ================================================================
//  public/share-target-sw.js — приймає файл, який «розшарили» в додаток.
//
//  Виконавець кидає рахунок у месенджер → «Поділитися» → ERP.
//  Система шле POST на /share-target із файлом у формі. Сторінка сама
//  такий POST прочитати не може, тому його перехоплює сервіс-воркер:
//  кладе файл у Cache Storage і перекидає на /?share=1, а вже додаток
//  дістає його звідти й показує форму нового рахунка.
//
//  Файл підключається до згенерованого workbox-воркера через
//  importScripts — власний обробник fetch працює поруч із його
//  маршрутами (ті слухають лише GET).
// ================================================================

const SHARE_CACHE = 'erp-shared-files';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return;

  event.respondWith((async () => {
    try {
      const form = await event.request.formData();
      const files = form.getAll('file').filter(f => f && f.size);
      const cache = await caches.open(SHARE_CACHE);

      // Старе прибираємо — щоб не показати позавчорашній рахунок
      for (const key of await cache.keys()) await cache.delete(key);

      let n = 0;
      for (const file of files) {
        await cache.put(`/shared/${n}`, new Response(file, {
          headers: {
            'content-type': file.type || 'application/octet-stream',
            'x-file-name': encodeURIComponent(file.name || `рахунок-${n}`),
          },
        }));
        n++;
      }
      const text = String(form.get('text') || form.get('title') || '');
      if (text) {
        await cache.put('/shared/text', new Response(text, {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }));
      }
      return Response.redirect(`/?share=${n}`, 303);
    } catch (e) {
      return Response.redirect('/?share=0', 303);
    }
  })());
});
