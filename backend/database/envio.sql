-- =====================================================================
--  Envío opcional · mínimo que se puede apagar, costo que puede variar
--
--  Dos cosas que hasta ahora eran obligatorias y un número fijo:
--
--  1. La compra mínima. Antes se apagaba poniendo 0, pero la carta
--     igual mostraba «Mínimo $0», que no quiere decir nada. Ahora se
--     prende y se apaga, y el monto queda guardado para cuando la
--     vuelvan a usar.
--
--  2. El costo del envío. Poner 0 significaba «sin cargo», que es una
--     mentira cuando el local lo manda por Uber y el precio lo pone
--     otro. Con esto el cliente lee «a cotizar», el envío no entra en
--     el total y el pedido queda marcado para que el local sepa que
--     tiene que cobrarlo aparte.
--
--  Se puede volver a correr: las columnas se agregan sólo si faltan.
--
--  El IF NOT EXISTS de ADD COLUMN existe desde MySQL 8.0.29 y MariaDB
--  10.0, así que acá se arma a mano para que ande en cualquiera.
-- =====================================================================

SET NAMES utf8mb4;


-- ---------------------------------------------------------------------
-- tenant_settings · los dos interruptores
-- ---------------------------------------------------------------------

SET @hay_envio := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tenant_settings'
    AND COLUMN_NAME = 'min_order_enabled'
);

SET @sql := IF(
  @hay_envio = 0,
  'ALTER TABLE `tenant_settings`
     ADD COLUMN `delivery_fee_variable` TINYINT(1) NOT NULL DEFAULT 0
       COMMENT ''el costo lo pone otro (Uber y parecidos): se cotiza aparte''
       AFTER `delivery_fee`,
     ADD COLUMN `min_order_enabled` TINYINT(1) NOT NULL DEFAULT 1
       COMMENT ''si no, se puede pedir a domicilio por cualquier monto''
       AFTER `min_order`',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Un local que tenía el mínimo en 0 no estaba exigiendo nada, así que
-- arranca con el interruptor apagado y la carta deja de mostrarlo. Va
-- condicionado a la misma bandera: si la migración ya corrió, no se
-- vuelve a pisar lo que el local haya elegido después.
SET @sql := IF(
  @hay_envio = 0,
  'UPDATE `tenant_settings` SET `min_order_enabled` = 0 WHERE `min_order` <= 0',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- orders · si el envío de ESE pedido quedó a cotizar
--
-- No alcanza con mirar la configuración del local: cambia, y entonces
-- los pedidos viejos se contarían mal. Un `shipping` en 0 tampoco
-- distingue entre «sin cargo» y «todavía no se sabe». Se guarda con el
-- pedido, como el eta_text.
-- ---------------------------------------------------------------------

SET @hay_ped := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'shipping_variable'
);

SET @sql := IF(
  @hay_ped = 0,
  'ALTER TABLE `orders`
     ADD COLUMN `shipping_variable` TINYINT(1) NOT NULL DEFAULT 0
       COMMENT ''el envío se cotizó aparte: `shipping` no lo incluye''
       AFTER `shipping`',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
