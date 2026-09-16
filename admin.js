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

/* ========== التشغيل ========== */
async function initApp() {
    renderStats();

    const s = Settings.load();
    $('#setPrice1').value = s.pricePart1 || 100;
    $('#p2Title').value = (s.part2 && s.part2.title) || 'موري — الجزء التاني';
    $('#p2Price').value = (s.part2 && s.part2.price) || 100;
    $('#p2Published').checked = !s.part2 || s.part2.published !== false;

    const refreshFront = wireFileBox({
        uploadBtn: $('#frontUploadBtn'), fileInput: $('#frontFile'),
        delBtn: $('#frontDel'), dlBtn: $('#frontDl'),
        preview: $('#frontPreview'), status: $('#frontStatus'),
        idbKey: 'cover_front', repoName: 'mory-cover.jpg', isImage: true
    });

    const refreshBack = wireFileBox({
        uploadBtn: $('#backUploadBtn'), fileInput: $('#backFile'),
        delBtn: $('#backDel'), dlBtn: $('#backDl'),
        preview: $('#backPreview'), status: $('#backStatus'),
        idbKey: 'cover_back', repoName: 'mory-back.jpg', isImage: true
    });

    const refreshP2 = wireFileBox({
        uploadBtn: $('#p2UploadBtn'), fileInput: $('#p2File'),
        delBtn: $('#p2Del'), dlBtn: $('#p2Dl'),
        preview: null, status: $('#p2PdfStatus'),
        idbKey: 'pdf_part2', repoName: 'mory2.pdf', isImage: false
    });

    await refreshFront();
    await refreshBack();
    await refreshP2();

    $('#saveSettings').addEventListener('click', () => {
        Settings.save({
            pricePart1: Number($('#setPrice1').value) || 100,
            part2: {
                title: $('#p2Title').value.trim() || 'موري — الجزء التاني',
                price: Number($('#p2Price').value) || 100,
                published: $('#p2Published').checked
            }
        });
        $('#saveMsg').textContent = 'اتحفظت! افتح الموقع من نفس المتصفح وهتلاقي التعديلات.';
        setTimeout(() => { $('#saveMsg').textContent = ''; }, 5000);
    });

    $('#resetSettings').addEventListener('click', () => {
        Settings.reset();
        location.reload();
    });
}

initGate();
