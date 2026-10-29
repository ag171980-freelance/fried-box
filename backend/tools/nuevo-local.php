<?php

declare(strict_types=1);

/**
 * Da de alta un local.
 *
 *   php backend/tools/nuevo-local.php "Don Alberto"
 *   php backend/tools/nuevo-local.php "Don Alberto" --slug=alberto --tema=vermut
 *
 * Crea el local, su configuración y una carta vacía. El slug sale del
 * nombre: «Don Alberto» queda en /don-alberto, «Café Rivas» en
 * /cafe-rivas. Se puede forzar otro con --slug.
 *
 * Opciones: --tema, --estilo, --direccion, --telefono, --envio, --minimo.
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

/**
 * «Don Alberto» -> don-alberto
 * Se sacan los acentos primero: sin eso, «Café» terminaría en «caf-».
 */
function slugify(string $texto): string
{
    $texto = mb_strtolower(trim($texto), 'UTF-8');

    $acentos = [
        'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'ã' => 'a',
        'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
        'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o', 'õ' => 'o',
        'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u',
        'ñ' => 'n', 'ç' => 'c',
    ];
    $texto = strtr($texto, $acentos);

    $texto = preg_replace('/[^a-z0-9]+/', '-', $texto) ?? '';

    return trim($texto, '-');
}

/**
 * Palabras que no pueden ser un local porque chocarían con rutas de la
 * app o con carpetas servidas por el servidor web.
 */
const RESERVADOS = [
    'api', 'admin', 'assets', 'static', 'img', 'imagenes', 'public',
    'pedido', 'checkout', 'pago-simulado', 'health', 'menu', 'menus',
    'orders', 't', 'www',
];

/* --- argumentos ------------------------------------------------------ */
$args = array_slice($argv, 1);
$nombre = '';
$opts = [];

foreach ($args as $arg) {
    if (str_starts_with($arg, '--')) {
        [$k, $v] = array_pad(explode('=', substr($arg, 2), 2), 2, '');
        $opts[$k] = $v;
    } elseif ($nombre === '') {
        $nombre = $arg;
    }
}

if ($nombre === '') {
    fwrite(STDERR, "Falta el nombre del local.\n\n");
    fwrite(STDERR, "  php backend/tools/nuevo-local.php \"Don Alberto\"\n\n");
    exit(1);
}

$slug = slugify(($opts['slug'] ?? '') !== '' ? $opts['slug'] : $nombre);

if ($slug === '') {
    fwrite(STDERR, "De ese nombre no sale ningún slug usable. Pasá uno con --slug.\n");
    exit(1);
}

if (in_array($slug, RESERVADOS, true)) {
    fwrite(STDERR, "«{$slug}» está reservado y chocaría con una ruta de la app. Usá --slug.\n");
    exit(1);
}

/* --- alta ------------------------------------------------------------ */
/** @var array<string, mixed> $config */
$config = require $root . '/config/config.php';
$db = Foodix\Support\Database::connect($config['db']);

$existe = $db->prepare('SELECT name FROM tenants WHERE slug = :s LIMIT 1');
$existe->execute(['s' => $slug]);
if (($ya = $existe->fetchColumn()) !== false) {
    fwrite(STDERR, "Ya hay un local en /{$slug}: {$ya}\n");
    exit(1);
}

$db->beginTransaction();

try {
    $db->prepare('INSERT INTO tenants (slug, name, tagline) VALUES (:s, :n, :t)')
        ->execute(['s' => $slug, 'n' => $nombre, 't' => $opts['lema'] ?? null]);

    $tenantId = (int) $db->lastInsertId();

    $db->prepare(
        'INSERT INTO tenant_settings
           (tenant_id, address, phone, delivery_fee, min_order, theme, layout)
         VALUES (:id, :dir, :tel, :envio, :minimo, :tema, :estilo)',
    )->execute([
        'id' => $tenantId,
        'dir' => $opts['direccion'] ?? null,
        'tel' => $opts['telefono'] ?? null,
        'envio' => $opts['envio'] ?? 0,
        'minimo' => $opts['minimo'] ?? 0,
        'tema' => $opts['tema'] ?? 'sifon',
        'estilo' => $opts['estilo'] ?? 'lista',
    ]);

    $db->prepare(
        'INSERT INTO menus (tenant_id, slug, name, is_default) VALUES (:id, :s, :n, 1)',
    )->execute(['id' => $tenantId, 's' => 'principal', 'n' => 'Carta principal']);

    $db->prepare('INSERT INTO order_counters (tenant_id, next_number) VALUES (:id, 1001)')
        ->execute(['id' => $tenantId]);

    $db->commit();
} catch (Throwable $e) {
    $db->rollBack();
    fwrite(STDERR, 'No se pudo crear el local: ' . $e->getMessage() . "\n");
    exit(1);
}

echo PHP_EOL;
echo "Local creado: $nombre" . PHP_EOL;
echo "  URL       /{$slug}" . PHP_EOL;
echo "  tenant_id $tenantId" . PHP_EOL;
echo "  carta     principal (vacía)" . PHP_EOL;
echo PHP_EOL;
echo "La carta no tiene rubros ni platos todavía, así que /{$slug} va a" . PHP_EOL;
echo "abrir vacía. Se cargan en categories y products con tenant_id = $tenantId." . PHP_EOL;
echo PHP_EOL;
echo "Para borrarlo:  DELETE FROM tenants WHERE slug = '{$slug}';" . PHP_EOL;
echo PHP_EOL;
