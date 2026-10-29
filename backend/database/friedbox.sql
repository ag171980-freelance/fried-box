-- =====================================================================
--  Friedbox · carta
--
--  Se importa después de foodix.sql y pedidos.sql, que son los que
--  crean el esquema. Este archivo sólo carga datos.
--
--  Platos y precios salen del menú impreso del local. Dirección,
--  teléfono y horario todavía son de relleno.
--
--  Se puede volver a correr cuantas veces haga falta: la limpieza de
--  abajo borra el local y el resto cae por las claves foráneas.
-- =====================================================================

SET NAMES utf8mb4;
-- El slug va literal en cada lugar: una variable de usuario llega con
-- la colación de la conexión y MySQL se niega a compararla contra una
-- columna utf8mb4_unicode_ci.

-- Los platos se borran a mano y primero. Casi todo cuelga del local con
-- ON DELETE CASCADE, pero products -> categories es RESTRICT: si se
-- borra el local de una, MySQL intenta llevarse los rubros con platos
-- todavía colgando y aborta. Si el local no existe, @viejo queda en
-- NULL y los dos DELETE no tocan nada.
SET @viejo := (SELECT `id` FROM `tenants` WHERE `slug` = 'friedbox');

DELETE FROM `products` WHERE `tenant_id` = @viejo;
DELETE FROM `tenants`  WHERE `id` = @viejo;

INSERT INTO `tenants` (`slug`, `name`, `tagline`) VALUES
  ('friedbox', 'Friedbox', 'Alitas y pechugas fritas. En caja.');

SET @t := LAST_INSERT_ID();

INSERT INTO `tenant_settings`
  (`tenant_id`, `address`, `phone`, `whatsapp`, `hours_text`,
   `delivery_fee`, `min_order`,
   `eta_delivery_min`, `eta_delivery_max`, `eta_pickup_min`, `eta_pickup_max`,
   `theme`, `layout`, `accepts_delivery`, `accepts_pickup`)
VALUES
  (@t, 'Av. Siempre Viva 1234, CABA', '+54 11 5000-0000', '+54 11 5000-0000',
   'Todos los días de 11:30 a 00:00',
   1900.00, 7000.00, 30, 45, 15, 20,
   'friedbox-claro', 'grilla', 1, 1);

INSERT INTO `menus` (`tenant_id`, `slug`, `name`, `is_default`, `sort_order`) VALUES
  (@t, 'principal', 'Carta', 1, 0);

SET @m := LAST_INSERT_ID();

INSERT INTO `order_counters` (`tenant_id`, `next_number`) VALUES (@t, 1001)
  ON DUPLICATE KEY UPDATE `next_number` = `next_number`;


-- ---------------------------------------------------------------------
-- Rubros
-- ---------------------------------------------------------------------

INSERT INTO `categories` (`tenant_id`, `menu_id`, `slug`, `name`, `sort_order`) VALUES
  (@t, @m, 'wings-box',   'Wings Box',   10),
  (@t, @m, 'mix-box',     'Mix Box',     20),
  (@t, @m, 'crunchy-box', 'Crunchy Box', 30);

SET @c_wings   := (SELECT `id` FROM `categories` WHERE `menu_id` = @m AND `slug` = 'wings-box');
SET @c_mix     := (SELECT `id` FROM `categories` WHERE `menu_id` = @m AND `slug` = 'mix-box');
SET @c_crunchy := (SELECT `id` FROM `categories` WHERE `menu_id` = @m AND `slug` = 'crunchy-box');


-- ---------------------------------------------------------------------
-- Platos
--
-- Todavía no hay fotos propias: los platos caen en el dibujo vectorial
-- a partir de art_shape y art_hue.
-- ---------------------------------------------------------------------

INSERT INTO `products`
  (`tenant_id`, `menu_id`, `category_id`, `slug`, `name`, `description`,
   `price`, `image_path`, `art_shape`, `art_hue`, `badge`, `is_popular`, `sort_order`)
VALUES
  -- Wings Box
  (@t, @m, @c_wings, 'f-wb-1', 'WB 1',
   '18 piezas de alitas fritas + 3 salsas. Comen hasta 2 personas.',
   22500.00, NULL, 'rabas', 14, 'Para 2', 1, 10),
  (@t, @m, @c_wings, 'f-wb-2', 'WB 2',
   '24 piezas de alitas fritas + 4 salsas. Comen hasta 3 personas.',
   27500.00, NULL, 'rabas', 14, 'Para 3', 0, 20),
  (@t, @m, @c_wings, 'f-wb-3', 'WB 3',
   '36 piezas de alitas fritas + 6 salsas. Comen hasta 4 personas.',
   35000.00, NULL, 'rabas', 14, 'Para 4', 0, 30),

  -- Mix Box
  (@t, @m, @c_mix, 'f-mb-1', 'MB 1',
   '18 piezas de alitas y pechugas fritas + 3 salsas. Comen hasta 2 personas.',
   26500.00, NULL, 'docena', 20, 'Para 2', 1, 10),
  (@t, @m, @c_mix, 'f-mb-2', 'MB 2',
   '24 piezas de alitas y pechugas fritas + 4 salsas. Comen hasta 3 personas.',
   31500.00, NULL, 'docena', 20, 'Para 3', 0, 20),
  (@t, @m, @c_mix, 'f-mb-3', 'MB 3',
   '36 piezas de alitas y pechugas fritas + 6 salsas. Comen hasta 4 personas.',
   41000.00, NULL, 'docena', 20, 'Para 4', 0, 30),

  -- Crunchy Box
  (@t, @m, @c_crunchy, 'f-cb-1', 'CB 1',
   '12 piezas de pechugas fritas + 3 salsas. Come 1 persona.',
   19500.00, NULL, 'milanesa', 32, 'Para 1', 1, 10),
  (@t, @m, @c_crunchy, 'f-cb-2', 'CB 2',
   '18 piezas de pechugas fritas + 4 salsas. Comen hasta 2 personas.',
   27000.00, NULL, 'milanesa', 32, 'Para 2', 0, 20),
  (@t, @m, @c_crunchy, 'f-cb-3', 'CB 3',
   '24 piezas de pechugas fritas + 6 salsas. Comen hasta 4 personas.',
   36000.00, NULL, 'milanesa', 32, 'Para 4', 0, 30);


-- ---------------------------------------------------------------------
-- Salsas
--
-- Cada box trae 3, 4 o 6 salsas, así que hay un grupo por cantidad con
-- las mismas seis salsas adentro. Se puede repetir: tres salsas pueden
-- ser dos de ajo y una barbacoa.
-- Son obligatorios: hay que elegir al menos una salsa o «Sin salsas».
-- ---------------------------------------------------------------------

INSERT INTO `option_groups`
  (`tenant_id`, `menu_id`, `slug`, `name`, `type`, `is_required`,
   `min_choices`, `max_choices`, `sort_order`)
VALUES
  (@t, @m, 'salsas-3', 'Elegí tus salsas', 'multi', 1, 1, 3, 10),
  (@t, @m, 'salsas-4', 'Elegí tus salsas', 'multi', 1, 1, 4, 10),
  (@t, @m, 'salsas-6', 'Elegí tus salsas', 'multi', 1, 1, 6, 10);

SET @g_salsas_3 := (SELECT `id` FROM `option_groups` WHERE `menu_id` = @m AND `slug` = 'salsas-3');
SET @g_salsas_4 := (SELECT `id` FROM `option_groups` WHERE `menu_id` = @m AND `slug` = 'salsas-4');
SET @g_salsas_6 := (SELECT `id` FROM `option_groups` WHERE `menu_id` = @m AND `slug` = 'salsas-6');

INSERT INTO `option_choices`
  (`tenant_id`, `option_group_id`, `slug`, `name`, `price_delta`, `is_default`, `sort_order`)
VALUES
  (@t, @g_salsas_3, 'mayo-ajo',      'Mayo de ajo',   0.00, 0, 10),
  (@t, @g_salsas_3, 'mayo-verdeo',   'Mayo verdeo',   0.00, 0, 20),
  (@t, @g_salsas_3, 'mayo-limon',    'Mayo limón',    0.00, 0, 30),
  (@t, @g_salsas_3, 'mayo-picante',  'Mayo picante',  0.00, 0, 40),
  (@t, @g_salsas_3, 'barbacoa',      'Barbacoa',      0.00, 0, 50),
  (@t, @g_salsas_3, 'mostaza-fried', 'Mostaza Fried', 0.00, 0, 60),
  (@t, @g_salsas_4, 'mayo-ajo',      'Mayo de ajo',   0.00, 0, 10),
  (@t, @g_salsas_4, 'mayo-verdeo',   'Mayo verdeo',   0.00, 0, 20),
  (@t, @g_salsas_4, 'mayo-limon',    'Mayo limón',    0.00, 0, 30),
  (@t, @g_salsas_4, 'mayo-picante',  'Mayo picante',  0.00, 0, 40),
  (@t, @g_salsas_4, 'barbacoa',      'Barbacoa',      0.00, 0, 50),
  (@t, @g_salsas_4, 'mostaza-fried', 'Mostaza Fried', 0.00, 0, 60),
  (@t, @g_salsas_6, 'mayo-ajo',      'Mayo de ajo',   0.00, 0, 10),
  (@t, @g_salsas_6, 'mayo-verdeo',   'Mayo verdeo',   0.00, 0, 20),
  (@t, @g_salsas_6, 'mayo-limon',    'Mayo limón',    0.00, 0, 30),
  (@t, @g_salsas_6, 'mayo-picante',  'Mayo picante',  0.00, 0, 40),
  (@t, @g_salsas_6, 'barbacoa',      'Barbacoa',      0.00, 0, 50),
  (@t, @g_salsas_6, 'mostaza-fried', 'Mostaza Fried', 0.00, 0, 60);

-- «Sin salsas» va sola: elegirla saca las salsas y al revés. Con los
-- grupos obligatorios, es lo que deja agregar un box sin ninguna.
INSERT INTO `option_choices`
  (`tenant_id`, `option_group_id`, `slug`, `name`, `price_delta`, `is_default`, `is_exclusive`, `sort_order`)
VALUES
  (@t, @g_salsas_3, 'sin-salsas', 'Sin salsas', 0.00, 0, 1, 70),
  (@t, @g_salsas_4, 'sin-salsas', 'Sin salsas', 0.00, 0, 1, 70),
  (@t, @g_salsas_6, 'sin-salsas', 'Sin salsas', 0.00, 0, 1, 70);

-- Qué grupo va en qué box.
INSERT INTO `product_option_groups` (`product_id`, `option_group_id`, `sort_order`)
SELECT `id`, @g_salsas_3, 10 FROM `products` WHERE `menu_id` = @m AND `slug` IN
  ('f-wb-1', 'f-mb-1', 'f-cb-1');

INSERT INTO `product_option_groups` (`product_id`, `option_group_id`, `sort_order`)
SELECT `id`, @g_salsas_4, 10 FROM `products` WHERE `menu_id` = @m AND `slug` IN
  ('f-wb-2', 'f-mb-2', 'f-cb-2');

INSERT INTO `product_option_groups` (`product_id`, `option_group_id`, `sort_order`)
SELECT `id`, @g_salsas_6, 10 FROM `products` WHERE `menu_id` = @m AND `slug` IN
  ('f-wb-3', 'f-mb-3', 'f-cb-3');
