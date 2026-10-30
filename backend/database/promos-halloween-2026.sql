-- ---------------------------------------------------------------------
--  Friedbox · las tres promos de Halloween 2026
-- ---------------------------------------------------------------------
--
--  Viernes 30 de octubre, sábado 31 y domingo 1 de noviembre de 2026.
--
--  Van como aviso y no como descuento, a propósito: las tres regalan
--  algo por comprar (salsas, una salsa misteriosa, cake pops) y el
--  sistema sólo sabe descontar un porcentaje. Un 0 % sería mentira y un
--  porcentaje inventado sería peor. El local entrega el regalo; la carta
--  lo anuncia.
--
--  Por eso tampoco se usa la columna `days`: el cartel de los días sólo
--  se arma cuando hay porcentaje (ver promoTag en PromoModal.jsx), así
--  que con una promo de sólo aviso no se vería. Los días van escritos en
--  el kicker, donde el cliente los lee, y las fechas las maneja
--  starts_at / ends_at.
--
--  Sobre ends_at: la vigencia se compara con NOW() de MySQL, que puede
--  estar en UTC mientras el local vive en UTC-3. Termina a las 06:00 del
--  lunes para que, esté el servidor en la hora que esté, cubra todo el
--  domingo a la noche. Si sobra, sobra con el local cerrado.
--
--  OJO: las promos 1 y 3 hablan de papas, que hoy no están en la carta.
--  Ver la nota al pie.
--
--  Se puede volver a correr: si las promos ya existen, se actualizan en
--  lugar de duplicarse (la clave única es menu_id + slug). Para bajarlas
--  antes de tiempo alcanza con apagarlas desde el panel.
-- ---------------------------------------------------------------------

SET NAMES utf8mb4;

SET @t := (SELECT `id` FROM `tenants` WHERE `slug` = 'friedbox' LIMIT 1);

-- El menú por defecto del local, el mismo criterio que usa el panel.
SET @m := (
  SELECT `id` FROM `menus`
   WHERE `tenant_id` = @t
   ORDER BY `is_default` DESC, `sort_order` ASC, `id` ASC
   LIMIT 1
);

-- El box al que lleva el botón «Lo quiero». Es el más pedido y entra en
-- las dos promos que piden un box. Si no estuviera, queda NULL y la
-- promo se muestra igual, sólo que sin botón.
SET @wb1 := (
  SELECT `id` FROM `products`
   WHERE `tenant_id` = @t AND `slug` = 'f-wb-1'
   LIMIT 1
);

SET @desde := '2026-10-30 00:00:00';
SET @hasta := '2026-11-02 06:00:00';

INSERT INTO `promos`
  (`tenant_id`, `menu_id`, `slug`, `kicker`, `title`, `body`,
   `product_id`, `starts_at`, `ends_at`, `is_active`, `sort_order`)
VALUES
  -- 1. Papas. Sin product_id: todavía no hay papas en la carta.
  (@t, @m, 'halloween-papas',
   'Halloween · viernes a domingo',
   'Papas Halloween',
   'Estrenamos papas. Pedí el box de papas nuevas y van 2 salsas cheddar de regalo. Si preferís las clásicas, te regalamos 2 salsas extra.',
   NULL, @desde, @hasta, 1, 10),

  -- 2. Cualquier box de pollo. Es la única que funciona entera con la
  --    carta como está hoy.
  (@t, @m, 'halloween-pollo-embrujado',
   'Halloween · viernes a domingo',
   'Pollo embrujado',
   'Comprás tu box de pollo y te regalamos una salsa misteriosa. ¿Te animás a probarla?',
   @wb1, @desde, @hasta, 1, 20),

  -- 3. Box para 2 o más + papas. Todos los box menos el CB 1, que es
  --    para una persona.
  (@t, @m, 'halloween-dulce-o-truco',
   'Halloween · viernes a domingo',
   'Dulce o truco',
   'Pedí un box de pollo para 2 o más personas con papas y te llevás 2 cake pops de Halloween de regalo.',
   @wb1, @desde, @hasta, 1, 30)

ON DUPLICATE KEY UPDATE
  `kicker`     = VALUES(`kicker`),
  `title`      = VALUES(`title`),
  `body`       = VALUES(`body`),
  `product_id` = VALUES(`product_id`),
  `starts_at`  = VALUES(`starts_at`),
  `ends_at`    = VALUES(`ends_at`),
  `is_active`  = VALUES(`is_active`),
  `sort_order` = VALUES(`sort_order`);


-- ---------------------------------------------------------------------
--  Lo que falta para que las promos 1 y 3 se puedan pedir
--
--  La carta tiene nueve box de pollo y nada más: no hay papas. La promo
--  1 es sobre las papas enteras y la 3 las pide como condición, así que
--  hoy las dos anuncian algo que el cliente no puede agregar al pedido.
--
--  Se anuncian igual porque el posteo manda a escribir por WhatsApp,
--  pero lo que corresponde es cargar las papas como producto. Hace falta
--  saber cómo se llaman, cuánto salen y si el cheddar es una opción del
--  plato o va aparte. Con eso se agregan desde el panel en dos minutos,
--  o se amplía este archivo.
-- ---------------------------------------------------------------------
