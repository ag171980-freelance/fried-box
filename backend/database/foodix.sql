-- =====================================================================
--  Foodix · esquema y datos de arranque
--  Importar entero desde phpMyAdmin (pestaña Importar).
--
--  MULTI-TENANT
--  Una sola base, un solo esquema, y una columna `tenant_id` en cada
--  tabla que pertenece a un local. Es el modelo más barato de operar
--  para muchos menús chicos: un backup, una migración, un pool de
--  conexiones. A cambio, la regla es innegociable: TODA consulta filtra
--  por tenant_id, sin excepción. Las claves únicas siempre incluyen el
--  alcance del tenant para que dos locales puedan tener el mismo slug.
--
--  IDENTIFICADORES PÚBLICOS
--  Hacia afuera se exponen slugs ('b-clasica'), no los ids numéricos.
--  Son estables, legibles en la URL y no filtran cuántos registros hay.
--
--  DINERO
--  DECIMAL(12,2), que en MySQL es exacto. Si algún día hace falta
--  operar en monedas con redondeos raros, se migra a enteros en la
--  unidad mínima; para pesos y esta escala, DECIMAL alcanza y sobra.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `foodix`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `foodix`;

DROP TABLE IF EXISTS `product_option_groups`;
DROP TABLE IF EXISTS `option_choices`;
DROP TABLE IF EXISTS `option_groups`;
DROP TABLE IF EXISTS `product_tags`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `promos`;
DROP TABLE IF EXISTS `coupons`;
DROP TABLE IF EXISTS `menus`;
DROP TABLE IF EXISTS `tenant_settings`;
DROP TABLE IF EXISTS `tenants`;

SET FOREIGN_KEY_CHECKS = 1;


-- ---------------------------------------------------------------------
-- tenants · un local / una cuenta
-- ---------------------------------------------------------------------
CREATE TABLE `tenants` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`       VARCHAR(64)  NOT NULL COMMENT 'clave pública: subdominio o /t/{slug}',
  `name`       VARCHAR(120) NOT NULL,
  `tagline`    VARCHAR(200) NULL,
  `status`     ENUM('activo','pausado','baja') NOT NULL DEFAULT 'activo',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenants_slug` (`slug`),
  KEY `ix_tenants_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- tenant_settings · lo operativo y lo visual, 1 a 1 con el local
-- ---------------------------------------------------------------------
CREATE TABLE `tenant_settings` (
  `tenant_id`          BIGINT UNSIGNED NOT NULL,
  `currency`           CHAR(3)      NOT NULL DEFAULT 'ARS',
  `locale`             VARCHAR(10)  NOT NULL DEFAULT 'es-AR',
  `timezone`           VARCHAR(64)  NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  `address`            VARCHAR(200) NULL,
  `phone`              VARCHAR(40)  NULL,
  `whatsapp`           VARCHAR(40)  NULL,
  `hours_text`         VARCHAR(160) NULL COMMENT 'texto libre hasta que haya horarios por día',
  `accepts_delivery`   TINYINT(1)   NOT NULL DEFAULT 1,
  `accepts_pickup`     TINYINT(1)   NOT NULL DEFAULT 1,
  `delivery_fee`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `min_order`          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `eta_delivery_min`   SMALLINT UNSIGNED NOT NULL DEFAULT 35,
  `eta_delivery_max`   SMALLINT UNSIGNED NOT NULL DEFAULT 50,
  `eta_pickup_min`     SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  `eta_pickup_max`     SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  -- Lo que hoy se elige a mano en el panel Modo diseño pasa a vivir acá.
  `theme`              VARCHAR(32)  NOT NULL DEFAULT 'sifon',
  `layout`             VARCHAR(32)  NOT NULL DEFAULT 'lista',
  `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`),
  CONSTRAINT `fk_settings_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- menus · un local puede tener varias cartas (almuerzo, noche, bar)
-- ---------------------------------------------------------------------
CREATE TABLE `menus` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id`  BIGINT UNSIGNED NOT NULL,
  `slug`       VARCHAR(64)  NOT NULL,
  `name`       VARCHAR(120) NOT NULL,
  `is_default` TINYINT(1)   NOT NULL DEFAULT 0,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  `sort_order` INT          NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_menus_tenant_slug` (`tenant_id`, `slug`),
  KEY `ix_menus_tenant_active` (`tenant_id`, `is_active`, `sort_order`),
  CONSTRAINT `fk_menus_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- categories · los rubros de una carta
-- ---------------------------------------------------------------------
CREATE TABLE `categories` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id`  BIGINT UNSIGNED NOT NULL,
  `menu_id`    BIGINT UNSIGNED NOT NULL,
  `slug`       VARCHAR(64)  NOT NULL,
  `name`       VARCHAR(120) NOT NULL,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  `sort_order` INT          NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_menu_slug` (`menu_id`, `slug`),
  KEY `ix_categories_listado` (`tenant_id`, `menu_id`, `is_active`, `sort_order`),
  CONSTRAINT `fk_categories_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_categories_menu` FOREIGN KEY (`menu_id`)
    REFERENCES `menus` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- products · los platos
--
-- `art_shape` y `art_hue` son el respaldo vectorial del front para un
-- plato que todavía no tiene foto. No es decoración: evita el hueco gris
-- mientras el local consigue las imágenes.
-- ---------------------------------------------------------------------
CREATE TABLE `products` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id`    BIGINT UNSIGNED NOT NULL,
  `menu_id`      BIGINT UNSIGNED NOT NULL,
  `category_id`  BIGINT UNSIGNED NOT NULL,
  `slug`         VARCHAR(64)   NOT NULL,
  `name`         VARCHAR(160)  NOT NULL,
  `description`  VARCHAR(400)  NULL,
  `price`        DECIMAL(12,2) NOT NULL,
  `image_path`   VARCHAR(255)  NULL,
  `art_shape`    VARCHAR(32)   NULL,
  `art_hue`      SMALLINT UNSIGNED NULL,
  `badge`        VARCHAR(40)   NULL COMMENT 'sello corto: "3 gratis", "Para 3"',
  `is_popular`   TINYINT(1)    NOT NULL DEFAULT 0,
  `is_available` TINYINT(1)    NOT NULL DEFAULT 1 COMMENT 'se acabó por hoy',
  `sort_order`   INT           NOT NULL DEFAULT 0,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_menu_slug` (`menu_id`, `slug`),
  KEY `ix_products_listado` (`tenant_id`, `menu_id`, `is_available`, `sort_order`),
  KEY `ix_products_categoria` (`category_id`, `sort_order`),
  CONSTRAINT `fk_products_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_products_menu` FOREIGN KEY (`menu_id`)
    REFERENCES `menus` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- product_tags · veggie, picante, sin TACC
--
-- Etiquetas planas a propósito. Son cuatro o cinco y las mismas para
-- todos los locales. Si algún día cada local quiere las suyas, esto se
-- promueve a tabla `tags` con pivote y se migra en una tarde.
-- ---------------------------------------------------------------------
CREATE TABLE `product_tags` (
  `product_id` BIGINT UNSIGNED NOT NULL,
  `tag`        VARCHAR(32) NOT NULL COMMENT 'veg | hot | sintacc | vegano',
  PRIMARY KEY (`product_id`, `tag`),
  CONSTRAINT `fk_tags_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- option_groups · "Punto de cocción", "Sumale algo"
--
-- Viven a nivel carta y se enganchan a varios platos, porque "Sumale
-- algo" es el mismo para las cuatro hamburguesas. Duplicarlo por plato
-- obligaría a corregir el precio de la panceta en cuatro lugares.
-- ---------------------------------------------------------------------
CREATE TABLE `option_groups` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id`   BIGINT UNSIGNED NOT NULL,
  `menu_id`     BIGINT UNSIGNED NOT NULL,
  `slug`        VARCHAR(64)  NOT NULL,
  `name`        VARCHAR(120) NOT NULL,
  `type`        ENUM('single','multi') NOT NULL DEFAULT 'single',
  `is_required` TINYINT(1)   NOT NULL DEFAULT 0,
  `min_choices` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `max_choices` TINYINT UNSIGNED NULL COMMENT 'NULL = sin tope',
  `sort_order`  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_groups_menu_slug` (`menu_id`, `slug`),
  KEY `ix_groups_tenant` (`tenant_id`),
  CONSTRAINT `fk_groups_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_groups_menu` FOREIGN KEY (`menu_id`)
    REFERENCES `menus` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- option_choices · cada opción y lo que suma al precio
-- ---------------------------------------------------------------------
CREATE TABLE `option_choices` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id`       BIGINT UNSIGNED NOT NULL,
  `option_group_id` BIGINT UNSIGNED NOT NULL,
  `slug`            VARCHAR(64)  NOT NULL,
  `name`            VARCHAR(120) NOT NULL,
  `price_delta`     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `is_default`      TINYINT(1)   NOT NULL DEFAULT 0,
  `is_available`    TINYINT(1)   NOT NULL DEFAULT 1,
  `sort_order`      INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_choices_group_slug` (`option_group_id`, `slug`),
  KEY `ix_choices_tenant` (`tenant_id`),
  CONSTRAINT `fk_choices_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_choices_group` FOREIGN KEY (`option_group_id`)
    REFERENCES `option_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- product_option_groups · qué grupos usa cada plato
-- ---------------------------------------------------------------------
CREATE TABLE `product_option_groups` (
  `product_id`      BIGINT UNSIGNED NOT NULL,
  `option_group_id` BIGINT UNSIGNED NOT NULL,
  `sort_order`      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`product_id`, `option_group_id`),
  KEY `ix_pog_group` (`option_group_id`),
  CONSTRAINT `fk_pog_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pog_group` FOREIGN KEY (`option_group_id`)
    REFERENCES `option_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- promos · la franja del día
-- ---------------------------------------------------------------------
CREATE TABLE `promos` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id`  BIGINT UNSIGNED NOT NULL,
  `menu_id`    BIGINT UNSIGNED NOT NULL,
  `slug`       VARCHAR(64)  NOT NULL,
  `kicker`     VARCHAR(80)  NULL,
  `title`      VARCHAR(160) NOT NULL,
  `body`       VARCHAR(300) NULL,
  `product_id` BIGINT UNSIGNED NULL COMMENT 'a qué plato lleva al tocarla',
  `starts_at`  DATETIME NULL,
  `ends_at`    DATETIME NULL,
  `is_active`  TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT        NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_promos_menu_slug` (`menu_id`, `slug`),
  KEY `ix_promos_vigencia` (`tenant_id`, `menu_id`, `is_active`, `starts_at`, `ends_at`),
  CONSTRAINT `fk_promos_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_promos_menu` FOREIGN KEY (`menu_id`)
    REFERENCES `menus` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_promos_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- coupons · a nivel local, no de carta
--
-- No los sirve el endpoint del menú: se validan del lado del servidor
-- cuando se cotiza el pedido. Están acá porque el esquema del catálogo
-- no se entiende sin ellos.
-- ---------------------------------------------------------------------
CREATE TABLE `coupons` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id`  BIGINT UNSIGNED NOT NULL,
  `code`       VARCHAR(40)  NOT NULL,
  `type`       ENUM('percent','fixed','shipping') NOT NULL,
  `value`      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `label`      VARCHAR(80)  NOT NULL,
  `min_order`  DECIMAL(12,2) NULL,
  `max_uses`   INT UNSIGNED NULL,
  `used_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `starts_at`  DATETIME NULL,
  `ends_at`    DATETIME NULL,
  `is_active`  TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_coupons_tenant_code` (`tenant_id`, `code`),
  CONSTRAINT `fk_coupons_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
--  DATOS DE ARRANQUE
--
--  Dos locales a propósito. El segundo no es relleno: sirve para
--  comprobar que el aislamiento funciona y que un local sin fotos cae
--  bien en el dibujo vectorial.
-- =====================================================================

INSERT INTO `tenants` (`id`, `slug`, `name`, `tagline`) VALUES
  (1, 'foodix', 'Foodix', 'Cocina de barrio, pedido en dos toques'),
  (2, 'cafe-rivas',    'Café Rivas', 'Tostado propio, mesa junto a la ventana');

INSERT INTO `tenant_settings`
  (`tenant_id`, `address`, `phone`, `hours_text`, `delivery_fee`, `min_order`,
   `eta_delivery_min`, `eta_delivery_max`, `eta_pickup_min`, `eta_pickup_max`,
   `theme`, `layout`, `accepts_delivery`)
VALUES
  (1, 'Av. Corrientes 2847, CABA', '+54 11 4000-0000',
      'Todos los días de 11:00 a 00:30', 1800.00, 6000.00, 35, 50, 15, 20, 'sifon', 'lista', 1),
  (2, 'Bulnes 1240, CABA', '+54 11 4777-1234',
      'De lunes a sábado de 8:00 a 20:00', 1500.00, 4000.00, 30, 45, 10, 15, 'tostado', 'grilla', 0);

INSERT INTO `menus` (`id`, `tenant_id`, `slug`, `name`, `is_default`, `sort_order`) VALUES
  (1, 1, 'principal', 'Carta principal', 1, 0),
  (2, 2, 'principal', 'Carta',           1, 0);

INSERT INTO `categories` (`id`, `tenant_id`, `menu_id`, `slug`, `name`, `sort_order`) VALUES
  (1, 1, 1, 'picar',      'Para picar', 10),
  (2, 1, 1, 'empanadas',  'Empanadas',  20),
  (3, 1, 1, 'burgers',    'Burgers',    30),
  (4, 1, 1, 'pizzas',     'Pizzas',     40),
  (5, 1, 1, 'milanesas',  'Milanesas',  50),
  (6, 1, 1, 'verde',      'Verde',      60),
  (7, 1, 1, 'postres',    'Postres',    70),
  (8, 1, 1, 'bebidas',    'Bebidas',    80),
  (9, 2, 2, 'cafe',        'Café',        10),
  (10, 2, 2, 'pasteleria', 'Pastelería',  20),
  (11, 2, 2, 'desayunos',  'Desayunos',   30);

INSERT INTO `products`
  (`id`, `tenant_id`, `menu_id`, `category_id`, `slug`, `name`, `description`,
   `price`, `image_path`, `art_shape`, `art_hue`, `badge`, `is_popular`, `sort_order`)
VALUES
  (1, 1, 1, 1, 'p-papas-bravas', 'Papas bravas',
   'Papas rústicas, alioli de ajo asado y salsa picante de la casa.',
   7400.00, '/img/platos/p-papas-bravas.jpg', 'papas', 38, NULL, 1, 10),
  (2, 1, 1, 1, 'p-provoleta', 'Provoleta al orégano',
   'Provolone a la plancha con orégano, aceite de oliva y pan tostado.',
   8900.00, '/img/platos/p-provoleta.jpg', 'provoleta', 44, NULL, 0, 20),
  (3, 1, 1, 1, 'p-rabas', 'Rabas del día',
   'Calamar rebozado liviano, limón y mayonesa de perejil.',
   13800.00, '/img/platos/p-rabas.jpg', 'rabas', 30, NULL, 0, 30),
  (4, 1, 1, 1, 'p-tabla', 'Tabla para compartir',
   'Quesos, fiambres, aceitunas y focaccia. Alcanza para tres.',
   19500.00, '/img/platos/p-tabla.jpg', 'tabla', 20, 'Para 3', 0, 40),

  (5, 1, 1, 2, 'e-carne', 'Empanada de carne cortada a cuchillo',
   'Carne braseada, cebolla de verdeo, huevo y aceituna.',
   2400.00, '/img/platos/e-carne.jpg', 'empanada', 36, NULL, 1, 10),
  (6, 1, 1, 2, 'e-jyq', 'Empanada de jamón y queso',
   'Jamón cocido natural y mozzarella. Repulgue a mano.',
   2200.00, '/img/platos/e-jyq.jpg', 'empanada', 48, NULL, 0, 20),
  (7, 1, 1, 2, 'e-humita', 'Empanada de humita',
   'Choclo cremoso, cebolla y un toque de nuez moscada.',
   2300.00, '/img/platos/e-humita.jpg', 'empanada', 52, NULL, 0, 30),
  (8, 1, 1, 2, 'e-docena', 'Docena surtida',
   'Doce empanadas a elección del cocinero. Siempre hay de carne.',
   24000.00, '/img/platos/e-docena.jpg', 'docena', 40, '3 gratis', 0, 40),

  (9, 1, 1, 3, 'b-clasica', 'Clásica Foodix',
   'Medallón de 160 g, cheddar, lechuga, tomate y salsa de la casa en pan de papa.',
   12900.00, '/img/platos/b-clasica.jpg', 'burger', 24, NULL, 1, 10),
  (10, 1, 1, 3, 'b-doble', 'Doble cheddar y panceta',
   'Dos medallones, doble cheddar fundido, panceta crocante y pepinos.',
   16400.00, '/img/platos/b-doble.jpg', 'burger', 18, 'La más pedida', 0, 20),
  (11, 1, 1, 3, 'b-blue', 'Azul y cebolla quemada',
   'Queso azul, cebolla caramelizada al malbec y rúcula.',
   15200.00, '/img/platos/b-blue.jpg', 'burger', 210, NULL, 0, 30),
  (12, 1, 1, 3, 'b-veggie', 'Veggie de porotos negros',
   'Medallón de porotos y quinoa, palta, tomate asado y mayonesa vegana.',
   13400.00, '/img/platos/b-veggie.jpg', 'burger', 128, NULL, 0, 40),

  (13, 1, 1, 4, 'z-muzza', 'Muzzarella',
   'Salsa de tomate San Marzano, muzzarella y aceitunas verdes.',
   14200.00, '/img/platos/z-muzza.jpg', 'pizza', 44, NULL, 0, 10),
  (14, 1, 1, 4, 'z-napo', 'Napolitana',
   'Muzzarella, rodajas de tomate, ajo y albahaca fresca.',
   16100.00, '/img/platos/z-napo.jpg', 'pizza', 8, NULL, 1, 20),
  (15, 1, 1, 4, 'z-fugazzeta', 'Fugazzeta rellena',
   'Doble masa, mucha muzzarella adentro y cebolla apenas dorada arriba.',
   18900.00, '/img/platos/z-fugazzeta.jpg', 'pizza', 50, 'De la casa', 0, 30),
  (16, 1, 1, 4, 'z-calabresa', 'Calabresa picante',
   'Longaniza calabresa, muzzarella y ají molido en aceite.',
   17400.00, '/img/platos/z-calabresa.jpg', 'pizza', 356, NULL, 0, 40),

  (17, 1, 1, 5, 'm-napo', 'Milanesa napolitana',
   'Nalga rebozada, salsa, jamón y muzzarella gratinada.',
   17800.00, '/img/platos/m-napo.jpg', 'milanesa', 34, NULL, 1, 10),
  (18, 1, 1, 5, 'm-comun', 'Milanesa a caballo',
   'Milanesa clásica con dos huevos fritos arriba.',
   16200.00, '/img/platos/m-comun.jpg', 'milanesa', 40, NULL, 0, 20),
  (19, 1, 1, 5, 'm-berenjena', 'Milanesa de berenjena',
   'Berenjena rebozada en panko con provenzal y limón.',
   14900.00, '/img/platos/m-berenjena.jpg', 'milanesa', 280, NULL, 0, 30),

  (20, 1, 1, 6, 'v-cesar', 'César con pollo grillado',
   'Lechuga romana, pollo, croutons de masa madre y aderezo césar.',
   13600.00, '/img/platos/v-cesar.jpg', 'ensalada', 120, NULL, 0, 10),
  (21, 1, 1, 6, 'v-bowl', 'Bowl de quinoa y palta',
   'Quinoa, palta, garbanzos tostados, zanahoria encurtida y tahini.',
   14200.00, '/img/platos/v-bowl.jpg', 'bowl', 96, NULL, 1, 20),
  (22, 1, 1, 6, 'v-mixta', 'Mixta grande',
   'Lechuga, tomate, cebolla morada y huevo. Simple y bien fría.',
   8900.00, '/img/platos/v-mixta.jpg', 'ensalada', 140, NULL, 0, 30),

  (23, 1, 1, 7, 'd-flan', 'Flan casero con dulce',
   'Flan de huevo con dulce de leche repostero y crema batida.',
   7200.00, '/img/platos/d-flan.jpg', 'flan', 32, NULL, 1, 10),
  (24, 1, 1, 7, 'd-brownie', 'Brownie tibio con helado',
   'Brownie de chocolate 70% y una bocha de crema americana.',
   8400.00, '/img/platos/d-brownie.jpg', 'brownie', 18, NULL, 0, 20),
  (25, 1, 1, 7, 'd-tiramisu', 'Tiramisú de la casa',
   'Mascarpone, café fuerte y cacao amargo. Porción generosa.',
   8900.00, '/img/platos/d-tiramisu.jpg', 'flan', 26, NULL, 0, 30),

  (26, 1, 1, 8, 'x-agua', 'Agua saborizada',
   'Pomelo o manzana. Botella de 500 ml.',
   3200.00, '/img/platos/x-agua.jpg', 'botella', 180, NULL, 0, 10),
  (27, 1, 1, 8, 'x-gaseosa', 'Gaseosa 500 ml',
   'Cola, lima limón o pomelo. Bien fría.',
   3600.00, '/img/platos/x-gaseosa.jpg', 'botella', 0, NULL, 0, 20),
  (28, 1, 1, 8, 'x-limonada', 'Limonada con menta y jengibre',
   'Jarra de un litro, alcanza para dos.',
   7800.00, '/img/platos/x-limonada.jpg', 'vaso', 74, NULL, 1, 30),
  (29, 1, 1, 8, 'x-cerveza', 'Cerveza artesanal IPA',
   'Pinta de 473 ml, tirada del día.',
   6400.00, '/img/platos/x-cerveza.jpg', 'vaso', 36, NULL, 0, 40),

  -- Café Rivas va sin fotos: el front cae en el dibujo vectorial.
  (30, 2, 2, 9, 'c-espresso', 'Espresso',
   'Blend de la casa, 18 g. Corto y con crema.',
   2800.00, NULL, 'vaso', 28, NULL, 0, 10),
  (31, 2, 2, 9, 'c-flat', 'Flat white',
   'Doble ristretto con leche texturada. Sin azúcar agregada.',
   3900.00, NULL, 'vaso', 34, NULL, 1, 20),
  (32, 2, 2, 9, 'c-filtrado', 'Filtrado del día',
   'Preguntá por el origen. Se sirve en jarra de 300 ml.',
   3400.00, NULL, 'vaso', 22, NULL, 0, 30),
  (33, 2, 2, 10, 'r-medialunas', 'Medialunas de manteca',
   'Recién horneadas. Precio por unidad.',
   1500.00, NULL, 'empanada', 42, NULL, 1, 10),
  (34, 2, 2, 10, 'r-budin', 'Budín de limón y amapola',
   'Porción generosa, con glaseado de limón.',
   3200.00, NULL, 'brownie', 48, NULL, 0, 20),
  (35, 2, 2, 11, 'r-completo', 'Desayuno completo',
   'Café a elección, jugo exprimido, dos medialunas y tostado.',
   8900.00, NULL, 'tabla', 30, 'Hasta las 12', 0, 10);

INSERT INTO `product_tags` (`product_id`, `tag`) VALUES
  (1, 'veg'), (2, 'veg'), (7, 'veg'), (12, 'veg'),
  (13, 'veg'), (14, 'veg'), (16, 'hot'),
  (19, 'veg'), (21, 'veg'), (22, 'veg'),
  (34, 'veg');

INSERT INTO `option_groups`
  (`id`, `tenant_id`, `menu_id`, `slug`, `name`, `type`, `is_required`, `min_choices`, `max_choices`, `sort_order`)
VALUES
  (1, 1, 1, 'punto',      'Punto de cocción', 'single', 1, 1, 1,    10),
  (2, 1, 1, 'extras',     'Sumale algo',      'multi',  0, 0, 4,    20),
  (3, 1, 1, 'guarnicion', 'Guarnición',       'single', 1, 1, 1,    10),
  (4, 1, 1, 'tamano',     'Tamaño',           'single', 1, 1, 1,    10),
  (5, 2, 2, 'tamano-cafe','Tamaño',           'single', 1, 1, 1,    10),
  (6, 2, 2, 'leche',      'Leche',            'single', 1, 1, 1,    20);

INSERT INTO `option_choices`
  (`id`, `tenant_id`, `option_group_id`, `slug`, `name`, `price_delta`, `is_default`, `sort_order`)
VALUES
  (1,  1, 1, 'jugoso',        'Jugoso',                     0.00, 0, 10),
  (2,  1, 1, 'apunto',        'A punto',                    0.00, 1, 20),
  (3,  1, 1, 'cocido',        'Bien cocido',                0.00, 0, 30),

  (4,  1, 2, 'cheddar',       'Cheddar extra',           1200.00, 0, 10),
  (5,  1, 2, 'panceta',       'Panceta crocante',        1900.00, 0, 20),
  (6,  1, 2, 'medallon',      'Medallón adicional',      3400.00, 0, 30),
  (7,  1, 2, 'huevo',         'Huevo frito',              900.00, 0, 40),
  (8,  1, 2, 'pepinos',       'Pepinos agridulces',       600.00, 0, 50),

  (9,  1, 3, 'papas',         'Papas bastón',               0.00, 1, 10),
  (10, 1, 3, 'pure',          'Puré de papas',              0.00, 0, 20),
  (11, 1, 3, 'ensalada',      'Ensalada mixta',             0.00, 0, 30),
  (12, 1, 3, 'papas-cheddar', 'Papas con cheddar',       2200.00, 0, 40),

  (13, 1, 4, 'individual',    'Individual · 4 porciones',   0.00, 1, 10),
  (14, 1, 4, 'grande',        'Grande · 8 porciones',    6800.00, 0, 20),

  (15, 2, 5, 'simple',        'Simple',                     0.00, 1, 10),
  (16, 2, 5, 'doble',         'Doble',                   1200.00, 0, 20),

  (17, 2, 6, 'entera',        'Entera',                     0.00, 1, 10),
  (18, 2, 6, 'descremada',    'Descremada',                 0.00, 0, 20),
  (19, 2, 6, 'almendras',     'De almendras',             900.00, 0, 30);

INSERT INTO `product_option_groups` (`product_id`, `option_group_id`, `sort_order`) VALUES
  (9, 1, 10),  (9, 2, 20),
  (10, 1, 10), (10, 2, 20),
  (11, 1, 10), (11, 2, 20),
  (12, 2, 10),
  (13, 4, 10), (14, 4, 10), (15, 4, 10), (16, 4, 10),
  (17, 3, 10), (18, 3, 10), (19, 3, 10),
  (30, 5, 10),
  (31, 5, 10), (31, 6, 20),
  (32, 5, 10), (32, 6, 20);

INSERT INTO `promos`
  (`id`, `tenant_id`, `menu_id`, `slug`, `kicker`, `title`, `body`, `product_id`, `sort_order`)
VALUES
  (1, 1, 1, 'promo-empanadas', 'Todos los martes',
   'Docena surtida a precio de nueve',
   'Pedís doce empanadas y pagás nueve. Se aplica al retirar por el local.', 8, 10),
  (2, 1, 1, 'promo-burger', 'Después de las 22',
   'Burger clásica con papas incluidas',
   'La papa bastón va sin cargo en los pedidos de delivery de la noche.', 9, 20),
  (3, 2, 2, 'promo-desayuno', 'Antes de las 12',
   'Desayuno completo con café doble',
   'El segundo café va sin cargo si venís antes del mediodía.', 35, 10);

INSERT INTO `coupons` (`tenant_id`, `code`, `type`, `value`, `label`) VALUES
  (1, 'FOODIX10',    'percent',  10.00,   '10% de descuento'),
  (1, 'PRIMERA',     'fixed',    3000.00, '$3.000 de descuento'),
  (1, 'ENVIOGRATIS', 'shipping', 0.00,    'Envío sin cargo'),
  (2, 'RIVAS15',     'percent',  15.00,   '15% de descuento');
