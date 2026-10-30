-- ---------------------------------------------------------------------
--  Foodix · la cuenta de cobro es de cada local, no del servidor
-- ---------------------------------------------------------------------
--
--  Hasta acá Mercado Pago era una sola clave en el .env: todo el dinero
--  de todos los locales caía en la misma cuenta. Con una marca sola no
--  se notaba. Con dos es la plata de otro.
--
--  Ahora cada local guarda su propio token, y mientras no lo cargue
--  simplemente no acepta Mercado Pago.
--
--  Sobre el cifrado: el token se guarda cifrado con la clave APP_KEY del
--  .env (ver src/Support/Secretos.php), no en texto plano. Lo que eso
--  protege es el caso realista en hosting compartido: un backup o un
--  dump de la base que se filtra. No protege contra que entren al
--  servidor entero, porque ahí también se llevan la clave. Por eso la
--  columna guarda base64 y no texto legible.
--
--  front_url es a dónde vuelve el cliente desde Mercado Pago. También
--  pasa a ser por local: cada marca tiene su propio sitio, y devolver a
--  todo el mundo al sitio de la primera marca manda al cliente al lugar
--  equivocado justo después de pagar.
--
--  Se puede correr sobre una base que ya está. Es idempotente y no borra
--  nada: los locales existentes quedan con las tres columnas vacías, que
--  es exactamente «todavía no cargó su cuenta».
--
--  Vacío significa «no configurado», igual que antes en el .env. Por eso
--  NOT NULL DEFAULT '' y no NULL: un solo caso que mirar, no dos.
-- ---------------------------------------------------------------------

SET @mp_token := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'tenant_settings'
     AND COLUMN_NAME = 'mp_access_token'
);

SET @sql := IF(@mp_token = 0,
  'ALTER TABLE `tenant_settings`
     ADD COLUMN `mp_access_token` VARCHAR(512) NOT NULL DEFAULT ''''
     COMMENT ''Access token de Mercado Pago del local, cifrado con APP_KEY''
     AFTER `layout`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @mp_secreto := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'tenant_settings'
     AND COLUMN_NAME = 'mp_webhook_secret'
);

SET @sql := IF(@mp_secreto = 0,
  'ALTER TABLE `tenant_settings`
     ADD COLUMN `mp_webhook_secret` VARCHAR(512) NOT NULL DEFAULT ''''
     COMMENT ''Clave secreta del webhook, cifrada con APP_KEY''
     AFTER `mp_access_token`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @front := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'tenant_settings'
     AND COLUMN_NAME = 'front_url'
);

SET @sql := IF(@front = 0,
  'ALTER TABLE `tenant_settings`
     ADD COLUMN `front_url` VARCHAR(200) NOT NULL DEFAULT ''''
     COMMENT ''Sitio público del local; vacío usa FRONT_URL del .env''
     AFTER `mp_webhook_secret`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
