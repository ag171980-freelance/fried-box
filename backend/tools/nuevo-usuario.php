<?php

declare(strict_types=1);

/**
 * Da de alta (o actualiza) un usuario del panel.
 *
 *   php backend/tools/nuevo-usuario.php friedbox vos@ejemplo.com "Tu Nombre"
 *   php backend/tools/nuevo-usuario.php friedbox vos@ejemplo.com "Tu Nombre" --clave=loquesea
 *
 * Sin --clave, la pide por teclado y no la muestra mientras se escribe.
 * Es el camino recomendado: una contraseña escrita en la línea de
 * comandos queda en el historial de la terminal.
 *
 * Si el mail ya existe, le cambia la contraseña y el nombre en vez de
 * fallar, y cierra todas sus sesiones abiertas.
 */

$root = dirname(__DIR__);

spl_autoload_register(static function (string $class) use ($root): void {
    $prefix = 'Foodix\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $file = $root . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

use Foodix\Support\Database;

/* --- argumentos ---------------------------------------------------- */

$args = array_slice($argv, 1);
$opts = [];
$pos = [];

foreach ($args as $a) {
    if (preg_match('/^--([a-z]+)=(.*)$/', $a, $m) === 1) {
        $opts[$m[1]] = $m[2];
    } else {
        $pos[] = $a;
    }
}

if (count($pos) < 3) {
    fwrite(STDERR, <<<USO

    Falta algo. Se usa así:

      php backend/tools/nuevo-usuario.php <local> <mail> "<nombre>" [--clave=...]

    Ejemplo:
      php backend/tools/nuevo-usuario.php friedbox ana@friedbox.com "Ana"


    USO);
    exit(1);
}

[$slug, $email, $nombre] = $pos;
$email = mb_strtolower(trim($email));

if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    fwrite(STDERR, "\n  «{$email}» no parece un mail.\n\n");
    exit(1);
}

/* --- contraseña ---------------------------------------------------- */

$clave = $opts['clave'] ?? null;

if ($clave === null) {
    echo "\n  Contraseña para $email: ";

    // En una terminal de verdad se apaga el eco para que no se vea lo
    // que se escribe. En Windows sin shell POSIX eso no existe, así que
    // se avisa en vez de fingir que está oculta.
    $ocultar = stripos(PHP_OS_FAMILY, 'Windows') === false && @shell_exec('which stty') !== null;

    if ($ocultar) {
        shell_exec('stty -echo');
        $clave = trim((string) fgets(STDIN));
        shell_exec('stty echo');
        echo "\n";
    } else {
        echo "(se va a ver mientras la escribís) ";
        $clave = trim((string) fgets(STDIN));
    }
}

if (mb_strlen($clave) < 8) {
    fwrite(STDERR, "\n  La contraseña necesita al menos 8 caracteres.\n\n");
    exit(1);
}

/* --- alta ----------------------------------------------------------- */

$config = require $root . '/config/config.php';

try {
    $db = Database::connect($config['db']);
} catch (Throwable $e) {
    fwrite(STDERR, "\n  No se pudo conectar con la base. Revisá el .env.\n\n");
    exit(1);
}

$stmt = $db->prepare('SELECT id, name FROM tenants WHERE slug = :s');
$stmt->execute(['s' => $slug]);
$tenant = $stmt->fetch();

if ($tenant === false) {
    fwrite(STDERR, "\n  No hay ningún local con el slug «{$slug}».\n\n");
    exit(1);
}

$hash = password_hash($clave, PASSWORD_BCRYPT, ['cost' => 12]);

$stmt = $db->prepare('SELECT id FROM users WHERE email = :e');
$stmt->execute(['e' => $email]);
$existente = $stmt->fetchColumn();

if ($existente !== false) {
    $db->prepare(
        'UPDATE users SET tenant_id = :t, password_hash = :h, name = :n, is_active = 1 WHERE id = :id',
    )->execute(['t' => $tenant['id'], 'h' => $hash, 'n' => $nombre, 'id' => $existente]);

    // Cambiar la clave echa a quien estuviera adentro con la vieja.
    $db->prepare('DELETE FROM sessions WHERE user_id = :id')->execute(['id' => $existente]);

    echo "\n  Listo. Se actualizó $email y se cerraron sus sesiones.\n";
} else {
    $db->prepare(
        'INSERT INTO users (tenant_id, email, password_hash, name, role)
         VALUES (:t, :e, :h, :n, \'owner\')',
    )->execute(['t' => $tenant['id'], 'e' => $email, 'h' => $hash, 'n' => $nombre]);

    echo "\n  Listo. $email ya puede entrar al panel de {$tenant['name']}.\n";
}

echo "  El panel está en /admin\n\n";
