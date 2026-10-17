-- =====================================================================
-- AJUSTES A LA BASE DE DATOS SIEF_IA (la del documento de Bases de Datos II)
-- Ejecutar DESPUES de haber corrido SQLQuery1_CreacionTablas.sql
-- Es seguro ejecutarlo varias veces: cada cambio se revisa antes de hacerlo.
-- ATENCION: NO vuelvas a correr SQLQuery1_CreacionTablas.sql despues de esto,
-- porque ese script BORRA la base de datos completa (DROP DATABASE).
-- =====================================================================
USE SIEF_IA;
GO

-- 1) Login: el modelo del documento no tiene correo ni contrasena.
IF COL_LENGTH('dbo.ESTUDIANTE', 'correo') IS NULL
  ALTER TABLE dbo.ESTUDIANTE ADD correo NVARCHAR(160) NULL, clave_hash NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.JURADO', 'correo') IS NULL
  ALTER TABLE dbo.JURADO ADD correo NVARCHAR(160) NULL, clave_hash NVARCHAR(100) NULL;
GO

-- Un correo no se puede repetir (varias filas sin correo si se permite)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ESTUDIANTE_correo')
  CREATE UNIQUE INDEX UX_ESTUDIANTE_correo ON dbo.ESTUDIANTE(correo) WHERE correo IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_JURADO_correo')
  CREATE UNIQUE INDEX UX_JURADO_correo ON dbo.JURADO(correo) WHERE correo IS NOT NULL;
GO

-- 2) Categoria: la pantalla de inscripcion la pide y el documento la dejo pendiente.
IF COL_LENGTH('dbo.PROYECTO', 'categoria') IS NULL
  ALTER TABLE dbo.PROYECTO ADD categoria NVARCHAR(80) NULL;
GO

-- 3) Reglas recomendadas en las "Recomendaciones" del documento.
--    Cada una va en su propio bloque: si tus datos de ejemplo la incumplen,
--    solo falla esa y no afecta a las demas.

-- Un jurado califica un proyecto una sola vez
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_EVALUACION_jurado_proyecto')
  ALTER TABLE dbo.EVALUACION
    ADD CONSTRAINT UQ_EVALUACION_jurado_proyecto UNIQUE (cedula_jurado, id_proyecto);
GO

-- Cada criterio aparece una sola vez por evaluacion
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_DETALLE_evaluacion_criterio')
  ALTER TABLE dbo.DETALLE_NOTA
    ADD CONSTRAINT UQ_DETALLE_evaluacion_criterio UNIQUE (id_evaluacion, criterio_evaluado);
GO

-- Los puntajes van de 1.0 a 5.0 (igual que los botones 1-5 de la pantalla del jurado)
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_DETALLE_puntaje')
  ALTER TABLE dbo.DETALLE_NOTA
    ADD CONSTRAINT CK_DETALLE_puntaje CHECK (puntaje BETWEEN 1.0 AND 5.0);
GO
