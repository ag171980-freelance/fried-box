-- =====================================================================
--  Foodix · pedidos, pagos e historial
--
--  Se importa DESPUÉS de foodix.sql. Va aparte para que reimportar el
--  catálogo con datos nuevos no borre los pedidos que ya se hicieron.
--
--  TODO SE GUARDA CONGELADO
--  Cada línea de pedido copia el nombre y el precio del plato en el
--  momento de la compra. Si mañana sube la hamburguesa o se borra un
--  plato, el ticket de la semana pasada tiene que seguir diciendo lo
--  que decía. Por eso los FK a productos son ON DELETE SET NULL y al
--  lado hay columnas con la copia.
-- =====================================================================

USE `foodix`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `order_events`;
DROP TABLE IF EXISTS `order_item_options`;
DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `order_counters`;
SET FOREIGN_KEY_CHECKS = 1;


-- ---------------------------------------------------------------------
-- order_counters · numeración corta por local
--
-- El cliente no puede leer "ord_a1b2c3d4" por teléfono. Necesita un
-- número de tres o cuatro dígitos, y tiene que ser propio de cada local:
-- dos restaurantes distintos pueden tener los dos el pedido 1487.
--
-- Se incrementa con SELECT ... FOR UPDATE dentro de la transacción que
-- crea el pedido, así dos pedidos simultáneos no sacan el mismo número.
-- ---------------------------------------------------------------------
CREATE TABLE `order_counters` (
  `tenant_id`   BIGINT UNSIGNED NOT NULL,
  `next_number` INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`tenant_id`),
  CONSTRAINT `fk_counters_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------
CREATE TABLE `orders` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id`      BIGINT UNSIGNED NOT NULL,
  `menu_id`        BIGINT UNSIGNED NULL COMMENT 'con qué carta se pidió',

  -- Identificador público, imposible de adivinar. El número corto sirve
  -- para hablar; este sirve para la URL, porque quien tenga el enlace ve
  -- el pedido sin estar logueado.
  `public_id`      CHAR(26)     NOT NULL,
  `number`         INT UNSIGNED NOT NULL,

  `status`         ENUM('pendiente_de_pago','pago_rechazado','confirmado',
                        'cocina','camino','listo','entregado','cancelado')
                   NOT NULL DEFAULT 'pendiente_de_pago',
  `mode`           ENUM('delivery','pickup') NOT NULL,
  `payment_method` ENUM('mercadopago','efectivo','transferencia') NOT NULL,
  `payment_status` ENUM('pendiente','aprobado','rechazado','a_convenir')
                   NOT NULL DEFAULT 'pendiente',

  `customer_name`  VARCHAR(120) NOT NULL,
  `customer_phone` VARCHAR(40)  NOT NULL,
  `customer_email` VARCHAR(160) NULL,
  `address`        VARCHAR(200) NULL,
  `address_extra`  VARCHAR(80)  NULL,
  `note`           VARCHAR(300) NULL,
  `change_for`     DECIMAL(12,2) NULL COMMENT 'con cuánto paga, para el vuelto',

  `coupon_id`      BIGINT UNSIGNED NULL,
  `coupon_code`    VARCHAR(40)  NULL,

  `subtotal`       DECIMAL(12,2) NOT NULL,
  `discount`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `shipping`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total`          DECIMAL(12,2) NOT NULL,
  `currency`       CHAR(3)      NOT NULL DEFAULT 'ARS',
  `eta_text`       VARCHAR(40)  NULL,

  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `paid_at`        DATETIME NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_public_id` (`public_id`),
  UNIQUE KEY `uq_orders_tenant_number` (`tenant_id`, `number`),
  KEY `ix_orders_panel` (`tenant_id`, `status`, `created_at`),
  CONSTRAINT `fk_orders_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_orders_menu` FOREIGN KEY (`menu_id`)
    REFERENCES `menus` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_orders_coupon` FOREIGN KEY (`coupon_id`)
    REFERENCES `coupons` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- order_items · las líneas, con el precio congelado
-- ---------------------------------------------------------------------
CREATE TABLE `order_items` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`      BIGINT UNSIGNED NOT NULL,
  `product_id`    BIGINT UNSIGNED NULL,
  `product_slug`  VARCHAR(64)  NOT NULL,
  `name`          VARCHAR(160) NOT NULL,
  `base_price`    DECIMAL(12,2) NOT NULL COMMENT 'sin opciones',
  `unit_price`    DECIMAL(12,2) NOT NULL COMMENT 'con opciones',
  `qty`           SMALLINT UNSIGNED NOT NULL,
  `line_total`    DECIMAL(12,2) NOT NULL,
  `note`          VARCHAR(200) NULL,
  `sort_order`    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `ix_items_order` (`order_id`, `sort_order`),
  CONSTRAINT `fk_oitems_order` FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oitems_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- order_item_options · qué eligió y cuánto sumó
-- ---------------------------------------------------------------------
CREATE TABLE `order_item_options` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_item_id` BIGINT UNSIGNED NOT NULL,
  `choice_id`     BIGINT UNSIGNED NULL,
  `group_slug`    VARCHAR(64)  NOT NULL,
  `choice_slug`   VARCHAR(64)  NOT NULL,
  `name`          VARCHAR(120) NOT NULL,
  `price_delta`   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `sort_order`    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `ix_oio_item` (`order_item_id`, `sort_order`),
  CONSTRAINT `fk_oio_item` FOREIGN KEY (`order_item_id`)
    REFERENCES `order_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oio_choice` FOREIGN KEY (`choice_id`)
    REFERENCES `option_choices` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- order_events · quién movió el pedido y cuándo
--
-- El estado actual vive en orders.status, pero sin historial nadie
-- puede responder "¿a qué hora salió?" ni auditar un reclamo.
-- ---------------------------------------------------------------------
CREATE TABLE `order_events` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`   BIGINT UNSIGNED NOT NULL,
  `status`     VARCHAR(32)  NOT NULL,
  `note`       VARCHAR(200) NULL,
  `source`     ENUM('cliente','local','pasarela','sistema') NOT NULL DEFAULT 'sistema',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_events_order` (`order_id`, `created_at`),
  CONSTRAINT `fk_events_order` FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- payments · cada intento de cobro
--
-- Un pedido puede tener varios: se rechaza la tarjeta, reintenta, sale.
-- `provider_ref` es el id del pago en Mercado Pago y es único para que
-- un webhook repetido no cuente dos veces el mismo cobro.
-- ---------------------------------------------------------------------
CREATE TABLE `payments` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`     BIGINT UNSIGNED NOT NULL,
  `provider`     ENUM('mercadopago','efectivo','transferencia','simulado') NOT NULL,
  `provider_ref` VARCHAR(80)  NULL COMMENT 'id del pago en la pasarela',
  `status`       ENUM('pendiente','aprobado','rechazado','devuelto') NOT NULL,
  `amount`       DECIMAL(12,2) NOT NULL,
  `payload`      TEXT NULL COMMENT 'respuesta cruda de la pasarela, para auditar',
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_provider_ref` (`provider`, `provider_ref`),
  KEY `ix_payments_order` (`order_id`, `created_at`),
  CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Un contador por local existente.
INSERT INTO `order_counters` (`tenant_id`, `next_number`)
SELECT `id`, 1001 FROM `tenants`
ON DUPLICATE KEY UPDATE `next_number` = `next_number`;
