/**
 * Tarım: ürün (pancar vb.), malzeme grubu, dekar dozajı, ambalaj alanları.
 */
async function ensureTarimSchema(pool) {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.TarimUrunler', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.TarimUrunler (
        TarimUrunID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UrunAdi NVARCHAR(100) NOT NULL,
        Aciklama NVARCHAR(300) NULL,
        Aktif BIT NOT NULL CONSTRAINT DF_TarimUrun_Aktif DEFAULT (1),
        KayitTarihi DATETIME NOT NULL CONSTRAINT DF_TarimUrun_Kayit DEFAULT (GETDATE())
      );
      CREATE UNIQUE INDEX UX_TarimUrunler_Ad ON dbo.TarimUrunler (UrunAdi);
    END

    IF OBJECT_ID(N'dbo.MalzemeGruplari', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.MalzemeGruplari (
        MalzemeGrupID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        GrupAdi NVARCHAR(150) NOT NULL,
        Notlar NVARCHAR(300) NULL,
        KayitTarihi DATETIME NOT NULL CONSTRAINT DF_MalzemeGrup_Kayit DEFAULT (GETDATE())
      );
      CREATE INDEX IX_MalzemeGruplari_Ad ON dbo.MalzemeGruplari (GrupAdi);
    END

    IF COL_LENGTH('dbo.MalzemeGruplari', 'DozajGerekli') IS NULL
      ALTER TABLE dbo.MalzemeGruplari ADD DozajGerekli BIT NOT NULL CONSTRAINT DF_MalzemeGrup_DozajGerekli DEFAULT (1);

    IF COL_LENGTH('dbo.Stok', 'MalzemeGrupID') IS NULL
      ALTER TABLE dbo.Stok ADD MalzemeGrupID INT NULL;
    IF COL_LENGTH('dbo.Stok', 'AmbalajMiktari') IS NULL
      ALTER TABLE dbo.Stok ADD AmbalajMiktari DECIMAL(18,3) NULL;
    IF COL_LENGTH('dbo.Stok', 'OlcuBirimi') IS NULL
      ALTER TABLE dbo.Stok ADD OlcuBirimi NVARCHAR(10) NULL;

    IF OBJECT_ID(N'dbo.UrunMalzemeDozaj', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.UrunMalzemeDozaj (
        DozajID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        TarimUrunID INT NOT NULL,
        MalzemeGrupID INT NOT NULL,
        MiktarDekar DECIMAL(18,4) NOT NULL CONSTRAINT DF_Dozaj_Miktar CHECK (MiktarDekar >= 0),
        Birim NVARCHAR(10) NOT NULL,
        CONSTRAINT FK_Dozaj_TarimUrun FOREIGN KEY (TarimUrunID) REFERENCES dbo.TarimUrunler(TarimUrunID) ON DELETE CASCADE,
        CONSTRAINT FK_Dozaj_MalzemeGrup FOREIGN KEY (MalzemeGrupID) REFERENCES dbo.MalzemeGruplari(MalzemeGrupID) ON DELETE CASCADE,
        CONSTRAINT UQ_Dozaj_Urun_Grup UNIQUE (TarimUrunID, MalzemeGrupID)
      );
      CREATE INDEX IX_Dozaj_MalzemeGrup ON dbo.UrunMalzemeDozaj (MalzemeGrupID);
    END

    IF OBJECT_ID(N'dbo.MusteriReceteler', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.MusteriReceteler (
        ReceteID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        MusteriID INT NOT NULL,
        TarimUrunID INT NULL,
        TarimUrunAdi NVARCHAR(100) NULL,
        Dekar DECIMAL(18,2) NOT NULL,
        Notlar NVARCHAR(500) NULL,
        Kullanici NVARCHAR(50) NULL,
        Tarih DATETIME NOT NULL CONSTRAINT DF_MusteriRecete_Tarih DEFAULT (GETDATE())
      );
      CREATE INDEX IX_MusteriReceteler_Musteri ON dbo.MusteriReceteler (MusteriID, Tarih DESC);
    END

    IF COL_LENGTH('dbo.MusteriReceteler', 'SatisYapildi') IS NULL
      ALTER TABLE dbo.MusteriReceteler ADD SatisYapildi BIT NOT NULL CONSTRAINT DF_MusteriRecete_Satis DEFAULT (0);
    IF COL_LENGTH('dbo.MusteriReceteler', 'SatisTarih') IS NULL
      ALTER TABLE dbo.MusteriReceteler ADD SatisTarih DATETIME NULL;
    IF COL_LENGTH('dbo.MusteriReceteler', 'SatisHareketID') IS NULL
      ALTER TABLE dbo.MusteriReceteler ADD SatisHareketID INT NULL;

    IF OBJECT_ID(N'dbo.StokBirimleri', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.StokBirimleri (
        BirimID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BirimKodu NVARCHAR(20) NOT NULL,
        Aciklama NVARCHAR(80) NULL,
        Sira INT NOT NULL CONSTRAINT DF_StokBirim_Sira DEFAULT (0),
        Aktif BIT NOT NULL CONSTRAINT DF_StokBirim_Aktif DEFAULT (1),
        KayitTarihi DATETIME NOT NULL CONSTRAINT DF_StokBirim_Kayit DEFAULT (GETDATE())
      );
      CREATE UNIQUE INDEX UX_StokBirimleri_Kod ON dbo.StokBirimleri (BirimKodu);
    END

    IF OBJECT_ID(N'dbo.MusteriReceteSatirlar', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.MusteriReceteSatirlar (
        SatirID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ReceteID INT NOT NULL,
        StokID INT NULL,
        UrunAdi NVARCHAR(150) NOT NULL,
        MalzemeGrupID INT NULL,
        MiktarDekar DECIMAL(18,4) NULL,
        Birim NVARCHAR(10) NOT NULL,
        ToplamIhtiyac DECIMAL(18,3) NOT NULL,
        SecimTip NVARCHAR(20) NULL,
        PlanJson NVARCHAR(MAX) NULL,
        CONSTRAINT FK_ReceteSatir_Recete FOREIGN KEY (ReceteID) REFERENCES dbo.MusteriReceteler(ReceteID) ON DELETE CASCADE
      );
      CREATE INDEX IX_ReceteSatir_Recete ON dbo.MusteriReceteSatirlar (ReceteID);
    END
  `);

  const urunSay = await pool.request().query('SELECT COUNT(*) AS n FROM dbo.TarimUrunler');
  if (Number(urunSay.recordset[0]?.n || 0) === 0) {
    await pool.request().query(`
      INSERT INTO dbo.TarimUrunler (UrunAdi) VALUES
        (N'Pancar'), (N'Bugday'), (N'Arpa'), (N'Misir'), (N'Ayçiçeği');
    `);
  }

  const birimSay = await pool.request().query('SELECT COUNT(*) AS n FROM dbo.StokBirimleri');
  if (Number(birimSay.recordset[0]?.n || 0) === 0) {
    await pool.request().query(`
      INSERT INTO dbo.StokBirimleri (BirimKodu, Aciklama, Sira) VALUES
        (N'Lt', N'Litre (sıvı)', 10),
        (N'Kg', N'Kilogram', 20),
        (N'Adet', N'Bidon, çuval, kutu adedi', 30),
        (N'Kutu', N'Kutu', 40),
        (N'Torba', N'Torba', 50);
    `);
  }

  console.log('[TARIM] Ürün / malzeme dozaj tabloları hazır.');
}

module.exports = { ensureTarimSchema };
