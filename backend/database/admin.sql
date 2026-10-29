-- =====================================================================
--  Panel de administración · usuarios, sesiones y estado del local
--
--  Se importa después de foodix.sql y pedidos.sql. Agrega lo único que
--  el esquema original no tenía: quién puede entrar a administrar, y si
--  el local está tomando pedidos ahora mismo.
--
--  Se puede volver a correr: las tablas se recrean y las columnas se
--  agregan sólo si faltan.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- users · quién administra cada local
--
-- Un usuario pertenece a un local y no ve nada de los demás. La
-- contraseña nunca se guarda: se guarda el hash que devuelve
-- password_hash() de PHP, que ya trae su propia sal.
-- ---------------------------------------------------------------------

DROP TABLE IF EXISTS `sessions`;
DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id`     BIGINT UNSIGNED NOT NULL,
  `email`         VARCHAR(160) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `name`          VARCHAR(120) NOT NULL,
  `role`          ENUM('owner','staff') NOT NULL DEFAULT 'owner',
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `ix_users_tenant` (`tenant_id`, `is_active`),
  CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- sessions · el token que lleva el navegador
--
-- Se guarda el SHA-256 del token, no el token. Si alguien se lleva una
-- copia de la base, no se lleva sesiones abiertas: con el hash no puede
-- armar la cookie.
-- ---------------------------------------------------------------------

CREATE TABLE `sessions` (
  `token_hash`   CHAR(64) NOT NULL,
  `user_id`      BIGINT UNSIGNED NOT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at`   DATETIME NOT NULL,
  `last_seen_at` DATETIME NULL,
  PRIMARY KEY (`token_hash`),
  KEY `ix_sessions_user` (`user_id`),
  KEY `ix_sessions_vencimiento` (`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- tenant_settings · abierto o cerrado
--
-- Hasta ahora la carta decía «Abierto» escrito a mano en el front. Esto
-- lo convierte en un dato del local, que el panel prende y apaga y que
-- el backend mira antes de aceptar un pedido.
--
-- El IF NOT EXISTS de ADD COLUMN existe desde MySQL 8.0.29 y MariaDB
-- 10.0, así que acá se arma a mano para que ande en cualquiera.
-- ---------------------------------------------------------------------

SET @hay_is_open := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tenant_settings'
    AND COLUMN_NAME = 'is_open'
);

SET @sql := IF(
  @hay_is_open = 0,
  'ALTER TABLE `tenant_settings`
     ADD COLUMN `is_open` TINYINT(1) NOT NULL DEFAULT 1
       COMMENT ''si está tomando pedidos ahora mismo''
       AFTER `accepts_pickup`,
     ADD COLUMN `closed_message` VARCHAR(160) NULL
       COMMENT ''qué se le muestra al cliente mientras está cerrado''
       AFTER `is_open`',
  'DO 0'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- Usuario de demostración
--
-- La contraseña es «friedbox» y está acá sólo para poder abrir el panel
-- la primera vez. El hash es de bcrypt, generado con password_hash().
-- Cambiala antes de mostrarle esto a nadie:
--
--   php backend/tools/nuevo-usuario.php friedbox vos@ejemplo.com "Tu Nombre"
-- ---------------------------------------------------------------------

INSERT INTO `users` (`tenant_id`, `email`, `password_hash`, `name`, `role`)
SELECT `id`,
       'admin@friedbox.com',
       '$2y$12$VcEJeFZRT9q3TCpyVmyBkuVol8V/usZtsblUnUMPkNzzb1kZzjIOe',
       'Friedbox',
       'owner'
FROM `tenants` WHERE `slug` = 'friedbox';
