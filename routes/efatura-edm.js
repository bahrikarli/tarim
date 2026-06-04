const { edmBaglantiTesti, edmConfigOku } = require('../lib/edm-efatura');

function registerEfaturaEdmRoutes(app) {
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
}

module.exports = { registerEfaturaEdmRoutes };
