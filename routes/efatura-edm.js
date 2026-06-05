const { edmBaglantiTesti, edmConfigOku } = require('../lib/edm-efatura');
const {
  efaturaSatisOnizle,
  efaturaSatisKes,
  efaturaSatisBelgeAl,
  efaturaKayitliUblXml,
  efaturaSatisGorunumHtml,
  efaturaSatisUblHtml,
  efaturaSatisResmiHtml,
  efaturaEdmHtmlCanliIndirKaydet,
} = require('../lib/efatura-satis');

function registerEfaturaEdmRoutes(app, poolPromise) {
  app.get('/api/efatura/edm/durum', (req, res) => {
    const cfg = edmConfigOku();
    res.json({
      success: true,
      entegrator: 'EDM Bilişim',
      testModu: cfg.testModu,
      wsdlUrl: cfg.wsdlUrl,
      kullaniciTanimli: !!(cfg.username && cfg.password),
      hostname: cfg.hostname,
      application: cfg.application,
      gbAliasTanimli: !!String(process.env.EDM_GB_ALIAS || '').trim(),
    });
  });

  app.post('/api/efatura/edm/baglanti-testi', async (req, res) => {
    try {
      const sonuc = await edmBaglantiTesti();
      res.json(sonuc);
    } catch (err) {
      console.error('[EDM]', err);
      res.status(500).json({
        success: false,
        message: err.message || 'EDM test hatası',
      });
    }
  });

  app.get('/api/efatura/satis/:hareketID/onizle', async (req, res) => {
    try {
      const hareketID = parseInt(req.params.hareketID, 10);
      if (!Number.isInteger(hareketID) || hareketID < 1) {
        return res.status(400).json({ success: false, message: 'Geçersiz hareket.' });
      }
      const pool = await poolPromise;
      const sonuc = await efaturaSatisOnizle(pool, hareketID);
      if (!sonuc.success) return res.status(404).json(sonuc);
      res.json(sonuc);
    } catch (err) {
      console.error('[EFATURA]', err);
      res.status(500).json({ success: false, message: err.message || 'Önizleme hatası' });
    }
  });

  app.get('/api/efatura/satis/:hareketID/pdf', async (req, res) => {
    try {
      const hareketID = parseInt(req.params.hareketID, 10);
      if (!Number.isInteger(hareketID) || hareketID < 1) {
        return res.status(400).json({ success: false, message: 'Geçersiz hareket.' });
      }
      const pool = await poolPromise;
      const tamDeneme = String(req.query.deneme || '').toLowerCase() === 'edm';
      const sonuc = await efaturaSatisBelgeAl(pool, hareketID, 'pdf', { hizli: !tamDeneme });
      if (!sonuc.success) return res.status(502).json(sonuc);
      const dosya = `fatura-${sonuc.faturaNo || hareketID}`;
      if (sonuc.format === 'html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${dosya}.html"`);
        res.setHeader('X-Efatura-Kaynak', sonuc.kaynak || 'edm');
        return res.send(sonuc.html);
      }
      const buf = Buffer.from(sonuc.base64, 'base64');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${dosya}.pdf"`);
      res.setHeader('X-Efatura-Kaynak', sonuc.kaynak || 'edm');
      res.send(buf);
    } catch (err) {
      console.error('[EFATURA PDF]', err);
      res.status(500).json({ success: false, message: err.message || 'PDF alınamadı.' });
    }
  });

  app.get('/api/efatura/satis/:hareketID/resmi-html', async (req, res) => {
    try {
      const hareketID = parseInt(req.params.hareketID, 10);
      if (!Number.isInteger(hareketID) || hareketID < 1) {
        return res.status(400).json({ success: false, message: 'Geçersiz hareket.' });
      }
      const pool = await poolPromise;
      const sadeceKayitli = String(req.query.kayitli || '') === '1';
      const sonuc = await efaturaSatisResmiHtml(pool, hareketID, { sadeceKayitli });
      if (!sonuc.success || !sonuc.html) return res.status(502).json(sonuc);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Efatura-Kaynak', sonuc.kaynak || 'edm');
      res.send(sonuc.html);
    } catch (err) {
      console.error('[EFATURA RESMI HTML]', err);
      res.status(500).json({ success: false, message: err.message || 'Resmi HTML alınamadı.' });
    }
  });

  app.get('/api/efatura/satis/:hareketID/edm-html', async (req, res) => {
    try {
      const hareketID = parseInt(req.params.hareketID, 10);
      if (!Number.isInteger(hareketID) || hareketID < 1) {
        return res.status(400).json({ success: false, message: 'Geçersiz hareket.' });
      }
      const pool = await poolPromise;
      const sonuc = await efaturaSatisResmiHtml(pool, hareketID, { sadeceKayitli: false });
      if (!sonuc.success || !sonuc.html) return res.status(502).json(sonuc);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Efatura-Kaynak', sonuc.kaynak || 'edm');
      res.send(sonuc.html);
    } catch (err) {
      console.error('[EFATURA EDM HTML]', err);
      res.status(500).json({ success: false, message: err.message || 'EDM HTML alınamadı.' });
    }
  });

  app.post('/api/efatura/satis/:hareketID/edm-html-onbellek', async (req, res) => {
    try {
      const hareketID = parseInt(req.params.hareketID, 10);
      if (!Number.isInteger(hareketID) || hareketID < 1) {
        return res.status(400).json({ success: false, message: 'Geçersiz hareket.' });
      }
      const pool = await poolPromise;
      const sonuc = await efaturaEdmHtmlCanliIndirKaydet(pool, hareketID, { arkaPlan: true });
      res.json(sonuc.success ? { success: true, kaynak: sonuc.kaynak, faturaNo: sonuc.faturaNo } : sonuc);
    } catch (err) {
      console.error('[EFATURA EDM ONBELLEK]', err);
      res.status(500).json({ success: false, message: err.message || 'EDM HTML önbellek hatası' });
    }
  });

  app.get('/api/efatura/satis/:hareketID/ubl-html', async (req, res) => {
    try {
      const hareketID = parseInt(req.params.hareketID, 10);
      if (!Number.isInteger(hareketID) || hareketID < 1) {
        return res.status(400).json({ success: false, message: 'Geçersiz hareket.' });
      }
      const pool = await poolPromise;
      const sonuc = await efaturaSatisUblHtml(pool, hareketID);
      if (!sonuc.success) return res.status(404).json(sonuc);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Efatura-Kaynak', sonuc.kaynak || 'ubl');
      res.send(sonuc.html);
    } catch (err) {
      console.error('[EFATURA UBL HTML]', err);
      res.status(500).json({ success: false, message: err.message || 'UBL HTML oluşturulamadı.' });
    }
  });

  app.get('/api/efatura/satis/:hareketID/gorunum', async (req, res) => {
    try {
      const hareketID = parseInt(req.params.hareketID, 10);
      if (!Number.isInteger(hareketID) || hareketID < 1) {
        return res.status(400).json({ success: false, message: 'Geçersiz hareket.' });
      }
      const pool = await poolPromise;
      const yedek = String(req.query.yedek || '') === '1';
      const sonuc = await efaturaSatisGorunumHtml(pool, hareketID, { yedek });
      if (!sonuc.success) return res.status(404).json(sonuc);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(sonuc.html);
    } catch (err) {
      console.error('[EFATURA GORUNUM]', err);
      res.status(500).json({ success: false, message: err.message || 'Görünüm oluşturulamadı.' });
    }
  });

  app.get('/api/efatura/satis/:hareketID/xml', async (req, res) => {
    try {
      const hareketID = parseInt(req.params.hareketID, 10);
      if (!Number.isInteger(hareketID) || hareketID < 1) {
        return res.status(400).json({ success: false, message: 'Geçersiz hareket.' });
      }
      const pool = await poolPromise;
      const sonuc = await efaturaKayitliUblXml(pool, hareketID).then((ubl) => {
        if (!ubl.success) return ubl;
        return {
          success: true,
          format: 'xml',
          kaynak: ubl.kaynak,
          faturaNo: ubl.faturaNo,
          uuid: ubl.uuid,
          xml: ubl.xml,
        };
      });
      if (!sonuc.success) return res.status(502).json(sonuc);
      const dosya = `fatura-${sonuc.faturaNo || hareketID}.xml`;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${dosya}"`);
      if (sonuc.uyarilar) res.setHeader('X-Efatura-Uyari', sonuc.uyarilar.join(' '));
      res.send(sonuc.xml);
    } catch (err) {
      console.error('[EFATURA XML]', err);
      res.status(500).json({ success: false, message: err.message || 'XML alınamadı.' });
    }
  });

  app.post('/api/efatura/satis/:hareketID/kes', async (req, res) => {
    try {
      const hareketID = parseInt(req.params.hareketID, 10);
      if (!Number.isInteger(hareketID) || hareketID < 1) {
        return res.status(400).json({ success: false, message: 'Geçersiz hareket.' });
      }
      const pool = await poolPromise;
      const sonuc = await efaturaSatisKes(pool, hareketID);
      if (!sonuc.success) return res.status(400).json(sonuc);
      res.json(sonuc);
    } catch (err) {
      console.error('[EFATURA]', err);
      res.status(500).json({ success: false, message: err.message || 'e-Fatura kesim hatası' });
    }
  });
}

module.exports = { registerEfaturaEdmRoutes };
