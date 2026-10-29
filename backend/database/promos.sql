-- =====================================================================
--  Promos con descuento · reglas de cuándo y a qué se aplican
--
--  Se importa después de admin.sql. Hasta ahora una promo era sólo un
--  aviso en la carta; con esto puede descontar de verdad: un porcentaje,
--  algunos días de la semana, sobre toda la carta o sobre algunos rubros
--  o platos. Una promo sin porcentaje sigue siendo sólo un aviso.
--  También puede llevar una imagen propia.
--
--  Se puede volver a correr: las columnas se agregan sólo si faltan y
--  las tablas nuevas se crean sólo si no existen.
-- =====================================================================

SET NAMES utf8mb4;


-- ---------------------------------------------------------------------
-- promos · el descuento y cuándo vale
--
-- days vacío (NULL) es todos los días. El día se mira en la hora de
-- Argentina, no en la del servidor: un lunes a las 22 en Buenos Aires
-- ya es martes en UTC.
-- ---------------------------------------------------------------------

SET @hay := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promos' AND COLUMN_NAME = 'discount_percent'
);

SET @sql := IF(
  @hay = 0,
  'ALTER TABLE `promos`
     ADD COLUMN `discount_percent` DECIMAL(5,2) NULL
       COMMENT ''NULL = sólo aviso, no descuenta''
       AFTER `product_id`,
     ADD COLUMN `days` SET(''lun'',''mar'',''mie'',''jue'',''vie'',''sab'',''dom'') NULL
       COMMENT ''NULL = todos los días''
       AFTER `discount_percent`,
     ADD COLUMN `applies_to` ENUM(''todo'',''rubros'',''platos'') NOT NULL DEFAULT ''todo''
       AFTER `days`',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- promos · imagen
--
-- Va en su propio bloque y no junto a las columnas del descuento: una
-- base que ya corrió la versión anterior de este archivo tiene esas y
-- le falta sólo esta.
-- ---------------------------------------------------------------------

SET @hay := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promos' AND COLUMN_NAME = 'image_path'
);

SET @sql := IF(
  @hay = 0,
  'ALTER TABLE `promos`
     ADD COLUMN `image_path` VARCHAR(255) NULL
       COMMENT ''NULL = la imagen genérica de la marca''
       AFTER `body`',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- promo_categories / promo_products · qué entra en la promo
--
-- Se miran sólo cuando applies_to dice rubros o platos. Si se borra un
-- rubro o un plato, sale solo de la promo.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `promo_categories` (
  `promo_id`    BIGINT UNSIGNED NOT NULL,
  `category_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`promo_id`, `category_id`),
  KEY `ix_promo_categories_category` (`category_id`),
  CONSTRAINT `fk_promo_categories_promo` FOREIGN KEY (`promo_id`)
    REFERENCES `promos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_promo_categories_category` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `promo_products` (
  `promo_id`   BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`promo_id`, `product_id`),
  KEY `ix_promo_products_product` (`product_id`),
  CONSTRAINT `fk_promo_products_promo` FOREIGN KEY (`promo_id`)
    REFERENCES `promos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_promo_products_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- orders · cuánto descontó la promo
--
-- Aparte de `discount`, que es el del cupón: el ticket muestra los dos
-- por separado y así se puede saber después qué vendió cada cosa.
-- ---------------------------------------------------------------------

SET @hay := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'promo_discount'
);

SET @sql := IF(
  @hay = 0,
  'ALTER TABLE `orders`
     ADD COLUMN `promo_discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER `discount`,
     ADD COLUMN `promo_label` VARCHAR(200) NULL
       COMMENT ''las promos que se aplicaron, como se mostraron''
       AFTER `promo_discount`',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
