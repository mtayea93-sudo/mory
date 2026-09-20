/* ==========================================================
   موري — رواية محمد طايع | التفاعل والدفع وقراءة الإعدادات
   ========================================================== */

// ========== الإعدادات ==========
// ملء القيم دي بتاعت Paymob من لوحة التحكم:
// Developers > API Keys + Payment Integrations
const CONFIG = {
    priceEgp: 100,                    // السعر الافتراضي للجزء الأول بالجنيه
    currency: 'EGP',
    whatsappNumber: '',               // بصيغة دولية بدون + مثال: '2010xxxxxxxx'
    siteUrl: 'https://mtayea.com',
    statsWebhook: '',                 // اختياري: رابط يستقبل أحداث الزيارات (مثل Google Apps Script)
    paymob: {
        apiKey: '',                   // من Paymob Dashboard > Developers > API Keys
        cardIntegrationId: '',        // Card Payments integration id
        walletIntegrationId: '',      // Vodafone Cash / Wallets integration id
        instapayIntegrationId: '',    // InstaPay integration id
        fawryIntegrationId: '',       // Fawry integration id
        iframeId: ''                  // اختياري: رقم الـ iframe للكارت
    }
};

const PAYMOB_BASE = 'https://accept.paymob.com/api';

// ========== أدوات مساعدة ============
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const Settings = {
    load() {
        try { return JSON.parse(localStorage.getItem('mory_settings') || '{}'); }
        catch (e) { return {}; }
    }
};

// دمج إعدادات GitHub (settings.json) مع إعدادات المتصفح المحلية — المحلي يغلب
async function loadSettings() {
    const local = Settings.load();
    let repo = {};
    try {
        const r = await fetch('settings.json', { cache: 'no-store' });
        if (r.ok) repo = await r.json();
    } catch (e) { /* مفيش ملف — عادي */ }
    return {
        ...repo, ...local,
        part2: { ...(repo.part2 || {}), ...(local.part2 || {}) },
        contact: { ...(repo.contact || {}), ...(local.contact || {}) },
        qr: { ...(repo.qr || {}), ...(local.qr || {}) }
    };
}

// تخزين الملفات (أغلفة و PDF) في قاعدة بيانات المتصفح
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
                    const tx = db.transaction('files', 'readonly');
                    const req = tx.objectStore('files').get(key);
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
            } catch (e) { /* لا شيء */ }
        }
    };
})();

// هل ملف موجود في مجلد الموقع على GitHub؟
async function headOk(path) {
    try {
        const r = await fetch(path, { method: 'HEAD' });
        return r.ok;
    } catch (e) { return false; }
}

// ========== تتبع الإحصائيات ============
function track(event) {
    try {
        const s = JSON.parse(localStorage.getItem('mory_stats') || '{"totals":{},"daily":{}}');
        const day = new Date().toISOString().slice(0, 10);
        s.totals[event] = (s.totals[event] || 0) + 1;
        s.daily[day] = s.daily[day] || {};
        s.daily[day][event] = (s.daily[day][event] || 0) + 1;
        localStorage.setItem('mory_stats', JSON.stringify(s));
    } catch (e) { /* لا شيء */ }

    if (CONFIG.statsWebhook) {
        fetch(CONFIG.statsWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, at: new Date().toISOString(), page: 'mory' })
        }).catch(() => { });
    }
}

function paymobReady() {
    return CONFIG.paymob.apiKey && CONFIG.paymob.apiKey.length > 10;
}

function integrationFor(method) {
    const p = CONFIG.paymob;
    switch (method) {
        case 'card': return p.cardIntegrationId;
        case 'vodafone': return p.walletIntegrationId;
        case 'instapay': return p.instapayIntegrationId;
        case 'fawry': return p.fawryIntegrationId;
        default: return '';
    }
}

// أصناف البيع (الجزء الأول + التاني من إعدادات اللوحة)
function getItems() {
    const s = Settings.load();
    return {
        part1: {
            id: 'part1',
            name: 'رواية موري — الجزء الأول',
            price: Number(s.pricePart1) || CONFIG.priceEgp
        },
        part2: {
            id: 'part2',
            name: s.part2 && s.part2.title ? s.part2.title : 'موري — الجزء التاني',
            price: Number(s.part2 && s.part2.price) || 100
        }
    };
}

// ========== حركة الكتاب مع التمرير ==========
(() => {
    const book = $('.hero-book');
    if (!book) return;
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const y = window.scrollY;
            if (y < window.innerHeight * 1.2) {
                book.style.transform = `translateY(${y * 0.08}px)`;
            }
            ticking = false;
        });
    }, { passive: true });
})();

// ========== الظهور عند التمرير ==========
(() => {
    const items = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
        items.forEach(el => el.classList.add('in'));
        return;
    }
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('in');
                io.unobserve(e.target);
            }
        });
    }, { threshold: 0.18 });
    items.forEach(el => io.observe(el));
})();

// ========== تطبيق إعدادات لوحة التحكم ============
let PART2_SOURCE = null; // 'idb' أو 'repo' — مصدر ملف الجزء التاني

// تأمين النصوص اللي بتتحط في الصفحة
function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// ========== معرض «من أجواء الرواية» ============
// لو المؤلف ضاف صور من لوحة التحكم بتبدل الصور الافتراضية
async function applyGallery(s) {
    const grid = $('#galleryGrid');
    if (!grid) return;
    const list = Array.isArray(s.gallery) ? s.gallery : [];
    if (!list.length) return; // مفيش صور مضافة — الصور الافتراضية في الـ HTML تفضل شغالة

    const frag = document.createDocumentFragment();
    let count = 0;
    for (const g of list) {
        if (!g || !g.id) continue;
        const blob = await Files.get('gallery_' + g.id);
        const src = blob ? URL.createObjectURL(blob)
            : (g.img && await headOk(g.img) ? g.img : null);
        if (!src) continue;
        const cap = (g.caption || '').trim();
        const fig = document.createElement('figure');
        fig.className = 'gallery-item';
        fig.innerHTML = `<img src="${src}" alt="${escapeHtml(cap || 'من أجواء الرواية')}" loading="lazy">` +
            (cap ? `<figcaption>${escapeHtml(cap)}</figcaption>` : '');
        frag.appendChild(fig);
        count++;
    }
    if (count) {
        grid.innerHTML = '';
        grid.appendChild(frag);
    }
}

async function applySettings() {
    const s = await loadSettings();
    const items = getItems();

    // سعر الجزء الأول
    $('#priceLabel').textContent = items.part1.price;

    // غلاف الموقع (خلفية الواجهة الأصلية)
    const heroCover = await Files.get('cover_hero');
    if (heroCover) $('#heroBgImg').src = URL.createObjectURL(heroCover);

    // غلاف الجزء الأول — الأمامي (مع دعم المفتاح القديم)
    const front1 = (await Files.get('cover_front1')) || (await Files.get('cover_front'));
    if (front1) {
        $('#heroCoverImg').src = URL.createObjectURL(front1);
        const buyFront = $('#buyFrontImg');
        if (buyFront) buyFront.src = URL.createObjectURL(front1);
        // لو مفيش غلاف موقع مخصص، الأجواء تاخد نفس الغلاف الأمامي
        if (!heroCover) {
            $('#heroBgImg').src = URL.createObjectURL(front1);
            const buyBg = $('#buyBgImg');
            if (buyBg) buyBg.src = URL.createObjectURL(front1);
        }
    }

    // غلاف الجزء الأول — الخلفي
    const back1 = (await Files.get('cover_back1')) || (await Files.get('cover_back'));
    const repoBack = back1 ? true : await headOk('mory-back.jpg');
    if (back1 || repoBack) {
        $('#backCoverWrap').hidden = false;
        $('#backCoverImg').src = back1 ? URL.createObjectURL(back1) : 'mory-back.jpg';
    }

    // الجزء التاني
    const published = !s.part2 || s.part2.published !== false;
    const idbPdf = await Files.get('pdf_part2');
    const repoPdf = idbPdf ? true : await headOk('mory2.pdf');
    if (published && (idbPdf || repoPdf)) {
        PART2_SOURCE = idbPdf ? 'idb' : 'repo';
        $('#part2Pending').hidden = true;
        $('#part2Live').hidden = false;
        $('#part2Title').textContent = items.part2.name;
        $('#part2PriceLabel').textContent = items.part2.price;

        // أغلفة الجزء التاني (أمامي وخلفي) — بنفس أسلوب الجزء الأول
        const front2 = await Files.get('cover_front2');
        const front2Src = front2 ? URL.createObjectURL(front2)
            : (await headOk('mory2-cover.jpg') ? 'mory2-cover.jpg' : null);
        if (front2Src) {
            $('#part2Covers').hidden = false;
            $('#p2FrontImg').src = front2Src;
            const p2bg = $('#p2BgImg');
            if (p2bg) p2bg.src = front2Src;
        }
        const back2 = await Files.get('cover_back2');
        const back2Src = back2 ? URL.createObjectURL(back2)
            : (await headOk('mory2-back.jpg') ? 'mory2-back.jpg' : null);
        if (back2Src) {
            $('#backCoverWrap2').hidden = false;
            $('#p2BackImg').src = back2Src;
        }
    } else {
        PART2_SOURCE = null;
        $('#part2Pending').hidden = false;
        $('#part2Live').hidden = true;
    }

    // صور معرض أجواء الرواية من اللوحة
    await applyGallery(s);
}

// ========== نافذة الدفع ============
const modal = $('#payModal');
let lastFocus = null;
let currentItem = null;

function openModal(item) {
    currentItem = item;
    $('#payTitle').textContent = 'إتمام الشراء';
    $('.modal-sub').textContent = `سيب بياناتك عشان نأكد الدفع ونبعتلك «${item.name}» — ${item.price} جنيه:`;
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#custName').focus();
}

function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
}

function setPayMsg(msg, ok = false) {
    const el = $('#payMsg');
    el.textContent = msg;
    el.classList.toggle('ok', ok);
}

function readCustomer() {
    const name = $('#custName').value.trim();
    const phone = $('#custPhone').value.trim();
    const email = $('#custEmail').value.trim() || 'customer@mory.com';
    if (!name) { setPayMsg('اكتب اسمك الأول.'); $('#custName').focus(); return null; }
    if (!/^01[0-9]{9}$/.test(phone)) { setPayMsg('اكتب رقم موبايل مصري صحيح (11 رقم يبدأ بـ 01).'); $('#custPhone').focus(); return null; }
    return { name, phone, email };
}

modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
});

// ========== فلو الدفع (Paymob) ============
$$('.method').forEach(btn => {
    btn.addEventListener('click', () => payWith(btn.dataset.method));
});

async function payWith(method) {
    $('#fawryBox').hidden = true;
    $('#qrBox').hidden = true;

    if (!currentItem) currentItem = getItems().part1;

    // الدفع بمسح كود مولّد تلقائياً من بيانات المحفظة — من غير Paymob
    if (method === 'qr') {
        const s = await loadSettings();
        const qrCfg = s.qr || {};
        const hasInsta = !!(qrCfg.instapay && qrCfg.instapay.trim());
        const hasVod = !!(qrCfg.vodafone && qrCfg.vodafone.trim());
        // احتياطي: صور أكواد مرفوعة يدوياً زي ما كان قبل كده
        const imgInsta = !hasInsta && ((await Files.get('qr_instapay')) || (await headOk('qr-instapay.jpg') ? 'qr-instapay.jpg' : null));
        const imgVod = !hasVod && ((await Files.get('qr_vodafone')) || (await headOk('qr-vodafone.jpg') ? 'qr-vodafone.jpg' : null));
        if (!hasInsta && !hasVod && !imgInsta && !imgVod) {
            setPayMsg('بيانات التحويل لسه بتتجهز في لوحة التحكم. اطلب نسختك من واتساب وهنرتب معاك الدفع يدوياً.');
            return;
        }
        qrState.instapay = hasInsta ? { text: qrCfg.instapay.trim() } : (imgInsta ? { img: imgInsta } : null);
        qrState.vodafone = hasVod ? { text: qrCfg.vodafone.trim() } : (imgVod ? { img: imgVod } : null);

        $('#qrAmount').textContent = currentItem.price;
        const pickInsta = $('#qrPickInstapay');
        const pickVod = $('#qrPickVodafone');
        if (pickInsta) pickInsta.hidden = !qrState.instapay;
        if (pickVod) pickVod.hidden = !qrState.vodafone;
        $('#qrShow').hidden = true;
        $('#qrPick').hidden = false;
        $('#qrBox').hidden = false;
        setPayMsg('اختار طريقة التحويل وامسح الكود.', true);
        return;
    }

    if (!paymobReady()) {
        setPayMsg('الدفع الإلكتروني لسه في مرحلة التفعيل. جرّب «مسح كود تحويل مباشر» أو اطلب من واتساب.');
        return;
    }

    const customer = readCustomer();
    if (!customer) return;

    const integrationId = integrationFor(method);
    if (!integrationId) {
        setPayMsg('طريقة الدفع دي لسه مش متفعّلة — جرب طريقة تانية أو كلمنا واتساب.');
        return;
    }

    track('pay_attempt');
    setPayMsg('جاري تجهيز الدفع…', true);
    const amountCents = currentItem.price * 100;

    try {
        // الخطوة 1: توكن التصريح
        const authRes = await fetch(`${PAYMOB_BASE}/auth/tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: CONFIG.paymob.apiKey })
        });
        const authData = await authRes.json();
        if (!authData.token) throw new Error('auth failed');

        // الخطوة 2: إنشاء الأوردر
        const orderRes = await fetch(`${PAYMOB_BASE}/ecommerce/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auth_token: authData.token,
                delivery_needed: false,
                amount_cents: amountCents,
                currency: CONFIG.currency,
                items: [{
                    name: currentItem.name,
                    amount_cents: amountCents,
                    description: 'رواية موري PDF - محمد طايع',
                    quantity: 1
                }]
            })
        });
        const orderData = await orderRes.json();
        if (!orderData.id) throw new Error('order failed');

        // الخطوة 3: مفتاح الدفع
        const keyRes = await fetch(`${PAYMOB_BASE}/acceptance/payment_keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auth_token: authData.token,
                amount_cents: amountCents,
                expiration: 3600,
                order_id: orderData.id,
                currency: CONFIG.currency,
                integration_id: parseInt(integrationId, 10),
                billing_data: {
                    first_name: customer.name,
                    last_name: 'موري',
                    email: customer.email,
                    phone_number: customer.phone.replace(/^0/, '+20'),
                    apartment: 'NA', floor: 'NA', street: 'NA', building: 'NA',
                    city: 'Cairo', state: 'NA', country: 'EG',
                    postal_code: 'NA', shipping_method: 'NA'
                }
            })
        });
        const keyData = await keyRes.json();
        if (!keyData.token) throw new Error('payment key failed: ' + JSON.stringify(keyData));

        // تسجيل الجزء المقصود عشان نعرض زرار التحميل الصح بعد الرجوع
        try { localStorage.setItem('mory_pending_item', currentItem.id); } catch (e) { }

        // الخطوة 4: التوجيه حسب الطريقة
        if (method === 'card' && CONFIG.paymob.iframeId) {
            window.location.href = `${PAYMOB_BASE}/acceptance/iframes/${CONFIG.paymob.iframeId}?payment_token=${keyData.token}`;
        } else if (method === 'fawry') {
            const payRes = await fetch(`${PAYMOB_BASE}/acceptance/payments/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: { identifier: 'AGGREGATOR', subtype: 'AGGREGATOR' },
                    payment_token: keyData.token
                })
            });
            const payData = await payRes.json();
            const ref = payData && payData.data && (payData.data.bill_reference || payData.data.down_payment);
            if (ref) {
                $('#fawryCode').textContent = ref;
                $('#fawryBox').hidden = false;
                setPayMsg('اتسجل طلبك بنجاح.', true);
            } else {
                throw new Error('fawry reference missing');
            }
        } else {
            window.location.href = `${PAYMOB_BASE}/acceptance/payments/pay?token=${keyData.token}`;
        }

    } catch (err) {
        console.error('Payment error:', err);
        setPayMsg('حصل خطأ في تجهيز الدفع. جرب تاني أو كلمنا على واتساب.');
    }
}

// ========== الرجوع بعد الدفع الناجح ==========
// ملحوظة: عشان الرجوع يشتغل لازم تتحط قيمة
// Redirect URL في إعدادات الـ integration في Paymob = رابط الصفحة دي
async function handlePaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const txnCode = params.get('txn_response_code');

    if (success !== 'true' && success !== '1' && txnCode !== 'APPROVED') return;

    track('purchase');

    let itemId = 'part1';
    try { itemId = localStorage.getItem('mory_pending_item') || 'part1'; } catch (e) { }

    if (itemId === 'part2') {
        const banner = $('#downloadSection2');
        banner.hidden = false;
        const link = $('#dlPart2');
        const blob = await Files.get('pdf_part2');
        if (blob) link.href = URL.createObjectURL(blob);
        else link.href = 'mory2.pdf';
        const btn = $('#buyPart2Btn');
        if (btn) btn.style.display = 'none';
        setTimeout(() => banner.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
    } else {
        $('#downloadSection').hidden = false;
        $('#buyBtn').style.display = 'none';
        setTimeout(() => $('#downloadSection').scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
    }
}

// ========== أكواد QR والتواصل ============
let qrState = { instapay: null, vodafone: null }; // {text} مولّد أو {img} مرفوع

function showQrMethod(method) {
    const st = qrState[method];
    if (!st) return;
    $('#qrShowMethod').textContent = method === 'instapay' ? 'إنستا باي' : 'فودافون كاش';
    const canvas = $('#qrCanvas');
    canvas.innerHTML = '';
    if (st.img) {
        const img = document.createElement('img');
        img.src = st.img instanceof Blob ? URL.createObjectURL(st.img) : st.img;
        img.alt = 'كود التحويل';
        img.style.width = '168px';
        img.style.height = '168px';
        canvas.appendChild(img);
        $('#qrRaw').textContent = '';
    } else if (st.text && window.QRCode) {
        new QRCode(canvas, { text: st.text, width: 168, height: 168, correctLevel: QRCode.CorrectLevel.M });
        $('#qrRaw').textContent = st.text;
    } else {
        $('#qrRaw').textContent = st.text || '';
    }
    $('#qrPick').hidden = true;
    $('#qrShow').hidden = false;
}

function wireQr() {
    const pickInsta = $('#qrPickInstapay');
    const pickVod = $('#qrPickVodafone');
    if (pickInsta) pickInsta.addEventListener('click', () => showQrMethod('instapay'));
    if (pickVod) pickVod.addEventListener('click', () => showQrMethod('vodafone'));
    const back = $('#qrBackBtn');
    if (back) back.addEventListener('click', () => {
        $('#qrShow').hidden = true;
        $('#qrPick').hidden = false;
    });
    const btn = $('#qrConfirmBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        track('qr_confirm');
        const item = currentItem || getItems().part1;
        const methodName = $('#qrShowMethod').textContent || 'التحويل';
        const wa = CONFIG.whatsappNumber;
        if (wa) {
            const msg = `أنا حوّلت مبلغ ${item.price} جنيه عن «${item.name}» عن طريق ${methodName}. الاسم: ${$('#custName').value.trim() || '—'} — ده إشعار التحويل:`;
            window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
        } else {
            setPayMsg('احتفظ بإشعار التحويل — هيتم التواصل معاك لتأكيد وإرسال الرواية.');
        }
    });
}

// أيقونات التواصل في الفوتر — بتتملي من لوحة التحكم
function applySocial(s) {
    const c = s.contact || {};
    const map = [
        ['#socialWhatsapp', c.whatsapp ? `https://wa.me/${c.whatsapp.replace(/^\+/, '')}` : ''],
        ['#socialFacebook', c.facebook || ''],
        ['#socialEmail', c.email ? `mailto:${c.email}` : ''],
        ['#socialPhone', c.phone ? `tel:${c.phone}` : '']
    ];
    let any = false;
    for (const [id, href] of map) {
        const el = $(id);
        if (!el) continue;
        if (href) { el.href = href; el.hidden = false; any = true; }
        else el.hidden = true;
    }
    const row = $('#socialRow');
    if (row) row.hidden = !any;
    // رقم الواتساب الأساسي للطلبات
    if (c.whatsapp) CONFIG.whatsappNumber = c.whatsapp.replace(/^\+/, '');
}

// سلايدر المقتبسات
function initQuoteSlider() {
    const slides = $$('.quote-slide');
    const dots = $$('.quote-dot');
    if (!slides.length) return;
    let cur = 0, timer = null;
    const show = (i) => {
        slides[cur].classList.remove('active');
        dots[cur] && dots[cur].classList.remove('active');
        cur = i;
        slides[cur].classList.add('active');
        dots[cur] && dots[cur].classList.add('active');
    };
    const auto = () => { timer = setInterval(() => show((cur + 1) % slides.length), 4500); };
    dots.forEach(d => d.addEventListener('click', () => {
        clearInterval(timer);
        show(Number(d.dataset.slide));
        auto();
    }));
    auto();
}

// فتح وقفل الفصل المجاني
function initChapterToggle() {
    const btn = $('#chapterToggle');
    const text = $('#chapterText');
    const fade = $('#paperFade');
    if (!btn || !text) return;
    btn.addEventListener('click', () => {
        const collapsed = text.classList.toggle('collapsed');
        if (fade) fade.classList.toggle('hidden-fade', !collapsed);
        btn.textContent = collapsed ? 'اقرأ الفصل الأول كامل' : 'اقفل الفصل';
        if (!collapsed) track('chapter_expand');
    });
}

// ========== واتساب ============
function wireWhatsapp(linkId, itemName) {
    const link = $(linkId);
    if (!link) return;
    if (!CONFIG.whatsappNumber) {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            alert('رقم الواتساب هيتضيف قريب — تابع صفحتنا على فيسبوك لحد ما نفعّل التواصل المباشر.');
        });
        return;
    }
    link.href = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent('أريد شراء ' + itemName)}`;
    link.target = '_blank';
    link.rel = 'noopener';
}

// ========== استمارة الجزء التاني (قبل النشر) ============
function wireNotifyForm() {
    const form = $('#notifyForm');
    if (!form) return;
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#notifyName').value.trim();
        const phone = $('#notifyPhone').value.trim();
        const msg = $('#notifyMsg');

        if (!name) { msg.textContent = 'اكتب اسمك الأول.'; msg.classList.add('error'); return; }
        if (!/^01[0-9]{9}$/.test(phone)) { msg.textContent = 'اكتب رقم واتساب صحيح (11 رقم يبدأ بـ 01).'; msg.classList.add('error'); return; }

        const list = JSON.parse(localStorage.getItem('mory_notify') || '[]');
        list.push({ name, phone, at: new Date().toISOString() });
        localStorage.setItem('mory_notify', JSON.stringify(list));

        msg.classList.remove('error');
        msg.textContent = 'تم التسجيل! هنبعتلك إشعار أول ما الجزء التاني ينزل.';
        e.target.reset();
    });
}

// ========== المشاركة ============
function shareOn(network) {
    const url = encodeURIComponent(CONFIG.siteUrl);
    const text = encodeURIComponent('اقرأ رواية «موري» لـ محمد طايع — اقرأ الفصل الأول مجاناً!');
    const links = {
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`,
        twitter: `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
        whatsapp: `https://wa.me/?text=${text}%20${url}`
    };
    window.open(links[network], '_blank', 'width=640,height=520');
}

// ========== التشغيل ============
(async function init() {
    track('visit');
    $('#year').textContent = new Date().getFullYear();

    await applySettings();
    applySocial(await loadSettings());
    await handlePaymentReturn();

    initQuoteSlider();
    initChapterToggle();
    wireQr();

    const items = getItems();
    $('#buyBtn').addEventListener('click', () => { track('buy_open'); openModal(items.part1); });
    const buy2 = $('#buyPart2Btn');
    if (buy2) buy2.addEventListener('click', () => { track('buy_open'); openModal(items.part2); });

    // تتبع فتح الفصل المجاني للقراءة
    if ('IntersectionObserver' in window && $('#preview')) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) { track('preview_view'); io.disconnect(); }
            });
        }, { threshold: 0.35 });
        io.observe($('#preview'));
    }

    wireNotifyForm();
    wireWhatsapp('#whatsappOrder', 'رواية موري PDF');
    wireWhatsapp('#whatsappOrder2', 'الجزء التاني من رواية موري');

    $$('.share-link').forEach(btn => {
        btn.addEventListener('click', () => shareOn(btn.dataset.share));
    });
})();
