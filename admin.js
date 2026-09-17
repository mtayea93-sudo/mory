/* ==========================================================
   موري — لوحة التحكم
   ملحوظة أمان: كلمة السر دي حماية عرض بسيطة لصفحة ثابتة.
   أي حد تقني يقدر يتخطاها — الحماية الحقيقية تحتاج سيرفر.
   غيّر الكلمة قبل ما تنشر الموقع.
   ========================================================== */

const ADMIN_PASSWORD = 'mory-2026'; // غيّرها من هنا

const $ = (s) => document.querySelector(s);

const Settings = {
    load() {
        try { return JSON.parse(localStorage.getItem('mory_settings') || '{}'); }
        catch (e) { return {}; }
    },
    save(s) { localStorage.setItem('mory_settings', JSON.stringify(s)); },
    reset() { localStorage.removeItem('mory_settings'); }
};

const Files = (() => {
    let dbPromise = null;
    function open() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const req = indexedDB.open('mory_files', 1);
                req.onupgradeneeded = () => req.result.createObjectStore('files');
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        return dbPromise;
    }
    return {
        async set(key, blob) {
            const db = await open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('files', 'readwrite');
                tx.objectStore('files').put(blob, key);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        },
        async get(key) {
            try {
                const db = await open();
                return new Promise((resolve) => {
                    const req = db.transaction('files', 'readonly').objectStore('files').get(key);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                });
            } catch (e) { return null; }
        },
        async del(key) {
            try {
                const db = await open();
                return new Promise((resolve) => {
                    const tx = db.transaction('files', 'readwrite');
                    tx.objectStore('files').delete(key);
                    tx.oncomplete = resolve;
                });
            } catch (e) { }
        }
    };
})();

/* ========== بوابة الدخول ========== */
function initGate() {
    const gate = $('#gate');
    const app = $('#app');

    if (sessionStorage.getItem('mory_admin_ok') === '1') {
        gate.hidden = true;
        app.hidden = false;
        initApp();
        return;
    }

    const tryLogin = () => {
        if ($('#gatePass').value === ADMIN_PASSWORD) {
            sessionStorage.setItem('mory_admin_ok', '1');
            gate.hidden = true;
            app.hidden = false;
            initApp();
        } else {
            $('#gateMsg').textContent = 'كلمة السر غلط، حاول تاني.';
            $('#gatePass').value = '';
            $('#gatePass').focus();
        }
    };

    $('#gateBtn').addEventListener('click', tryLogin);
    $('#gatePass').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryLogin();
    });
    $('#gatePass').focus();
}

$('#logoutBtn') && $('#logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('mory_admin_ok');
    location.reload();
});

/* ========== الإحصائيات ========== */
function renderStats() {
    let s;
    try { s = JSON.parse(localStorage.getItem('mory_stats') || '{"totals":{},"daily":{}}'); }
    catch (e) { s = { totals: {}, daily: {} }; }

    const t = s.totals || {};
    const visits = t.visit || 0;
    const purchases = t.purchase || 0;
    const rate = visits > 0 ? ((purchases / visits) * 100).toFixed(1) : '0.0';

    const boxes = [
        ['الزيارات', visits, ''],
        ['بدء قراءة الفصل', t.preview_view || 0, ''],
        ['فتح نافذة الشراء', t.buy_open || 0, ''],
        ['محاولات الدفع', t.pay_attempt || 0, ''],
        ['عمليات شراء ناجحة', purchases, ''],
        ['نسبة الشراء من الزيارات', rate + '%', '']
    ];

    $('#statsGrid').innerHTML = boxes.map(([name, num]) => `
        <div class="stat-box">
            <p class="stat-num">${num}</p>
            <p class="stat-name">${name}</p>
        </div>
    `).join('');

    // أعمدة آخر 14 يوم
    const bars = $('#bars');
    bars.innerHTML = '';
    const days = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
    }
    const maxVisits = Math.max(1, ...days.map(d => (s.daily && s.daily[d] && s.daily[d].visit) || 0));
    days.forEach(d => {
        const v = (s.daily && s.daily[d] && s.daily[d].visit) || 0;
        const col = document.createElement('div');
        col.className = 'bar-col';
        col.title = `${d}: ${v} زيارة`;
        col.innerHTML = `<div class="bar" style="height:${Math.max(3, (v / maxVisits) * 100)}%"></div>
                         <span class="bar-day">${d.slice(8)}</span>`;
        bars.appendChild(col);
    });
}

/* ========== إدارة الملفات (أغلفة + PDF) ========== */
function wireFileBox({ uploadBtn, fileInput, delBtn, dlBtn, preview, status, idbKey, repoName, isImage }) {
    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const f = fileInput.files[0];
        if (!f) return;
        if (isImage && f.size > 2 * 1024 * 1024) { status.textContent = 'الصورة كبيرة — لازم تكون أقل من 2MB.'; return; }
        if (!isImage && f.size > 30 * 1024 * 1024) { status.textContent = 'الملف كبير — لازم يكون أقل من 30MB.'; return; }
        await Files.set(idbKey, f);
        refresh();
    });

    delBtn.addEventListener('click', async () => {
        await Files.del(idbKey);
        refresh();
    });

    dlBtn.addEventListener('click', async () => {
        const blob = await Files.get(idbKey);
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = repoName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });

    async function refresh() {
        const blob = await Files.get(idbKey);
        if (blob) {
            const url = URL.createObjectURL(blob);
            if (isImage && preview) preview.src = url;
            status.textContent = `ملف مرفوع محلياً (${(blob.size / 1024 / 1024).toFixed(2)} MB) — بيظهر في متصفحك فوراً.`;
            dlBtn.hidden = false;
            delBtn.hidden = false;
        } else {
            if (isImage && preview) preview.src = idbKey === 'cover_front' ? 'mory-cover.jpg' : '';
            status.textContent = idbKey === 'cover_front'
                ? 'الملف الافتراضي: mory-cover.jpg'
                : 'مفيش ملف مرفوع';
            dlBtn.hidden = true;
            delBtn.hidden = true;
        }
    }
    return refresh;
}

/* ========== صناديق الأغلفة (ديناميكية) ========== */
const IMAGE_BOXES = [
    {
        key: 'cover_hero', repo: 'mory-hero.jpg', title: 'غلاف الموقع (خلفية الواجهة)',
        desc: 'الصورة اللي ورا عنوان الموقع — يفضل تكون عريضة 1920×1080 أو أكتر', wide: true
    },
    {
        key: 'cover_front1', repo: 'mory-cover.jpg', title: 'الجزء الأول — الغلاف الأمامي',
        desc: 'بيتعرض ككتاب في الواجهة الرئيسية', fallback: 'mory-cover.jpg'
    },
    {
        key: 'cover_back1', repo: 'mory-back.jpg', title: 'الجزء الأول — الغلاف الخلفي',
        desc: 'بيتعرض في قسم «النسخة الكاملة»'
    },
    {
        key: 'cover_front2', repo: 'mory2-cover.jpg', title: 'الجزء التاني — الغلاف الأمامي',
        desc: 'بيتعرض في قسم الجزء التاني لما يتنشر'
    },
    {
        key: 'cover_back2', repo: 'mory2-back.jpg', title: 'الجزء التاني — الغلاف الخلفي',
        desc: 'بيتعرض جنب الغلاف الأمامي'
    }
];

function buildImageBox(cfg, container) {
    const box = document.createElement('div');
    box.className = 'file-box';
    box.innerHTML = `
        <img class="box-preview${cfg.wide ? ' wide' : ''}" src="${cfg.fallback || ''}" alt="${cfg.title}">
        <div class="file-info">
            <p class="file-name">${cfg.title}</p>
            <p class="file-status">${cfg.desc}</p>
            <div class="file-actions">
                <button type="button" class="mini-btn up">رفع صورة</button>
                <input type="file" class="adm-file" accept="image/jpeg,image/png,image/webp">
                <button type="button" class="mini-btn dl" hidden>تنزيل للرفع على GitHub</button>
                <button type="button" class="mini-btn danger del" hidden>إلغاء الرفع المحلي</button>
            </div>
        </div>`;
    $(container || '#imageBoxes').appendChild(box);

    const preview = box.querySelector('.box-preview');
    const status = box.querySelector('.file-status');
    const fileInput = box.querySelector('input[type=file]');
    const upBtn = box.querySelector('.up');
    const dlBtn = box.querySelector('.dl');
    const delBtn = box.querySelector('.del');

    upBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const f = fileInput.files[0];
        if (!f) return;
        if (f.size > 2 * 1024 * 1024) { status.textContent = 'الصورة كبيرة — لازم تكون أقل من 2MB.'; return; }
        await Files.set(cfg.key, f);
        refresh();
    });

    delBtn.addEventListener('click', async () => {
        await Files.del(cfg.key);
        refresh();
    });

    dlBtn.addEventListener('click', async () => {
        const blob = await Files.get(cfg.key);
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = cfg.repo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });

    async function refresh() {
        const blob = await Files.get(cfg.key);
        if (blob) {
            preview.src = URL.createObjectURL(blob);
            status.textContent = `صورة مرفوعة محلياً (${(blob.size / 1024).toFixed(0)} KB) — بيظهر في متصفحك فوراً.`;
            dlBtn.hidden = false;
            delBtn.hidden = false;
        } else {
            preview.src = cfg.fallback || '';
            preview.style.visibility = cfg.fallback ? 'visible' : 'hidden';
            status.textContent = cfg.desc;
            dlBtn.hidden = true;
            delBtn.hidden = true;
        }
    }
    return refresh;
}

/* ========== التشغيل ========== */
async function initApp() {
    renderStats();

    const s = Settings.load();
    $('#setPrice1').value = s.pricePart1 || 100;
    $('#p2Title').value = (s.part2 && s.part2.title) || 'موري — الجزء التاني';
    $('#p2Price').value = (s.part2 && s.part2.price) || 100;
    $('#p2Published').checked = !s.part2 || s.part2.published !== false;

    const c = s.contact || {};
    $('#ctWhatsapp').value = c.whatsapp || '';
    $('#ctFacebook').value = c.facebook || '';
    $('#ctEmail').value = c.email || '';
    $('#ctPhone').value = c.phone || '';

    const q = s.qr || {};
    $('#qrInstapay').value = q.instapay || '';
    $('#qrVodafone').value = q.vodafone || '';

    const refreshers = IMAGE_BOXES.map(cfg => buildImageBox(cfg));

    const refreshP2 = wireFileBox({
        uploadBtn: $('#p2UploadBtn'), fileInput: $('#p2File'),
        delBtn: $('#p2Del'), dlBtn: $('#p2Dl'),
        preview: null, status: $('#p2PdfStatus'),
        idbKey: 'pdf_part2', repoName: 'mory2.pdf', isImage: false
    });
    refreshers.push(refreshP2);

    for (const r of refreshers) await r();

    $('#saveSettings').addEventListener('click', () => {
        Settings.save({
            pricePart1: Number($('#setPrice1').value) || 100,
            part2: {
                title: $('#p2Title').value.trim() || 'موري — الجزء التاني',
                price: Number($('#p2Price').value) || 100,
                published: $('#p2Published').checked
            },
            contact: {
                whatsapp: $('#ctWhatsapp').value.trim(),
                facebook: $('#ctFacebook').value.trim(),
                email: $('#ctEmail').value.trim(),
                phone: $('#ctPhone').value.trim()
            },
            qr: {
                instapay: $('#qrInstapay').value.trim(),
                vodafone: $('#qrVodafone').value.trim()
            }
        });
        $('#saveMsg').textContent = 'اتحفظت! افتح الموقع من نفس المتصفح وهتلاقي التعديلات.';
        setTimeout(() => { $('#saveMsg').textContent = ''; }, 5000);
    });

    $('#dlSettings').addEventListener('click', () => {
        const cur = Settings.load();
        const data = {
            pricePart1: Number($('#setPrice1').value) || 100,
            part2: {
                title: $('#p2Title').value.trim() || 'موري — الجزء التاني',
                price: Number($('#p2Price').value) || 100,
                published: $('#p2Published').checked
            },
            contact: {
                whatsapp: $('#ctWhatsapp').value.trim(),
                facebook: $('#ctFacebook').value.trim(),
                email: $('#ctEmail').value.trim(),
                phone: $('#ctPhone').value.trim()
            },
            qr: {
                instapay: $('#qrInstapay').value.trim(),
                vodafone: $('#qrVodafone').value.trim()
            }
        };
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = 'settings.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        $('#saveMsg').textContent = 'اتنزّل ملف settings.json — ارفعه على GitHub بنفس الاسم عشان يظهر لكل الزوار.';
        setTimeout(() => { $('#saveMsg').textContent = ''; }, 7000);
    });

    $('#resetSettings').addEventListener('click', () => {
        Settings.reset();
        location.reload();
    });
}

initGate();
