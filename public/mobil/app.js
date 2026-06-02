(function () {
  'use strict';

  const LS_API = 'tarim_mobil_api';
  const LS_USER = 'tarim_mobil_kullanici';

  let apiBase = '';
  let aktifKullanici = '';
  let stokCache = [];
  let musteriCache = [];
  let sepet = [];
  let detayMusteriID = null;
  let demoDurum = null;
  let isletmeAyarlar = null;
  let tarimUrunCache = [];
  let mobilReceteSonuc = null;
  let mobilReceteKayitModu = false;
  let mobilReceteSeciliKayitID = null;

  const $ = (id) => document.getElementById(id);

  function apiUrl(path) {
    const base = (apiBase || '').replace(/\/+$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  async function apiFetch(path, opts = {}) {
    const res = await fetch(apiUrl(path), {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'X-Tarim-Kaynak': 'mobil',
        ...(opts.headers || {}),
      },
    });
    if (res.status === 403) {
      try {
        const p = await res.clone().json();
        if (p.okumaModu) toast(p.message || 'Salt okunur mod');
      } catch (_) {}
    }
    return res;
  }

  async function demoDurumGuncelle() {
    try {
      const res = await apiFetch('/api/demo-durum');
      if (!res.ok) return;
      demoDurum = await res.json();
      const bar = $('demoUyariBar');
      if (!bar || !demoDurum.demo) {
        if (bar) bar.hidden = true;
        return;
      }
      bar.hidden = true;
      demoOkumaModuUygula();
    } catch (e) {
      console.error(e);
    }
  }

  function demoOkumaModuMu() {
    return !!(demoDurum && demoDurum.demo && demoDurum.okumaModu);
  }

  function demoOkumaModuUygula() {
    const kilit = demoOkumaModuMu();
    const ids = [
      'btnSatisTamamla', 'btnSepetTemizle', 'btnMusteriOdeme', 'btnHizliGiris',
      'btnMobilReceteHesapla', 'btnMobilReceteHesaplaMus', 'btnMobilReceteKaydet', 'btnMusteriRecete',
      'btnMobilReceteYeni', 'btnMobilMalzeme', 'btnMobilGenelStok',
      'btnMobilMalzemeKaydet', 'btnMobilAmbalajEkle',
    ];
    ids.forEach((id) => {
      const el = $(id);
      if (el) el.disabled = kilit;
    });
    const satisArama = $('satisArama');
    if (satisArama) satisArama.disabled = kilit;
  }

  function para(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '0,00 ₺';
    return `${x.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
  }

  /** MSSQL/API: Z veya offset varsa yerel saate; timezone yoksa duvar saati (masaüstü ile aynı). */
  function sqlTarihParse(val) {
    if (val == null || val === '') return null;
    if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (!s) return null;
    if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/);
    if (m) {
      return new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4] || 0),
        Number(m[5] || 0),
        Number(m[6] || 0),
      );
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function tarihTrGoster(val) {
    const d = sqlTarihParse(val);
    if (!d) return '—';
    return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function musteriTurDeger(m) {
    const t = String(m?.tur || '').trim();
    if (t === 'Tuzel' || t === 'Tüzel') return 'Tuzel';
    return 'Gercek';
  }

  function musteriTuzelMi(m) {
    return musteriTurDeger(m) === 'Tuzel';
  }

  function musteriGorunenAd(m) {
    if (!m) return 'Müşteri';
    if (musteriTuzelMi(m)) {
      return String(m.FirmaAdi || m.yetkili || m.AdSoyad || 'Tüzel müşteri').trim();
    }
    return String(m.AdSoyad || m.FirmaAdi || 'Müşteri').trim();
  }

  function hareketTurEtiket(tur) {
    const t = String(tur || '').toLowerCase();
    if (t === 'odeme') return 'Tahsilat';
    if (t === 'iadeodeme') return 'İade ödeme';
    if (t === 'iade') return 'İade';
    return 'Satış';
  }

  function hareketMobilSinif(h) {
    const t = String(h.Tur || '').toLowerCase();
    if (t === 'odeme' || t === 'iadeodeme') return 'hareket-odeme';
    return 'hareket-satis';
  }

  /** Ödemede sadece ödeme şekli; satışta açıklama (not). */
  function hareketMobilNot(h) {
    const turRaw = String(h.Tur || '').toLowerCase();
    if (turRaw === 'odeme' || turRaw === 'iadeodeme') {
      const odeme = String(h.OdemeSekli || '').trim();
      return odeme && odeme !== '—' ? odeme : '';
    }
    return String(h.Aciklama || '').trim();
  }

  function hareketMobilTutarlar(h) {
    const tur = String(h.Tur || '').toLowerCase();
    const toplam = Number(h.ToplamTutar || 0);
    let odenen = Number(h.OdenenTutar || 0);
    const kalan = Number(h.KalanTutar ?? Math.max(0, toplam - odenen));
    if (tur === 'odeme' || tur === 'iadeodeme') {
      return { toplam: 0, odenen };
    }
    if (tur === 'satis' || tur === 'iade') {
      if (toplam > 0 && odenen >= toplam - 0.005 && kalan <= 0.005) {
        odenen = 0;
      }
      return { toplam, odenen };
    }
    return { toplam, odenen: 0 };
  }

  function hareketMobilHtml(h) {
    const sinif = hareketMobilSinif(h);
    const etiket = hareketTurEtiket(h.Tur);
    const { toplam, odenen } = hareketMobilTutarlar(h);
    const tarih = esc(tarihTrGoster(h.Tarih));
    const not = hareketMobilNot(h);
    const notHtml = not
      ? `<div class="hareket-not">${esc(not)}</div>`
      : '';
    return `
      <li class="hareket-item ${sinif}">
        <div class="hareket-ust">
          <span class="hareket-tur">${esc(etiket)}</span>
          <div class="hareket-tutarlar">
            <div class="hareket-tutar-satir">
              <span class="hareket-tutar-etiket">Toplam</span>
              <span class="hareket-toplam-deger">${para(toplam)}</span>
            </div>
            <div class="hareket-tutar-satir">
              <span class="hareket-tutar-etiket">Ödeme</span>
              <span class="hareket-odeme-deger${odenen > 0 ? ' hareket-odeme-dolu' : ''}">${para(odenen)}</span>
            </div>
          </div>
        </div>
        <div class="hareket-alt">
          <span class="hareket-tarih">${tarih}</span>
          ${notHtml}
        </div>
      </li>`;
  }

  function stokSeviyeBilgi(urun) {
    const miktar = Number(urun?.MevcutMiktar || 0);
    const kritik = Number.isFinite(Number(urun?.KritikEsik)) ? Number(urun.KritikEsik) : 5;
    const hedef = Number.isFinite(Number(urun?.HedefEsik)) ? Number(urun.HedefEsik) : Math.max(kritik + 1, 20);
    if (miktar < 0) return { metin: 'Eksi stok', sinif: 'rozet-eksi' };
    if (miktar < kritik) return { metin: 'Tehlikeli', sinif: 'rozet-tehlikeli' };
    if (miktar >= hedef) return { metin: 'Yeterli', sinif: 'rozet-yeterli' };
    return { metin: 'Orta', sinif: 'rozet-orta' };
  }

  function kartListeHtml(opts) {
    const { baslik, alt, tutar, tutarCls, rozet, tikla } = opts;
    const rozetHtml = rozet
      ? `<span class="durum-rozet ${rozet.sinif}">${esc(rozet.metin)}</span>`
      : '';
    const li = document.createElement('li');
    li.className = 'kart-item';
    li.innerHTML = `
      <div class="kart-govde">
        <div class="kart-metin">
          <div class="kart-ust-satir">
            <span class="kart-baslik">${esc(baslik)}</span>
            ${rozetHtml}
          </div>
          ${alt ? `<div class="kart-alt">${alt}</div>` : ''}
        </div>
        <div class="kart-tutar ${tutarCls || ''}">${tutar}</div>
      </div>`;
    if (tikla) li.onclick = tikla;
    return li;
  }

  function stokBoyutMetni(u) {
    const amb = Number(u?.AmbalajMiktari);
    const olcu = String(u?.OlcuBirimi || 'Lt').trim() || 'Lt';
    if (Number.isFinite(amb) && amb > 0) return `${amb} ${olcu}`;
    return '';
  }

  function stokAramaAltSatir(u) {
    const boyut = stokBoyutMetni(u);
    const stok = `${u.MevcutMiktar ?? 0} ${u.Birim || 'Adet'}`;
    return boyut ? `Boyut: ${boyut} · Stok: ${stok}` : `Stok: ${stok}`;
  }

  function stokAraEsles(stok, q) {
    const raw = String(q || '').trim();
    if (!raw) return false;
    const lower = raw.toLocaleLowerCase('tr-TR');
    const ad = String(stok.UrunAdi || '').toLocaleLowerCase('tr-TR');
    const barkod = String(stok.Barkod || '').trim();
    if (/^\d+$/.test(raw) && barkod === raw) return true;
    if (ad.includes(lower)) return true;
    const boyut = stokBoyutMetni(stok);
    if (boyut && boyut.toLocaleLowerCase('tr-TR').includes(lower)) return true;
    if (barkod && barkod.includes(raw)) return true;
    return String(stok.StokID) === raw;
  }

  function toast(msg, ms = 2800) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, ms);
  }

  function showView(name) {
    $('view-login').hidden = name !== 'login';
    $('view-app').hidden = name !== 'app';
  }

  function panelGoster(id) {
    document.querySelectorAll('.panel').forEach((p) => {
      const on = p.id === `panel-${id}`;
      p.hidden = !on;
      p.classList.toggle('panel-active', on);
    });
    const baslik = {
      satis: 'Satış',
      stok: 'Stok',
      musteri: 'Cari',
      'musteri-detay': 'Cari detay',
      recete: 'Reçete test',
      'musteri-recete': 'Müşteri reçeteleri',
    };
    if (id !== 'musteri-recete') {
      $('headerBaslik').textContent = baslik[id] || 'TARIM';
    }
    const altPanel = id === 'musteri-detay' || id === 'musteri-recete';
    const app = $('view-app');
    if (app) app.classList.toggle('alt-panel-acik', altPanel);
    $('bottomNav').hidden = altPanel;
    if (!altPanel) mobilReceteKaydetBarGoster(false);
    if (!altPanel) {
      document.querySelectorAll('.nav-btn').forEach((b) => {
        b.classList.toggle('nav-active', b.dataset.nav === id);
      });
    }
  }

  /* ——— Giriş ——— */
  const HIZLI_KULLANICI = 'admin';
  const HIZLI_SIFRE = '1234';

  function varsayilanApiBase() {
    return `${location.protocol}//${location.host}`;
  }

  function girisFormuDoldur(kullanici, sifre) {
    $('kullaniciAdi').value = kullanici;
    $('sifre').value = sifre;
  }

  function girisButonlariPasif(pasif) {
    const b1 = $('btnGiris');
    const b2 = $('btnHizliGiris');
    if (b1) b1.disabled = pasif;
    if (b2) b2.disabled = pasif;
  }

  function hizliGirisDoldur() {
    girisFormuDoldur(HIZLI_KULLANICI, HIZLI_SIFRE);
  }

  async function girisYap() {
    const hata = $('loginHata');
    hata.hidden = true;
    apiBase = ($('apiBase').value || '').trim().replace(/\/+$/, '');
    if (!apiBase) apiBase = varsayilanApiBase();
    const KullaniciAdi = $('kullaniciAdi').value.trim();
    const Sifre = $('sifre').value;
    if (!KullaniciAdi || !Sifre) {
      hata.textContent = 'Kullanıcı adı ve şifre girin.';
      hata.hidden = false;
      return;
    }
    girisButonlariPasif(true);
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ KullaniciAdi, Sifre }),
      });
      if (res.status === 401) {
        hata.textContent = 'Hatalı kullanıcı veya şifre.';
        hata.hidden = false;
        return;
      }
      const sonuc = await res.json();
      if (!sonuc.success) {
        hata.textContent = sonuc.message || 'Giriş başarısız.';
        hata.hidden = false;
        return;
      }
      localStorage.setItem(LS_API, apiBase);
      localStorage.setItem(LS_USER, KullaniciAdi);
      aktifKullanici = sonuc.kullanici.AdSoyad || sonuc.kullanici.KullaniciAdi || KullaniciAdi;
      $('aktifKullanici').textContent = aktifKullanici;
      showView('app');
      panelGoster('satis');
      await demoDurumGuncelle();
      await veriYukle();
    } catch (e) {
      console.error(e);
      hata.textContent = 'Sunucuya bağlanılamadı. Adres ve ağı kontrol edin.';
      hata.hidden = false;
    } finally {
      girisButonlariPasif(false);
    }
  }

  async function gunlukKasaYukle() {
    const bar = $('kasaOzetBar');
    if (!bar) return;
    try {
      const res = await apiFetch('/api/gunluk-islemler');
      if (!res.ok) return;
      const data = await res.json();
      const oz = data.ozet || {};
      const set = (id, val) => {
        const el = $(id);
        if (el) el.textContent = para(val);
      };
      set('kzNakit', oz.nakit);
      set('kzKart', oz.kart);
      set('kzHavale', oz.havale);
      set('kzToplam', oz.toplam);
      set('kzKasaGiris', oz.kasaGiris);
    } catch (e) {
      console.error(e);
    }
  }

  function cikisYap() {
    sepet = [];
    stokCache = [];
    musteriCache = [];
    detayMusteriID = null;
    isletmeAyarlar = null;
    tarimUrunCache = [];
    mobilReceteSonuc = null;
    mobilReceteKayitModu = false;
    isletmeOzetCiz();
    sepetCiz();
    showView('login');
  }

  function isletmeOzetCiz() {
    const bar = $('isletmeOzetBar');
    const el = $('isletmeOzetMetin');
    if (!bar || !el) return;
    const a = isletmeAyarlar;
    const unvan = String(a?.SirketUnvan || '').trim();
    const tel = String(a?.SirketTelefon || '').trim();
    const adres = String(a?.SirketAdres || '').trim();
    const yetkili = String(a?.SirketYetkiliAdSoyad || '').trim();
    const vergi = String(a?.SirketVergiNo || '').trim();
    if (!unvan && !tel && !adres && !yetkili) {
      bar.hidden = true;
      return;
    }
    const satirlar = [];
    if (yetkili) satirlar.push(`<span class="isletme-ozet-satir">${esc(yetkili)}</span>`);
    if (vergi) satirlar.push(`<span class="isletme-ozet-satir">VKN: ${esc(vergi)}</span>`);
    if (tel) satirlar.push(`<span class="isletme-ozet-satir">${esc(tel)}</span>`);
    if (adres) satirlar.push(`<span class="isletme-ozet-satir">${esc(adres)}</span>`);
    el.innerHTML = `${unvan ? `<strong>${esc(unvan)}</strong>` : ''}${satirlar.join('')}`;
    bar.hidden = false;
  }

  async function isletmeYukle() {
    try {
      const res = await apiFetch('/api/ayarlar');
      if (!res.ok) return;
      isletmeAyarlar = await res.json();
      isletmeOzetCiz();
    } catch (e) {
      console.error(e);
    }
  }

  async function veriYukle() {
    try {
      const [stokRes, musRes] = await Promise.all([
        apiFetch('/api/stok'),
        apiFetch('/api/musteri'),
      ]);
      stokCache = stokRes.ok ? await stokRes.json() : [];
      musteriCache = musRes.ok ? await musRes.json() : [];
      stokListele();
      musteriListele();
      await Promise.all([gunlukKasaYukle(), isletmeYukle()]);
    } catch (e) {
      console.error(e);
      toast('Veri yüklenemedi');
    }
  }

  /* ——— Reçete (mobil) ——— */
  function mobilReceteVarsayilanSecimTip(oneriler) {
    if (!oneriler) return 'enYakin';
    if (oneriler.tamBolunmus || (oneriler.tamDenk && oneriler.tamUyum)) return 'tamUyum';
    if (oneriler.secimGerekli) return 'enYakin';
    return 'enYakin';
  }

  function mobilReceteAktifPlan(satir) {
    const o = satir.oneriler;
    if (!o) return null;
    const tip = satir.secimTip || mobilReceteVarsayilanSecimTip(o);
    if (tip === 'tamUyum' && o.tamBolunmus) return o.tamBolunmus;
    if (tip === 'tamUyum' && o.tamUyum) return o.tamUyum;
    if (tip === 'enUzak' && o.enUzak) return o.enUzak;
    if (tip === 'enYakin' && o.enYakin) return o.enYakin;
    if (tip === 'azKutu' && o.azKutu) return o.azKutu;
    return o.enYakin || o.azAtik || o.enUzak || o.tamUyum || null;
  }

  function mobilReceteStokFiyatBul(stokID, ambalajlar) {
    const fromAmb = (ambalajlar || []).find((a) => Number(a.stokID) === Number(stokID));
    if (fromAmb && fromAmb.satisFiyati != null) return Number(fromAmb.satisFiyati);
    const fromCache = stokCache.find((s) => Number(s.StokID) === Number(stokID));
    return Number(fromCache?.SatisFiyati || 0);
  }

  function mobilRecetePlanMaliyet(plan, ambalajlar) {
    if (!plan?.secim?.length) return { kalemler: [], toplam: 0 };
    const kalemler = plan.secim.map((s) => {
      const birimFiyat = s.satisFiyati != null && Number(s.satisFiyati) > 0
        ? Number(s.satisFiyati)
        : mobilReceteStokFiyatBul(s.stokID, ambalajlar);
      const tutar = Math.round(s.adet * birimFiyat * 100) / 100;
      return { ...s, birimFiyat, tutar };
    });
    const toplam = Math.round(kalemler.reduce((acc, k) => acc + k.tutar, 0) * 100) / 100;
    return { kalemler, toplam };
  }

  function mobilReceteSatirMaliyet(satir) {
    return mobilRecetePlanMaliyet(mobilReceteAktifPlan(satir), satir.ambalajlar);
  }

  function mobilRecetePlanTamMi(plan) {
    return !!(plan && plan.tam === true);
  }

  function mobilRecetePlanHtml(plan, birim, ambalajlar) {
    if (!plan?.secim?.length) {
      return '<p class="bos-metin" style="padding:8px 0">Ambalaj planı yok</p>';
    }
    const b = birim || 'Lt';
    const { kalemler, toplam } = mobilRecetePlanMaliyet(plan, ambalajlar);
    const tam = mobilRecetePlanTamMi(plan);
    const satirlar = kalemler.map((s) => {
      const stokUyari = Number(s.mevcutMiktar) < s.adet
        ? ' <span class="stok-uyari">stok!</span>'
        : '';
      const ad = esc(s.urunAdi || '—');
      return `<tr>
        <td>${ad}${stokUyari}</td>
        <td class="sayi">${s.adet}</td>
        <td class="sayi">${para(s.birimFiyat)}</td>
        <td class="sayi">${para(s.tutar)}</td>
      </tr>`;
    }).join('');
    const altToplam = kalemler.length > 1
      ? `<tr><td colspan="3" class="sayi" style="color:var(--muted)">Satır toplamı</td><td class="sayi">${para(toplam)}</td></tr>`
      : '';
    const fireNot = !tam && plan.fire > 0
      ? `<div class="mobil-recete-fire">(+${plan.fire} ${esc(b)} fazla ambalaj)</div>`
      : '';
    return `<table class="mobil-recete-plan-tablo">
      <thead><tr><th>Ürün</th><th class="sayi">Adet</th><th class="sayi">Birim fiyat</th><th class="sayi">Toplam</th></tr></thead>
      <tbody>${satirlar}${altToplam}</tbody>
    </table>${fireNot}`;
  }

  function mobilReceteKalemHtml(m, idx, tarimUrunAdi) {
    const birim = m.birim || 'Lt';
    const key = `m${idx}`;
    const secimTip = m.secimTip || mobilReceteVarsayilanSecimTip(m.oneriler);
    let secimHtml = '';
    let planHtml = '';

    if (m.oneriler?.secimGerekli && m.oneriler.enYakin && m.oneriler.enUzak) {
      const chkY = secimTip === 'enYakin' || secimTip === 'tamUyum' ? 'checked' : '';
      const chkU = secimTip === 'enUzak' ? 'checked' : '';
      secimHtml = `<div class="mobil-recete-secim" data-recete-idx="${idx}">
        <span>Tam denk değil:</span>
        <label><input type="radio" name="mobilReceteSecim_${key}" value="enYakin" ${chkY}> En yakın</label>
        <label><input type="radio" name="mobilReceteSecim_${key}" value="enUzak" ${chkU}> En uzak</label>
      </div>`;
      const plan = secimTip === 'enUzak' ? m.oneriler.enUzak : m.oneriler.enYakin;
      planHtml = mobilRecetePlanHtml(plan, birim, m.ambalajlar);
    } else {
      const o = m.oneriler;
      const tamPlan = o?.tamBolunmus || o?.tamUyum;
      const plan = mobilReceteAktifPlan(m) || tamPlan || o?.enYakin || o?.azAtik;
      planHtml = mobilRecetePlanHtml(plan, birim, m.ambalajlar);
    }

    const maliyet = mobilReceteSatirMaliyet(m);
    const notParcalar = [];
    if (tarimUrunAdi) notParcalar.push(tarimUrunAdi);
    if (m.miktarDekar != null) {
      notParcalar.push(`${m.miktarDekar} ${birim}/da · ihtiyaç ${m.toplamIhtiyac} ${birim}`);
      if (m.dekar != null) notParcalar.push(`${m.dekar} da`);
    }
    const notHtml = notParcalar.length
      ? `<span class="mobil-recete-kalem-not">${esc(notParcalar.join(' · '))}</span>`
      : '';

    return `<article class="mobil-recete-kalem" data-recete-idx="${idx}">
      <div class="mobil-recete-kalem-ust">
        <div class="mobil-recete-kalem-ad">${esc(m.grupAdi || m.urunAdi)}${notHtml}</div>
        <span class="mobil-recete-kalem-tutar">${para(maliyet.toplam)}</span>
      </div>
      <div class="mobil-recete-kalem-govde">${secimHtml}${planHtml}</div>
    </article>`;
  }

  function mobilReceteKaydetBarYukseklikGuncelle() {
    const bar = $('mobilReceteKaydetBar');
    if (!bar || bar.hidden) return;
    const h = bar.getBoundingClientRect().height;
    if (h > 0) {
      document.documentElement.style.setProperty('--mobil-kaydet-bar-h', `${Math.ceil(h)}px`);
    }
  }

  function mobilReceteKaydetBarGoster(goster, genelToplam) {
    const bar = $('mobilReceteKaydetBar');
    const app = $('view-app');
    const toplamEl = $('mobilReceteKaydetToplam');
    if (bar) bar.hidden = !goster;
    if (app) app.classList.toggle('recete-kaydet-acik', !!goster);
    if (toplamEl && goster && genelToplam != null) {
      toplamEl.textContent = para(genelToplam);
    }
    if (goster) {
      requestAnimationFrame(() => {
        mobilReceteKaydetBarYukseklikGuncelle();
      });
    }
  }

  function mobilReceteSonucHtml(data, kayitModu) {
    if (!data?.success) {
      mobilReceteKaydetBarGoster(false);
      return `<div class="mobil-recete-ozet mobil-recete-ozet-hata">${esc(data?.message || 'Hesaplama hatası')}</div>`;
    }
    if (!data.malzemeler?.length) {
      mobilReceteKaydetBarGoster(false);
      return `<div class="mobil-recete-ozet mobil-recete-ozet-uyari">
        <strong>${esc(data.urunAdi)}</strong> için tanımlı malzeme/dozaj yok.
        Masaüstünde Tanımlamalar → Malzemeler bölümünden dozaj ekleyin.
      </div>`;
    }
    data.malzemeler.forEach((m) => {
      if (!m.secimTip) m.secimTip = mobilReceteVarsayilanSecimTip(m.oneriler);
    });
    const genelToplam = Math.round(
      data.malzemeler.reduce((acc, m) => acc + mobilReceteSatirMaliyet(m).toplam, 0) * 100,
    ) / 100;
    const ozet = `<div class="mobil-recete-ozet">
      <strong>${esc(data.urunAdi)}</strong> · ${data.dekar} dekar · ${data.malzemeler.length} kalem
    </div>`;
    const kartlar = data.malzemeler.map((m, i) => mobilReceteKalemHtml(m, i, data.urunAdi)).join('');
    const toplamHtml = `<div class="mobil-recete-genel-toplam">
      <span>Genel toplam</span><span>${para(genelToplam)}</span>
    </div>`;
    mobilReceteSonuc = data;
    mobilReceteKayitModu = !!kayitModu;
    const kaydetGoster = !!(kayitModu && data.malzemeler.length > 0);
    mobilReceteKaydetBarGoster(kaydetGoster, kaydetGoster ? genelToplam : null);
    return ozet + kartlar + (kayitModu ? '' : toplamHtml);
  }

  function mobilReceteSonucBagla(container) {
    if (!container) return;
    container.querySelectorAll('.mobil-recete-secim input[type="radio"]').forEach((inp) => {
      inp.onchange = () => {
        if (!mobilReceteSonuc?.malzemeler) return;
        const wrap = inp.closest('[data-recete-idx]');
        const idx = Number(wrap?.dataset?.receteIdx);
        if (!Number.isFinite(idx)) return;
        mobilReceteSonuc.malzemeler[idx].secimTip = inp.value;
        const kayit = mobilReceteKayitModu;
        container.innerHTML = mobilReceteSonucHtml(mobilReceteSonuc, kayit);
        mobilReceteSonucBagla(container);
        if (kayit && mobilReceteSonuc.malzemeler.length) {
          const gt = Math.round(
            mobilReceteSonuc.malzemeler.reduce((acc, m) => acc + mobilReceteSatirMaliyet(m).toplam, 0) * 100,
          ) / 100;
          mobilReceteKaydetBarGoster(true, gt);
        }
      };
    });
  }

  async function tarimUrunleriYukle() {
    if (tarimUrunCache.length) return tarimUrunCache;
    const res = await apiFetch('/api/tarim-urun');
    if (!res.ok) return [];
    tarimUrunCache = await res.json();
    return tarimUrunCache;
  }

  async function mobilTarimUrunSelectDoldur(selectId) {
    const sel = $(selectId);
    if (!sel) return;
    const liste = await tarimUrunleriYukle();
    const mevcut = sel.value;
    sel.innerHTML = '<option value="">— Ürün seçin —</option>'
      + liste.map((u) => `<option value="${u.TarimUrunID}">${esc(u.UrunAdi)}</option>`).join('');
    if (mevcut) sel.value = mevcut;
  }

  async function mobilReceteHesapla(sonucId, urunId, dekarId, kayitModu, musteriID) {
    const out = $(sonucId);
    const uid = Number($(urunId)?.value);
    const dekar = parseFloat($(dekarId)?.value);
    if (!out) return;
    if (!uid || !Number.isFinite(dekar) || dekar <= 0) {
      out.innerHTML = '<p class="bos-metin">Ürün ve dekar girin.</p>';
      mobilReceteSonuc = null;
      mobilReceteKaydetBarGoster(false);
      return;
    }
    out.innerHTML = '<p class="bos-metin">Hesaplanıyor…</p>';
    try {
      const body = { tarimUrunID: uid, dekar, kullanici: aktifKullanici };
      if (musteriID) body.musteriID = musteriID;
      const res = await apiFetch('/api/recete/hesapla', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      out.innerHTML = mobilReceteSonucHtml(data, kayitModu);
      mobilReceteSonucBagla(out);
    } catch (e) {
      console.error(e);
      out.innerHTML = '<div class="mobil-recete-ozet mobil-recete-ozet-hata">Sunucu hatası</div>';
      mobilReceteSonuc = null;
      mobilReceteKaydetBarGoster(false);
    }
  }

  function mobilReceteStokUrunAdi(stokID, p) {
    if (p?.urunAdi) return p.urunAdi;
    const s = stokCache.find((x) => Number(x.StokID) === Number(stokID));
    return s?.UrunAdi || '—';
  }

  function mobilRecetePlanSatirlari(row) {
    let plan = row?.plan;
    if (!plan) return [];
    if (Array.isArray(plan)) return plan;
    if (plan.secim && Array.isArray(plan.secim)) return plan.secim;
    return [];
  }

  function mobilReceteKayitliSatirMaliyet(row) {
    const plan = mobilRecetePlanSatirlari(row);
    let toplam = Number(row.satirMaliyet);
    if (!Number.isFinite(toplam) || toplam <= 0) {
      toplam = plan.reduce((acc, p) => {
        const satirT = Number(p.satirTutar);
        if (Number.isFinite(satirT)) return acc + satirT;
        const bf = p.satisFiyati != null
          ? Number(p.satisFiyati)
          : mobilReceteStokFiyatBul(p.stokID, []);
        return acc + (Number(p.adet) || 0) * bf;
      }, 0);
    }
    return Math.round(toplam * 100) / 100;
  }

  function mobilReceteSatirlarPayload(malzemeler) {
    return malzemeler.map((m) => {
      const plan = mobilReceteAktifPlan(m);
      const secimTip = m.secimTip || mobilReceteVarsayilanSecimTip(m.oneriler);
      const maliyet = mobilReceteSatirMaliyet(m);
      const planKayit = (plan?.secim || []).map((p) => {
        const birimFiyat = p.satisFiyati != null && Number(p.satisFiyati) > 0
          ? Number(p.satisFiyati)
          : mobilReceteStokFiyatBul(p.stokID, m.ambalajlar);
        return {
          ...p,
          urunAdi: p.urunAdi || mobilReceteStokUrunAdi(p.stokID, p),
          satisFiyati: birimFiyat,
          satirTutar: Math.round(p.adet * birimFiyat * 100) / 100,
        };
      });
      return {
        stokID: m.stokID,
        urunAdi: m.grupAdi || m.urunAdi,
        malzemeGrupID: m.malzemeGrupID,
        miktarDekar: m.miktarDekar,
        birim: m.birim || 'Lt',
        toplamIhtiyac: m.toplamIhtiyac,
        secimTip,
        satirMaliyet: maliyet.toplam,
        plan: planKayit,
      };
    });
  }

  function mobilReceteModGoster(mod) {
    const liste = $('mobilReceteListeModu');
    const yeni = $('mobilReceteYeniModu');
    const gor = $('mobilReceteGoruntuleModu');
    if (liste) liste.hidden = mod !== 'liste';
    if (yeni) yeni.hidden = mod !== 'yeni';
    if (gor) gor.hidden = mod !== 'goruntule';
    if (mod !== 'yeni') mobilReceteKaydetBarGoster(false);
    const baslik = $('headerBaslik');
    if (baslik && mod === 'yeni') baslik.textContent = 'Yeni reçete';
    else if (baslik && mod === 'goruntule') baslik.textContent = 'Kayıtlı reçete';
    else if (baslik && mod === 'liste') baslik.textContent = 'Müşteri reçeteleri';
  }

  async function mobilReceteKayitliListeYukle(seciliID) {
    const ul = $('mobilReceteKayitliListe');
    const bos = $('mobilReceteKayitliBos');
    if (!ul || !detayMusteriID) return [];
    ul.innerHTML = '';
    if (bos) bos.hidden = true;
    try {
      const res = await apiFetch(`/api/musteri/${detayMusteriID}/receteler`);
      const rows = res.ok ? await res.json() : [];
      const liste = Array.isArray(rows) ? rows : [];
      if (!liste.length) {
        if (bos) bos.hidden = false;
        return [];
      }
      if (bos) bos.hidden = true;
      liste.forEach((r) => {
        const tarih = tarihTrGoster(r.Tarih);
        const aktif = Number(seciliID) === Number(r.ReceteID);
        const satildi = r.SatisYapildi
          ? '<span class="mobil-recete-kayit-rozet">Satış yapıldı</span>'
          : '';
        const li = document.createElement('li');
        li.className = `kart-item${aktif ? ' kart-recete-aktif' : ''}`;
        li.innerHTML = `
          <div class="kart-govde">
            <div class="kart-metin">
              <div class="kart-ust-satir">
                <span class="kart-baslik">${esc(r.TarimUrunAdi)}</span>
                <span class="durum-rozet rozet-yeterli">${esc(String(r.Dekar))} da</span>
              </div>
              <div class="kart-alt">#${r.ReceteID} · ${esc(tarih)} · ${r.KalemSayisi || 0} kalem</div>
              ${satildi}
            </div>
          </div>`;
        li.onclick = () => mobilReceteKayitliGoster(r.ReceteID);
        ul.appendChild(li);
      });
      return liste;
    } catch (e) {
      console.error(e);
      if (bos) {
        bos.textContent = 'Liste yüklenemedi';
        bos.hidden = false;
      }
      return [];
    }
  }

  function mobilReceteMalzemeKayitlidan(row, recete) {
    const plan = mobilRecetePlanSatirlari(row).map((p) => ({
      ...p,
      urunAdi: p.urunAdi || mobilReceteStokUrunAdi(p.stokID, p),
    }));
    const ambalajlar = plan.map((p) => ({
      stokID: p.stokID,
      urunAdi: p.urunAdi,
      satisFiyati: p.satisFiyati,
      ambalajMiktari: p.ambalajMiktari,
      mevcutMiktar: p.mevcutMiktar,
    }));
    const m = {
      grupAdi: row.UrunAdi,
      miktarDekar: row.MiktarDekar,
      birim: row.Birim,
      toplamIhtiyac: row.ToplamIhtiyac,
      dekar: recete.Dekar,
      ambalajlar,
      oneriler: {},
    };
    if (plan.length) {
      const t = plan.reduce((a, x) => a + x.adet * (x.ambalajMiktari || 0), 0);
      m.oneriler.tamDenk = true;
      m.oneriler.tamBolunmus = {
        secim: plan,
        adetToplam: plan.reduce((a, x) => a + x.adet, 0),
        miktarToplam: Math.round(t * 1000) / 1000,
        fire: Math.round((t - row.ToplamIhtiyac) * 1000) / 1000,
        ihtiyac: row.ToplamIhtiyac,
        tam: Math.abs(t - row.ToplamIhtiyac) < 1e-6,
      };
    }
    return m;
  }

  async function mobilReceteKayitliGoster(receteID) {
    const detay = $('mobilReceteKayitliDetay');
    if (!detay) return;
    mobilReceteSeciliKayitID = receteID;
    mobilReceteModGoster('goruntule');
    detay.innerHTML = '<p class="bos-metin">Yükleniyor…</p>';
    try {
      const res = await apiFetch(`/api/recete/${receteID}`);
      const data = await res.json();
      if (!data.success) {
        detay.innerHTML = '<div class="mobil-recete-ozet mobil-recete-ozet-hata">Reçete bulunamadı</div>';
        return;
      }
      const rec = data.recete;
      const kartlar = (data.satirlar || []).map((row, i) => {
        const m = mobilReceteMalzemeKayitlidan(row, rec);
        return mobilReceteKalemHtml(m, i, rec.TarimUrunAdi);
      }).join('');
      const genelToplam = Math.round(
        (data.satirlar || []).reduce((acc, row) => acc + mobilReceteKayitliSatirMaliyet(row), 0) * 100,
      ) / 100;
      const tarih = tarihTrGoster(rec.Tarih);
      const not = rec.Notlar
        ? `<p class="mobil-recete-kayit-meta"><em>Not:</em> ${esc(rec.Notlar)}</p>`
        : '';
      const satis = rec.SatisYapildi
        ? `<span class="mobil-recete-satis-rozet">Satış yapıldı${rec.SatisTarih ? ` · ${esc(tarihTrGoster(rec.SatisTarih))}` : ''}</span>`
        : '';
      detay.innerHTML = `
        <div class="mobil-recete-kayit-baslik">
          <h3>#${receteID} · ${esc(rec.TarimUrunAdi)}</h3>
          <div class="mobil-recete-kayit-meta">${esc(String(rec.Dekar))} dekar · ${esc(tarih)}</div>
          ${not}${satis}
        </div>
        <div class="mobil-recete-ozet"><strong>${esc(rec.TarimUrunAdi)}</strong> · ${rec.Dekar} dekar · ${(data.satirlar || []).length} kalem</div>
        ${kartlar}
        <div class="mobil-recete-genel-toplam"><span>Genel toplam</span><span>${para(genelToplam)}</span></div>`;
      await mobilReceteKayitliListeYukle(receteID);
    } catch (e) {
      console.error(e);
      detay.innerHTML = '<div class="mobil-recete-ozet mobil-recete-ozet-hata">Okuma hatası</div>';
    }
  }

  function mobilReceteYeniAc() {
    mobilReceteSonuc = null;
    mobilReceteKayitModu = true;
    $('mobilReceteSonucMus').innerHTML = '';
    mobilReceteKaydetBarGoster(false);
    $('mobilReceteNotMus').value = '';
    $('mobilReceteDekarMus').value = '10';
    mobilReceteModGoster('yeni');
    mobilTarimUrunSelectDoldur('mobilReceteUrunMus');
  }

  async function mobilReceteKaydet() {
    if (demoOkumaModuMu()) {
      toast('Demo süresi doldu — kayıt yapılamaz');
      return;
    }
    if (!detayMusteriID || !mobilReceteSonuc?.success || !mobilReceteSonuc.malzemeler?.length) {
      toast('Önce reçeteyi hesaplayın');
      return;
    }
    const uid = Number($('mobilReceteUrunMus')?.value);
    const dekar = parseFloat($('mobilReceteDekarMus')?.value);
    if (!uid || !Number.isFinite(dekar) || dekar <= 0) {
      toast('Ürün ve dekar gerekli');
      return;
    }
    const notlar = String($('mobilReceteNotMus')?.value || '').trim();
    const satirlar = mobilReceteSatirlarPayload(mobilReceteSonuc.malzemeler);
    try {
      const res = await apiFetch('/api/recete/kaydet', {
        method: 'POST',
        body: JSON.stringify({
          musteriID: detayMusteriID,
          tarimUrunID: uid,
          dekar,
          satirlar,
          notlar: notlar || null,
          kullanici: aktifKullanici,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.success) {
        toast(payload.message || 'Reçete kaydedildi');
        mobilReceteSonuc = null;
        $('mobilReceteSonucMus').innerHTML = '';
        mobilReceteKaydetBarGoster(false);
        $('mobilReceteNotMus').value = '';
        const yeniId = payload.receteID;
        mobilReceteModGoster('liste');
        await mobilReceteKayitliListeYukle(yeniId);
        if (yeniId) await mobilReceteKayitliGoster(yeniId);
        else mobilReceteModGoster('liste');
      } else {
        toast(payload.message || 'Kayıt başarısız');
      }
    } catch (e) {
      console.error(e);
      toast('Bağlantı hatası');
    }
  }

  function musteriReceteAc() {
    const m = musteriCache.find((x) => x.MusteriID === detayMusteriID);
    if (!m) return;
    $('mobilReceteMusteriBaslik').textContent = musteriGorunenAd(m);
    mobilReceteSonuc = null;
    mobilReceteSeciliKayitID = null;
    panelGoster('musteri-recete');
    mobilReceteModGoster('liste');
    mobilReceteKayitliListeYukle();
  }

  async function recetePanelAc() {
    panelGoster('recete');
    await mobilTarimUrunSelectDoldur('mobilReceteUrun');
  }

  /* ——— Sepet ——— */
  function sepetToplamHesapla() {
    return sepet.reduce((t, s) => t + s.birimFiyat * s.miktar, 0);
  }

  function sepeteEkle(urun) {
    const id = urun.StokID;
    const bf = Number(urun.SatisFiyati) || 0;
    const mevcut = sepet.find((s) => s.stokID === id);
    if (mevcut) {
      mevcut.miktar += 1;
    } else {
      sepet.push({
        stokID: id,
        urunAdi: urun.UrunAdi,
        boyutEtiket: stokBoyutMetni(urun),
        miktar: 1,
        birimFiyat: bf,
        birim: urun.Birim || 'Adet',
      });
    }
    $('satisArama').value = '';
    $('satisAramaSonuc').hidden = true;
    sepetCiz();
  }

  function sepetCiz() {
    const ul = $('sepetListe');
    const bos = $('sepetBos');
    const toplam = Math.round(sepetToplamHesapla() * 100) / 100;
    ul.innerHTML = '';
    if (sepet.length === 0) {
      bos.hidden = false;
      $('btnSatisTamamla').disabled = true;
    } else {
      bos.hidden = true;
      $('btnSatisTamamla').disabled = false;
      sepet.forEach((s, idx) => {
        const li = document.createElement('li');
        li.className = 'sepet-satir';
        const satirTutar = Math.round(s.birimFiyat * s.miktar * 100) / 100;
        const boyutKucuk = s.boyutEtiket ? `<span class="sepet-boyut">${esc(s.boyutEtiket)}</span>` : '';
        li.innerHTML = `
          <span class="sepet-ad">${esc(s.urunAdi)}${boyutKucuk}</span>
          <div class="sepet-miktar-wrap">
            <button type="button" class="sepet-miktar-btn" data-az="${idx}">−</button>
            <span class="sepet-miktar">${s.miktar}</span>
            <button type="button" class="sepet-miktar-btn" data-art="${idx}">+</button>
          </div>
          <span class="sepet-satir-tutar">${para(satirTutar)}</span>
          <button type="button" class="sepet-sil" data-sil="${idx}" aria-label="Sil">×</button>`;
        ul.appendChild(li);
      });
      ul.querySelectorAll('[data-az]').forEach((btn) => {
        btn.onclick = () => {
          const i = +btn.dataset.az;
          if (sepet[i].miktar > 1) sepet[i].miktar -= 1;
          else sepet.splice(i, 1);
          sepetCiz();
        };
      });
      ul.querySelectorAll('[data-art]').forEach((btn) => {
        btn.onclick = () => { sepet[+btn.dataset.art].miktar += 1; sepetCiz(); };
      });
      ul.querySelectorAll('[data-sil]').forEach((btn) => {
        btn.onclick = () => { sepet.splice(+btn.dataset.sil, 1); sepetCiz(); };
      });
    }
    $('sepetToplam').textContent = para(toplam);
  }

  function satisAramaGoster(q) {
    const box = $('satisAramaSonuc');
    const trimmed = String(q || '').trim();
    if (!trimmed) {
      box.hidden = true;
      return;
    }
    const filtre = stokCache.filter((s) => stokAraEsles(s, trimmed)).slice(0, 25);
    if (/^\d+$/.test(trimmed) && filtre.length === 1 && String(filtre[0].Barkod || '').trim() === trimmed) {
      sepeteEkle(filtre[0]);
      return;
    }
    if (/^\d+$/.test(trimmed) && filtre.length === 1) {
      sepeteEkle(filtre[0]);
      return;
    }
    box.innerHTML = '';
    if (filtre.length === 0) {
      box.hidden = true;
      return;
    }
    filtre.forEach((u) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'arama-item';
      btn.innerHTML = `<span><span>${esc(u.UrunAdi)}</span><span class="arama-item-alt">${esc(stokAramaAltSatir(u))}</span></span><span class="arama-item-fiyat">${para(u.SatisFiyati)}</span>`;
      btn.onclick = () => sepeteEkle(u);
      box.appendChild(btn);
    });
    box.hidden = false;
  }

  function satisDialogAc() {
    if (sepet.length === 0) return;
    const toplam = Math.round(sepetToplamHesapla() * 100) / 100;
    $('dlgSatisToplam').textContent = para(toplam);
    $('satisTahsilat').value = toplam.toFixed(2);
    $('satisMusteriID').value = '';
    $('satisMusteriAra').value = '';
    $('satisMusteriSecili').hidden = true;
    $('satisMusteriSonuc').hidden = true;
    document.querySelector('#formSatis input[name="odemeTipi"][value="Nakit"]').checked = true;
    $('dlgSatis').showModal();
  }

  function satisMusteriAraGoster(q) {
    const box = $('satisMusteriSonuc');
    const trimmed = String(q || '').trim().toLowerCase();
    $('satisMusteriID').value = '';
    $('satisMusteriSecili').hidden = true;
    if (!trimmed) {
      box.hidden = true;
      return;
    }
    const filtre = musteriCache.filter((m) => {
      const ad = musteriGorunenAd(m).toLocaleLowerCase('tr-TR');
      const tel = String(m.Telefon || '').toLowerCase();
      return ad.includes(trimmed) || tel.includes(trimmed) || String(m.MusteriID).includes(trimmed);
    }).slice(0, 15);
    box.innerHTML = '';
    if (filtre.length === 0) {
      box.hidden = true;
      return;
    }
    filtre.forEach((m) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'arama-item';
      btn.innerHTML = `<span>${esc(musteriGorunenAd(m))}<span class="arama-item-alt">#${m.MusteriID}</span></span>`;
      btn.onclick = () => {
        $('satisMusteriID').value = m.MusteriID;
        $('satisMusteriAra').value = musteriGorunenAd(m);
        $('satisMusteriSecili').textContent = `Seçili: ${musteriGorunenAd(m)}`;
        $('satisMusteriSecili').hidden = false;
        box.hidden = true;
      };
      box.appendChild(btn);
    });
    box.hidden = false;
  }

  async function satisKaydet(ev) {
    ev.preventDefault();
    if (demoOkumaModuMu()) {
      toast('Demo süresi doldu — satış yapılamaz');
      return;
    }
    const odemeEl = document.querySelector('#formSatis input[name="odemeTipi"]:checked');
    const odemeTipi = odemeEl ? odemeEl.value : 'Nakit';
    let musteriID = parseInt($('satisMusteriID').value, 10);
    if (!Number.isInteger(musteriID) || musteriID < 1) musteriID = null;

    if (odemeTipi === 'Veresiye' && !musteriID) {
      toast('Veresiye için müşteri seçin');
      return;
    }

    const sepetToplam = Math.round(sepetToplamHesapla() * 100) / 100;
    let tahsilatTutar = parseFloat($('satisTahsilat').value);
    if (!Number.isFinite(tahsilatTutar) || tahsilatTutar < 0) {
      toast('Geçerli tahsilat tutarı girin');
      return;
    }
    tahsilatTutar = Math.round(tahsilatTutar * 100) / 100;
    if (odemeTipi === 'Veresiye') tahsilatTutar = 0;
    else if (!musteriID) tahsilatTutar = sepetToplam;
    if (musteriID && odemeTipi !== 'Veresiye' && tahsilatTutar > sepetToplam) {
      toast('Tahsilat sepet toplamını geçemez');
      return;
    }

    const kalemler = sepet.map((s) => ({
      urunID: s.stokID,
      miktar: s.miktar,
      birimFiyat: s.birimFiyat,
    }));

    const body = {
      kalemler,
      kullanici: aktifKullanici,
      odemeTipi,
      tahsilatTutar,
    };
    if (musteriID) body.musteriID = musteriID;

    try {
      const res = await apiFetch('/api/satis-sepet', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.success) {
        $('dlgSatis').close();
        sepet = [];
        sepetCiz();
        toast('Satış kaydedildi');
        await veriYukle();
      } else {
        toast(payload.message || 'Satış tamamlanamadı');
      }
    } catch (e) {
      console.error(e);
      toast('Bağlantı hatası');
    }
  }

  /* ——— Stok ——— */
  function stokListele() {
    const q = ($('stokArama').value || '').trim();
    const ul = $('stokListe');
    let liste = stokCache;
    if (q) liste = liste.filter((s) => stokAraEsles(s, q));
    liste = [...liste].sort((a, b) =>
      String(a.UrunAdi || '').localeCompare(String(b.UrunAdi || ''), 'tr'));
    ul.innerHTML = '';
    $('stokBos').hidden = liste.length > 0;
    liste.forEach((s) => {
      const miktar = Number(s.MevcutMiktar) || 0;
      const seviye = stokSeviyeBilgi(s);
      const alt = `Stok: <strong>${miktar}</strong> ${esc(s.Birim || 'Adet')}${s.Barkod ? ` · ${esc(s.Barkod)}` : ''}`;
      ul.appendChild(
        kartListeHtml({
          baslik: s.UrunAdi,
          alt,
          tutar: para(s.SatisFiyati),
          rozet: seviye,
          tikla: () => {
            if (window.MobilStok) window.MobilStok.kartAc(s);
          },
        }),
      );
    });
  }

  /* ——— Müşteri ——— */
  function musteriListele() {
    const q = ($('musteriArama').value || '').trim().toLocaleLowerCase('tr-TR');
    const sadeceBorc = $('musteriSadeceBorc').checked;
    const ul = $('musteriListe');
    let liste = musteriCache;
    if (sadeceBorc) liste = liste.filter((m) => Number(m.Bakiye) > 0.005);
    if (q) {
      liste = liste.filter((m) => {
        const ad = musteriGorunenAd(m).toLocaleLowerCase('tr-TR');
        const tel = String(m.Telefon || '').toLowerCase();
        return ad.includes(q) || tel.includes(q) || String(m.MusteriID).includes(q);
      });
    }
    liste = [...liste].sort((a, b) => Number(b.Bakiye || 0) - Number(a.Bakiye || 0));
    ul.innerHTML = '';
    $('musteriBos').hidden = liste.length > 0;
    liste.forEach((m) => {
      const bakiye = Number(m.Bakiye) || 0;
      const bakiyeCls = bakiye > 0 ? 'bakiye-borc' : bakiye < 0 ? 'bakiye-alacak' : '';
      let rozet = null;
      if (bakiye > 0.005) rozet = { metin: 'Borçlu', sinif: 'rozet-tehlikeli' };
      else if (bakiye < -0.005) rozet = { metin: 'Alacaklı', sinif: 'rozet-yeterli' };
      ul.appendChild(
        kartListeHtml({
          baslik: musteriGorunenAd(m),
          alt: `${m.Telefon ? esc(m.Telefon) + ' · ' : ''}#${m.MusteriID}`,
          tutar: para(bakiye),
          tutarCls: bakiyeCls,
          rozet,
          tikla: () => musteriDetayAc(m.MusteriID),
        }),
      );
    });
  }

  async function musteriDetayAc(id) {
    detayMusteriID = id;
    panelGoster('musteri-detay');
    const ozet = $('musteriDetayOzet');
    const ul = $('musteriHareketListe');
    ozet.innerHTML = '<p>Yükleniyor…</p>';
    ul.innerHTML = '';
    try {
      const res = await apiFetch(`/api/musteri/${id}/hareketler`);
      if (!res.ok) throw new Error('Detay alınamadı');
      const data = await res.json();
      const m = data.musteri;
      const bakiye = Number(m.Bakiye) || 0;
      const bakiyeCls = bakiye > 0 ? 'bakiye-borc' : bakiye < 0 ? 'bakiye-alacak' : '';
      ozet.innerHTML = `
        <h2>${esc(musteriGorunenAd(m))}</h2>
        <p class="kart-alt">${m.Telefon ? esc(m.Telefon) : ''} ${m.Il ? '· ' + esc(m.Il) : ''}</p>
        <p class="detay-bakiye ${bakiyeCls}">${para(bakiye)}</p>
        <p class="kart-alt">Bakiye ${bakiye > 0 ? '(borç)' : bakiye < 0 ? '(alacak)' : ''}</p>`;
      $('btnMusteriOdeme').disabled = bakiye <= 0;
      const html = (data.hareketler || []).map((h) => hareketMobilHtml(h)).join('');
      ul.innerHTML = html || '<li class="bos-metin">Hareket yok</li>';
    } catch (e) {
      console.error(e);
      ozet.innerHTML = '<p class="bakiye-borc">Yüklenemedi</p>';
    }
  }

  function odemeDialogAc() {
    const m = musteriCache.find((x) => x.MusteriID === detayMusteriID);
    if (!m) return;
    $('dlgOdemeMusteri').textContent = musteriGorunenAd(m);
    const bakiye = Number(m.Bakiye) || 0;
    $('odemeTutar').value = bakiye > 0 ? bakiye.toFixed(2) : '';
    $('dlgOdeme').showModal();
  }

  async function odemeKaydet(ev) {
    ev.preventDefault();
    if (demoOkumaModuMu()) {
      toast('Demo süresi doldu — tahsilat yapılamaz');
      return;
    }
    const tutar = parseFloat($('odemeTutar').value);
    if (!Number.isFinite(tutar) || tutar <= 0) {
      toast('Geçerli tutar girin');
      return;
    }
    try {
      const res = await apiFetch(`/api/musteri/${detayMusteriID}/odeme`, {
        method: 'POST',
        body: JSON.stringify({
          tutar,
          odemeSekli: $('odemeSekli').value,
          kullanici: aktifKullanici,
          aciklama: 'Mobil tahsilat',
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.success !== false) {
        $('dlgOdeme').close();
        toast('Tahsilat kaydedildi');
        await veriYukle();
        await gunlukKasaYukle();
        await musteriDetayAc(detayMusteriID);
      } else {
        toast(payload.message || 'Tahsilat kaydedilemedi');
      }
    } catch (e) {
      console.error(e);
      toast('Bağlantı hatası');
    }
  }

  /* ——— Olaylar ——— */
  function init() {
    const savedApi = localStorage.getItem(LS_API);
    const savedUser = localStorage.getItem(LS_USER);
    const apiEl = $('apiBase');
    if (apiEl) apiEl.value = savedApi || varsayilanApiBase();
    const baglanti = $('loginBaglanti');
    if (baglanti && savedApi && savedApi.replace(/\/+$/, '') !== varsayilanApiBase().replace(/\/+$/, '')) {
      baglanti.open = true;
    }
    if (savedUser) {
      $('kullaniciAdi').value = savedUser;
    } else {
      hizliGirisDoldur();
    }

    $('btnHizliGiris').onclick = () => {
      hizliGirisDoldur();
      girisYap();
    };
    $('btnGiris').onclick = girisYap;
    $('sifre').addEventListener('keydown', (e) => { if (e.key === 'Enter') girisYap(); });
    $('kullaniciAdi').addEventListener('keydown', (e) => { if (e.key === 'Enter') girisYap(); });
    $('btnCikis').onclick = () => { if (confirm('Çıkış yapılsın mı?')) cikisYap(); };

    $('satisArama').addEventListener('input', (e) => satisAramaGoster(e.target.value));
    $('satisArama').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = e.target.value.trim();
      const filtre = stokCache.filter((s) => stokAraEsles(s, q));
      if (filtre.length === 1) sepeteEkle(filtre[0]);
      else if (filtre.length === 0) toast('Ürün bulunamadı');
    });
    $('btnSepetTemizle').onclick = () => { sepet = []; sepetCiz(); };
    $('btnSatisTamamla').onclick = satisDialogAc;
    $('formSatis').onsubmit = satisKaydet;
    $('satisMusteriAra').addEventListener('input', (e) => satisMusteriAraGoster(e.target.value));
    document.querySelectorAll('[data-dialog-close]').forEach((b) => {
      b.onclick = () => b.closest('dialog')?.close();
    });

    $('stokArama').addEventListener('input', stokListele);
    $('musteriArama').addEventListener('input', musteriListele);
    $('musteriSadeceBorc').addEventListener('change', musteriListele);

    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.onclick = () => {
        const nav = btn.dataset.nav;
        panelGoster(nav);
        if (nav === 'stok') stokListele();
        if (nav === 'musteri') musteriListele();
        if (nav === 'recete') recetePanelAc();
      };
    });

    $('btnMusteriGeri').onclick = () => {
      panelGoster('musteri');
      musteriListele();
    };
    $('btnMusteriRecete').onclick = musteriReceteAc;
    $('btnMusteriReceteGeri').onclick = () => {
      panelGoster('musteri-detay');
    };
    $('btnMobilReceteYeni').onclick = mobilReceteYeniAc;
    $('btnMobilReceteYeniGeri').onclick = () => {
      mobilReceteModGoster('liste');
      mobilReceteKayitliListeYukle(mobilReceteSeciliKayitID);
    };
    $('btnMobilReceteGoruntuleGeri').onclick = () => {
      mobilReceteModGoster('liste');
      mobilReceteKayitliListeYukle(mobilReceteSeciliKayitID);
    };
    $('btnMusteriOdeme').onclick = odemeDialogAc;
    $('formOdeme').onsubmit = odemeKaydet;

    $('btnMobilReceteHesapla').onclick = () => {
      mobilReceteHesapla('mobilReceteSonuc', 'mobilReceteUrun', 'mobilReceteDekar', false);
    };
    $('btnMobilReceteHesaplaMus').onclick = () => {
      mobilReceteHesapla(
        'mobilReceteSonucMus',
        'mobilReceteUrunMus',
        'mobilReceteDekarMus',
        true,
        detayMusteriID,
      );
    };
    $('btnMobilReceteKaydet').onclick = mobilReceteKaydet;

    document.querySelectorAll('input[name="odemeTipi"]').forEach((r) => {
      r.addEventListener('change', () => {
        const v = document.querySelector('input[name="odemeTipi"]:checked')?.value;
        const t = $('satisTahsilat');
        const toplam = Math.round(sepetToplamHesapla() * 100) / 100;
        if (v === 'Veresiye') t.value = '0';
        else if (!$('satisMusteriID').value) t.value = toplam.toFixed(2);
      });
    });

    showView('login');
    sepetCiz();
  }

  window.TarimMobilCore = {
    apiFetch,
    $,
    esc,
    para,
    toast,
    demoOkumaModuMu,
    get aktifKullanici() { return aktifKullanici; },
    veriYukle,
    get stokCache() { return stokCache; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
