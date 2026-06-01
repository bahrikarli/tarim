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
    const ids = ['btnSatisTamamla', 'btnSepetTemizle', 'btnMusteriOdeme', 'btnHizliGiris'];
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

  function stokAraEsles(stok, q) {
    const raw = String(q || '').trim();
    if (!raw) return false;
    const lower = raw.toLocaleLowerCase('tr-TR');
    const ad = String(stok.UrunAdi || '').toLocaleLowerCase('tr-TR');
    const barkod = String(stok.Barkod || '').trim();
    if (/^\d+$/.test(raw) && barkod === raw) return true;
    if (ad.includes(lower)) return true;
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
    const baslik = { satis: 'Satış', stok: 'Stok', musteri: 'Cari', 'musteri-detay': 'Cari detay' };
    $('headerBaslik').textContent = baslik[id] || 'TARIM';
    $('bottomNav').hidden = id === 'musteri-detay';
    if (id !== 'musteri-detay') {
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
    sepetCiz();
    showView('login');
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
      await gunlukKasaYukle();
    } catch (e) {
      console.error(e);
      toast('Veri yüklenemedi');
    }
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
        li.innerHTML = `
          <span class="sepet-ad">${esc(s.urunAdi)}</span>
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
      btn.innerHTML = `<span><span>${esc(u.UrunAdi)}</span><span class="arama-item-alt">Stok: ${u.MevcutMiktar} ${esc(u.Birim || 'Adet')}</span></span><span class="arama-item-fiyat">${para(u.SatisFiyati)}</span>`;
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
    $('apiBase').value = savedApi || varsayilanApiBase();
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
      };
    });

    $('btnMusteriGeri').onclick = () => {
      panelGoster('musteri');
      musteriListele();
    };
    $('btnMusteriOdeme').onclick = odemeDialogAc;
    $('formOdeme').onsubmit = odemeKaydet;

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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
