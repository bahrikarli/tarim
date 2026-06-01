-- Boş [tarim] veritabanına [elektrik] ile aynı tablo yapısını kopyalar (veri kopyalanmaz).
-- sqlcmd -S localhost -U sa -P "sifre" -i tarim-sema-elektrikten.sql

USE [tarim];
GO

DECLARE @t NVARCHAR(128);
DECLARE @sql NVARCHAR(500);

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
SELECT name FROM [elektrik].sys.tables WHERE schema_id = SCHEMA_ID('dbo') ORDER BY name;

OPEN cur;
FETCH NEXT FROM cur INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF OBJECT_ID(CONCAT('dbo.', @t), 'U') IS NULL
  BEGIN
    SET @sql = N'SELECT * INTO dbo.' + QUOTENAME(@t) + N' FROM [elektrik].dbo.' + QUOTENAME(@t) + N' WHERE 1=0;';
    EXEC sp_executesql @sql;
    PRINT CONCAT(N'Olusturuldu: ', @t);
  END
  FETCH NEXT FROM cur INTO @t;
END
CLOSE cur;
DEALLOCATE cur;
GO

PRINT N'Sema kopyasi tamam.';
GO
