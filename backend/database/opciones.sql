-- =====================================================================
--  Opciones que van solas · «Sin salsas»
--
--  Para bases creadas antes de que foodix.sql trajera la columna
--  is_exclusive. Una opción que va sola no se combina con las demás de
--  su grupo: elegir «Sin salsas» saca las salsas, y elegir una salsa
--  saca «Sin salsas».
--
--  Se importa antes de volver a importar friedbox.sql, que ya usa la
--  columna. Se puede volver a correr: la columna se agrega sólo si falta.
-- =====================================================================

SET NAMES utf8mb4;

SET @hay := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'option_choices' AND COLUMN_NAME = 'is_exclusive'
);

SET @sql := IF(
  @hay = 0,
  'ALTER TABLE `option_choices`
     ADD COLUMN `is_exclusive` TINYINT(1) NOT NULL DEFAULT 0
       COMMENT ''va sola: «Sin salsas» no se combina con otras''
       AFTER `is_default`',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
