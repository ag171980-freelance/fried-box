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

    // Mercado Pago. Sin access token, el cobro sigue siendo el simulado
    // (si ALLOW_FAKE_PAYMENTS lo permite). Con token, el simulado se
    // apaga solo y se cobra de verdad: en el sandbox si el token es de
    // prueba (TEST-...), en serio si es de producción.
    'mercadopago' => [
        'access_token' => $read('MP_ACCESS_TOKEN', ''),
        // La «clave secreta» de Tus integraciones → Webhooks. Opcional:
        // si está, las notificaciones sin firma válida se rechazan.
        'webhook_secret' => $read('MP_WEBHOOK_SECRET', ''),
    ],

    // Dónde vive el front: a dónde vuelve el cliente después de pagar.
    'front_url' => rtrim($read('FRONT_URL', 'http://localhost:5173'), '/'),

    // La dirección pública del backend, para que Mercado Pago avise de
    // los pagos. Tiene que ser https y accesible desde internet; vacía
    // en local, donde la pantalla del pedido pregunta por el pago.
    'api_public_url' => rtrim($read('API_PUBLIC_URL', ''), '/'),

    'cors_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', $read('CORS_ORIGINS', 'http://localhost:5173')),
    ))),

    'asset_base_url' => rtrim($read('ASSET_BASE_URL', ''), '/'),
];
