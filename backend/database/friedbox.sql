-- =====================================================================
--  Friedbox · carta de demostración
--
--  Se importa después de foodix.sql y pedidos.sql, que son los que
--  crean el esquema. Este archivo sólo carga datos.
--
--  Es contenido genérico a propósito: nombres, precios y textos están
--  puestos para que la demo se vea completa, no porque sean los del
--  local. Cuando el cliente mande su carta real, se reemplazan estas
--  filas y nada más; ninguna pantalla tiene nombres de platos escritos
--  adentro.
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
  ('friedbox', 'Friedbox', 'Pollo crocante, papas y salsa. En caja.');

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
   'fuego', 'grilla', 1, 1);

INSERT INTO `menus` (`tenant_id`, `slug`, `name`, `is_default`, `sort_order`) VALUES
  (@t, 'principal', 'Carta', 1, 0);

SET @m := LAST_INSERT_ID();

INSERT INTO `order_counters` (`tenant_id`, `next_number`) VALUES (@t, 1001)
  ON DUPLICATE KEY UPDATE `next_number` = `next_number`;


-- ---------------------------------------------------------------------
-- Rubros
-- ---------------------------------------------------------------------

INSERT INTO `categories` (`tenant_id`, `menu_id`, `slug`, `name`, `sort_order`) VALUES
  (@t, @m, 'boxes',     'Boxes',           10),
  (@t, @m, 'pollo',     'Pollo',           20),
  (@t, @m, 'burgers',   'Burgers',         30),
  (@t, @m, 'milanesas', 'Milanesas',       40),
  (@t, @m, 'acompanar', 'Para acompañar',  50),
  (@t, @m, 'postres',   'Postres',         60),
  (@t, @m, 'bebidas',   'Bebidas',         70);

SET @c_boxes     := (SELECT `id` FROM `categories` WHERE `menu_id` = @m AND `slug` = 'boxes');
SET @c_pollo     := (SELECT `id` FROM `categories` WHERE `menu_id` = @m AND `slug` = 'pollo');
SET @c_burgers   := (SELECT `id` FROM `categories` WHERE `menu_id` = @m AND `slug` = 'burgers');
SET @c_milas     := (SELECT `id` FROM `categories` WHERE `menu_id` = @m AND `slug` = 'milanesas');
SET @c_acompanar := (SELECT `id` FROM `categories` WHERE `menu_id` = @m AND `slug` = 'acompanar');
SET @c_postres   := (SELECT `id` FROM `categories` WHERE `menu_id` = @m AND `slug` = 'postres');
SET @c_bebidas   := (SELECT `id` FROM `categories` WHERE `menu_id` = @m AND `slug` = 'bebidas');


-- ---------------------------------------------------------------------
-- Platos
--
-- Las fotos son las mismas provisorias de Unsplash que ya estaban en el
-- proyecto (ver frontend/public/img/platos/CREDITOS.md). Los platos que
-- no tienen foto no quedan con un hueco: caen en el dibujo vectorial a
-- partir de art_shape y art_hue.
-- ---------------------------------------------------------------------

INSERT INTO `products`
  (`tenant_id`, `menu_id`, `category_id`, `slug`, `name`, `description`,
   `price`, `image_path`, `art_shape`, `art_hue`, `badge`, `is_popular`, `sort_order`)
VALUES
  -- Boxes
  (@t, @m, @c_boxes, 'f-box-individual', 'Box individual',
   'Seis piezas de pollo crocante, papas bastón y una salsa a elección.',
   14900.00, NULL, 'tabla', 28, NULL, 1, 10),
  (@t, @m, @c_boxes, 'f-box-dupla', 'Box para dos',
   'Doce piezas, papas grandes y dos salsas. Alcanza para dos.',
   25900.00, NULL, 'docena', 20, 'Para 2', 1, 20),
  (@t, @m, @c_boxes, 'f-box-familiar', 'Box familiar',
   'Veinte piezas, dos papas grandes y cuatro salsas.',
   42900.00, NULL, 'rabas', 10, 'Para 4', 0, 30),
  (@t, @m, @c_boxes, 'f-box-mixto', 'Box mixto',
   'Mitad pollo, mitad aros de cebolla, con papas y salsa.',
   17900.00, NULL, 'papas', 44, NULL, 0, 40),

  -- Pollo
  (@t, @m, @c_pollo, 'f-tiras', 'Tiras de pollo',
   'Pechuga en tiras con rebozado crocante. Seis unidades.',
   11900.00, NULL, 'milanesa', 32, NULL, 1, 10),
  (@t, @m, @c_pollo, 'f-alitas', 'Alitas',
   'Ocho alitas glaseadas en salsa picante de la casa.',
   12900.00, NULL, 'rabas', 14, NULL, 1, 20),
  (@t, @m, @c_pollo, 'f-nuggets', 'Nuggets',
   'Diez nuggets de pechuga con la salsa que elijas.',
   9800.00, NULL, 'rabas', 40, NULL, 0, 30),
  (@t, @m, @c_pollo, 'f-pollo-entero', 'Pollo entero',
   'Pollo entero crocante, cortado en ocho presas.',
   23900.00, NULL, 'milanesa', 26, NULL, 0, 40),
  (@t, @m, @c_pollo, 'f-sandwich', 'Sándwich de pollo',
   'Pechuga crocante, lechuga, tomate y mayonesa de la casa en pan de papa.',
   12400.00, NULL, 'burger', 30, NULL, 0, 50),

  -- Burgers
  (@t, @m, @c_burgers, 'f-burger-clasica', 'Clásica',
   'Medallón de 160 g, cheddar, lechuga, tomate y salsa de la casa.',
   12900.00, '/img/platos/b-clasica.jpg', 'burger', 30, NULL, 1, 10),
  (@t, @m, @c_burgers, 'f-burger-doble', 'Doble cheddar y panceta',
   'Dos medallones, doble cheddar fundido, panceta crocante y pepinos.',
   16400.00, '/img/platos/b-doble.jpg', 'burger', 26, 'La más pedida', 1, 20),
  (@t, @m, @c_burgers, 'f-burger-blue', 'Azul y cebolla quemada',
   'Queso azul, cebolla caramelizada al malbec y rúcula.',
   15900.00, '/img/platos/b-blue.jpg', 'burger', 34, NULL, 0, 30),
  (@t, @m, @c_burgers, 'f-burger-veggie', 'Veggie de porotos negros',
   'Medallón de porotos negros, palta y alioli de ajo asado.',
   13400.00, '/img/platos/b-veggie.jpg', 'burger', 96, NULL, 0, 40),

  -- Milanesas
  (@t, @m, @c_milas, 'f-mila-comun', 'Milanesa con papas',
   'Milanesa de ternera con papas bastón.',
   15900.00, '/img/platos/m-comun.jpg', 'milanesa', 30, NULL, 0, 10),
  (@t, @m, @c_milas, 'f-mila-napo', 'Napolitana',
   'Milanesa con jamón, salsa de tomate y mozzarella gratinada.',
   17900.00, '/img/platos/m-napo.jpg', 'milanesa', 12, NULL, 1, 20),
  (@t, @m, @c_milas, 'f-mila-berenjena', 'De berenjena',
   'Berenjena rebozada, la misma cocción, sin carne.',
   14400.00, '/img/platos/m-berenjena.jpg', 'milanesa', 280, NULL, 0, 30),

  -- Para acompañar
  (@t, @m, @c_acompanar, 'f-papas', 'Papas bastón',
   'Corte grueso, doble fritura. Para uno o para compartir de a dos.',
   7400.00, '/img/platos/p-papas-bravas.jpg', 'papas', 38, NULL, 1, 10),
  (@t, @m, @c_acompanar, 'f-papas-cheddar', 'Papas con cheddar y panceta',
   'Papas bastón, cheddar fundido y panceta crocante por encima.',
   10900.00, NULL, 'papas', 42, NULL, 1, 20),
  (@t, @m, @c_acompanar, 'f-aros', 'Aros de cebolla',
   'Cebolla en aros con rebozado crocante. Diez unidades.',
   7900.00, NULL, 'rabas', 44, NULL, 0, 30),
  (@t, @m, @c_acompanar, 'f-rabas', 'Rabas',
   'Calamar rebozado liviano, limón y mayonesa de perejil.',
   13800.00, '/img/platos/p-rabas.jpg', 'rabas', 30, NULL, 0, 40),
  (@t, @m, @c_acompanar, 'f-ensalada', 'Ensalada de la casa',
   'Verdes, tomate, zanahoria y aderezo de mostaza.',
   6900.00, '/img/platos/v-mixta.jpg', 'ensalada', 110, NULL, 0, 50),

  -- Postres
  (@t, @m, @c_postres, 'f-brownie', 'Brownie con helado',
   'Brownie tibio de chocolate con una bocha de crema americana.',
   7900.00, '/img/platos/d-brownie.jpg', 'brownie', 22, NULL, 0, 10),
  (@t, @m, @c_postres, 'f-flan', 'Flan casero',
   'Flan de huevo con dulce de leche y crema.',
   6400.00, '/img/platos/d-flan.jpg', 'flan', 36, NULL, 0, 20),
  (@t, @m, @c_postres, 'f-tiramisu', 'Tiramisú',
   'Café, mascarpone y cacao amargo.',
   7400.00, '/img/platos/d-tiramisu.jpg', 'brownie', 28, NULL, 0, 30),

  -- Bebidas
  (@t, @m, @c_bebidas, 'f-gaseosa', 'Gaseosa',
   'Lata de 354 ml. Elegís el sabor.',
   3200.00, '/img/platos/x-gaseosa.jpg', 'vaso', 10, NULL, 0, 10),
  (@t, @m, @c_bebidas, 'f-agua', 'Agua',
   'Botella de 500 ml, con gas o sin gas.',
   2600.00, '/img/platos/x-agua.jpg', 'botella', 200, NULL, 0, 20),
  (@t, @m, @c_bebidas, 'f-limonada', 'Limonada',
   'Limonada con menta y jengibre, jarra de 500 ml.',
   4200.00, '/img/platos/x-limonada.jpg', 'vaso', 70, NULL, 0, 30),
  (@t, @m, @c_bebidas, 'f-cerveza', 'Cerveza',
   'Rubia artesanal, botella de 473 ml.',
   5200.00, '/img/platos/x-cerveza.jpg', 'botella', 40, NULL, 0, 40);


-- ---------------------------------------------------------------------
-- Etiquetas
-- ---------------------------------------------------------------------

INSERT INTO `product_tags` (`product_id`, `tag`)
SELECT `id`, 'veg' FROM `products` WHERE `menu_id` = @m AND `slug` IN
  ('f-burger-veggie', 'f-mila-berenjena', 'f-aros', 'f-ensalada',
   'f-brownie', 'f-flan', 'f-tiramisu', 'f-agua', 'f-limonada');

INSERT INTO `product_tags` (`product_id`, `tag`)
SELECT `id`, 'hot' FROM `products` WHERE `menu_id` = @m AND `slug` = 'f-alitas';


-- ---------------------------------------------------------------------
-- Opciones
-- ---------------------------------------------------------------------

INSERT INTO `option_groups`
  (`tenant_id`, `menu_id`, `slug`, `name`, `type`, `is_required`,
   `min_choices`, `max_choices`, `sort_order`)
VALUES
  (@t, @m, 'salsa',       'Elegí tu salsa',   'single', 1, 1, 1, 10),
  (@t, @m, 'punto',       'Punto de cocción', 'single', 1, 1, 1, 10),
  (@t, @m, 'guarnicion',  'Guarnición',       'single', 1, 1, 1, 10),
  (@t, @m, 'tamano',      'Tamaño',           'single', 1, 1, 1, 10),
  (@t, @m, 'sabor',       'Sabor',            'single', 1, 1, 1, 10),
  (@t, @m, 'extras',      'Sumale algo',      'multi',  0, 0, 4, 20);

SET @g_salsa      := (SELECT `id` FROM `option_groups` WHERE `menu_id` = @m AND `slug` = 'salsa');
SET @g_punto      := (SELECT `id` FROM `option_groups` WHERE `menu_id` = @m AND `slug` = 'punto');
SET @g_guarnicion := (SELECT `id` FROM `option_groups` WHERE `menu_id` = @m AND `slug` = 'guarnicion');
SET @g_tamano     := (SELECT `id` FROM `option_groups` WHERE `menu_id` = @m AND `slug` = 'tamano');
SET @g_sabor      := (SELECT `id` FROM `option_groups` WHERE `menu_id` = @m AND `slug` = 'sabor');
SET @g_extras     := (SELECT `id` FROM `option_groups` WHERE `menu_id` = @m AND `slug` = 'extras');

INSERT INTO `option_choices`
  (`tenant_id`, `option_group_id`, `slug`, `name`, `price_delta`, `is_default`, `sort_order`)
VALUES
  (@t, @g_salsa, 'barbacoa',  'Barbacoa',                   0.00, 1, 10),
  (@t, @g_salsa, 'cheddar',   'Cheddar',                    0.00, 0, 20),
  (@t, @g_salsa, 'alioli',    'Alioli de ajo asado',        0.00, 0, 30),
  (@t, @g_salsa, 'picante',   'Picante de la casa',         0.00, 0, 40),
  (@t, @g_salsa, 'mostaza',   'Mostaza y miel',             0.00, 0, 50),

  (@t, @g_punto, 'jugoso',    'Jugoso',                     0.00, 0, 10),
  (@t, @g_punto, 'apunto',    'A punto',                    0.00, 1, 20),
  (@t, @g_punto, 'cocido',    'Bien cocido',                0.00, 0, 30),

  (@t, @g_guarnicion, 'papas',         'Papas bastón',      0.00, 1, 10),
  (@t, @g_guarnicion, 'pure',          'Puré de papas',     0.00, 0, 20),
  (@t, @g_guarnicion, 'ensalada',      'Ensalada mixta',    0.00, 0, 30),
  (@t, @g_guarnicion, 'papas-cheddar', 'Papas con cheddar', 2400.00, 0, 40),

  (@t, @g_tamano, 'individual', 'Individual',            0.00, 1, 10),
  (@t, @g_tamano, 'grande',     'Grande · para dos',  2900.00, 0, 20),

  (@t, @g_sabor, 'cola',       'Cola',                      0.00, 1, 10),
  (@t, @g_sabor, 'cola-light', 'Cola sin azúcar',           0.00, 0, 20),
  (@t, @g_sabor, 'lima',       'Lima limón',                0.00, 0, 30),
  (@t, @g_sabor, 'naranja',    'Naranja',                   0.00, 0, 40),

  (@t, @g_extras, 'cheddar',  'Cheddar extra',           1300.00, 0, 10),
  (@t, @g_extras, 'panceta',  'Panceta crocante',        1900.00, 0, 20),
  (@t, @g_extras, 'medallon', 'Medallón adicional',      3400.00, 0, 30),
  (@t, @g_extras, 'huevo',    'Huevo frito',              900.00, 0, 40),
  (@t, @g_extras, 'pepinos',  'Pepinos agridulces',       600.00, 0, 50);


-- Qué grupo va en qué plato.
INSERT INTO `product_option_groups` (`product_id`, `option_group_id`, `sort_order`)
SELECT `id`, @g_salsa, 10 FROM `products` WHERE `menu_id` = @m AND `slug` IN
  ('f-box-individual', 'f-box-dupla', 'f-box-familiar', 'f-box-mixto',
   'f-tiras', 'f-alitas', 'f-nuggets', 'f-aros');

INSERT INTO `product_option_groups` (`product_id`, `option_group_id`, `sort_order`)
SELECT `id`, @g_punto, 10 FROM `products` WHERE `menu_id` = @m AND `slug` IN
  ('f-burger-clasica', 'f-burger-doble', 'f-burger-blue');

INSERT INTO `product_option_groups` (`product_id`, `option_group_id`, `sort_order`)
SELECT `id`, @g_extras, 20 FROM `products` WHERE `menu_id` = @m AND `slug` IN
  ('f-burger-clasica', 'f-burger-doble', 'f-burger-blue', 'f-burger-veggie',
   'f-sandwich');

INSERT INTO `product_option_groups` (`product_id`, `option_group_id`, `sort_order`)
SELECT `id`, @g_guarnicion, 10 FROM `products` WHERE `menu_id` = @m AND `slug` IN
  ('f-mila-comun', 'f-mila-napo', 'f-mila-berenjena', 'f-pollo-entero');

INSERT INTO `product_option_groups` (`product_id`, `option_group_id`, `sort_order`)
SELECT `id`, @g_tamano, 10 FROM `products` WHERE `menu_id` = @m AND `slug` IN
  ('f-papas', 'f-papas-cheddar');

INSERT INTO `product_option_groups` (`product_id`, `option_group_id`, `sort_order`)
SELECT `id`, @g_sabor, 10 FROM `products` WHERE `menu_id` = @m AND `slug` = 'f-gaseosa';


-- ---------------------------------------------------------------------
-- Promos y cupones
-- ---------------------------------------------------------------------

INSERT INTO `promos`
  (`tenant_id`, `menu_id`, `slug`, `kicker`, `title`, `body`, `product_id`, `sort_order`)
VALUES
  (@t, @m, 'promo-box', 'De lunes a jueves',
   'Box para dos con la segunda salsa sin cargo',
   'Doce piezas, papas grandes y dos salsas al precio de una.',
   (SELECT `id` FROM `products` WHERE `menu_id` = @m AND `slug` = 'f-box-dupla'), 10),
  (@t, @m, 'promo-alitas', 'Después de las 22',
   'Alitas con papas incluidas',
   'La papa bastón va sin cargo en los pedidos de delivery de la noche.',
   (SELECT `id` FROM `products` WHERE `menu_id` = @m AND `slug` = 'f-alitas'), 20);

INSERT INTO `coupons` (`tenant_id`, `code`, `type`, `value`, `label`) VALUES
  (@t, 'FRIEDBOX10',  'percent',    10.00, '10% de descuento'),
  (@t, 'PRIMERA',     'fixed',    3000.00, '$3.000 de descuento'),
  (@t, 'ENVIOGRATIS', 'shipping',    0.00, 'Envío sin cargo');
