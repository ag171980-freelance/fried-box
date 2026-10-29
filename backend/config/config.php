<?php

declare(strict_types=1);

/**
 * Configuración de la aplicación.
 *
 * Lee un .env si existe y cae a valores razonables de desarrollo si no.
 * Nada sensible vive acá: el .env está fuera del repositorio.
 */

/** @return array<string, string> */
function foodix_load_env(string $path): array
{
    if (!is_readable($path)) {
        return [];
    }

    $vars = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        $parts = explode('=', $line, 2);
        if (count($parts) !== 2) {
            continue;
        }
        $vars[trim($parts[0])] = trim($parts[1], " \t\"'");
    }

    return $vars;
}

$env = foodix_load_env(dirname(__DIR__) . '/.env');

$read = static function (string $key, string $default = '') use ($env): string {
    return $env[$key] ?? (getenv($key) !== false ? (string) getenv($key) : $default);
};

$bool = static fn (string $value): bool => in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);

return [
    'debug' => $bool($read('APP_DEBUG', 'true')),
    'env' => $read('APP_ENV', 'local'),

    'db' => [
        'host' => $read('DB_HOST', '127.0.0.1'),
        'port' => (int) $read('DB_PORT', '3306'),
        'name' => $read('DB_NAME', 'foodix'),
        'user' => $read('DB_USER', 'root'),
        'pass' => $read('DB_PASS', ''),
    ],

    'default_tenant' => $read('DEFAULT_TENANT', 'foodix'),

    // Endpoint que da pedidos por pagados sin pasarela real. Existe
    // hasta que haya credenciales de Mercado Pago. En producción, false.
    'allow_fake_payments' => $bool($read('ALLOW_FAKE_PAYMENTS', 'true')),

    'cors_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', $read('CORS_ORIGINS', 'http://localhost:5173')),
    ))),

    'asset_base_url' => rtrim($read('ASSET_BASE_URL', ''), '/'),
];
