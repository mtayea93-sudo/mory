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

// ========== باراللاكس الواجهة ==========
(() => {
    const bg = $('#heroBg');
    if (!bg) return;
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const y = window.scrollY;
            if (y < window.innerHeight * 1.2) {
                bg.style.transform = `translateY(${y * 0.28}px)`;
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

async function applySettings() {
    const s = Settings.load();
    const items = getItems();

    // سعر الجزء الأول
    $('#priceLabel').textContent = items.part1.price;

    // الغلاف الأمامي: المرفوع من اللوحة أولاً، وإلا ملف الموقع
    const front = await Files.get('cover_front');
    if (front) $('#heroCoverImg').src = URL.createObjectURL(front);

    // الغلاف الخلفي
    const back = await Files.get('cover_back');
    const repoBack = back ? true : await headOk('mory-back.jpg');
    if (back || repoBack) {
        $('#backCoverWrap').hidden = false;
        $('#backCoverImg').src = back ? URL.createObjectURL(back) : 'mory-back.jpg';
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
    } else {
        PART2_SOURCE = null;
        $('#part2Pending').hidden = false;
        $('#part2Live').hidden = true;
    }
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

    if (!currentItem) currentItem = getItems().part1;

    if (!paymobReady()) {
        setPayMsg('الدفع الإلكتروني لسه في مرحلة التفعيل. اطلب نسختك من واتساب وهنرتب معاك الدفع يدوياً.');
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
    await handlePaymentReturn();

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
