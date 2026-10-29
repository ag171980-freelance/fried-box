<?php

declare(strict_types=1);

/**
 * Diagnóstico de la instalación.
 *
 *   php backend/tools/check.php
 *
 * Revisa lo que suele fallar la primera vez: extensiones, .env, conexión
 * a la base, tablas presentes y que la carta se arme completa. No toca
 * nada: sólo lee.
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

$fallas = 0;
$decir = static function (bool $ok, string $texto, string $detalle = '') use (&$fallas): void {
    if (!$ok) {
        $fallas++;
    }
    echo ($ok ? '  ok   ' : '  FALLA') . '  ' . $texto . ($detalle !== '' ? "  ->  $detalle" : '') . PHP_EOL;
};

echo PHP_EOL . 'Foodix · diagnóstico' . PHP_EOL . str_repeat('-', 60) . PHP_EOL;

/* --- entorno -------------------------------------------------------- */
$decir(PHP_VERSION_ID >= 80100, 'PHP 8.1 o mayor', PHP_VERSION);
$decir(extension_loaded('pdo_mysql'), 'extensión pdo_mysql');
$decir(extension_loaded('mbstring'), 'extensión mbstring');

$hayEnv = is_readable($root . '/.env');
$decir($hayEnv, 'archivo .env', $hayEnv ? '' : 'copiá .env.example a .env');

/** @var array<string,mixed> $config */
$config = require $root . '/config/config.php';

echo str_repeat('-', 60) . PHP_EOL;
printf('  base: %s@%s:%d/%s%s', $config['db']['user'], $config['db']['host'], $config['db']['port'], $config['db']['name'], PHP_EOL);
printf('  local por defecto: %s%s', $config['default_tenant'], PHP_EOL);
echo str_repeat('-', 60) . PHP_EOL;

/* --- base ------------------------------------------------------------ */
try {
    $db = Foodix\Support\Database::connect($config['db']);
    $decir(true, 'conexión a la base');
} catch (Throwable $e) {
    $decir(false, 'conexión a la base', $e->getMessage());
    echo PHP_EOL . 'Sin base no se puede seguir. Revisá host, puerto y credenciales en .env.' . PHP_EOL;
    exit(1);
}

$tablas = [
    'tenants', 'tenant_settings', 'menus', 'categories', 'products',
    'product_tags', 'option_groups', 'option_choices',
    'product_option_groups', 'promos', 'coupons',
    'orders', 'order_items', 'order_item_options', 'order_events',
    'order_counters', 'payments',
];
$presentes = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
$faltan = array_diff($tablas, $presentes);
$decir(
    $faltan === [],
    'las ' . count($tablas) . ' tablas del esquema',
    $faltan === [] ? '' : 'faltan: ' . implode(', ', $faltan),
);

if ($faltan !== []) {
    echo PHP_EOL . 'Importá backend/database/foodix.sql y backend/database/pedidos.sql,'
        . PHP_EOL . 'y volvé a correr esto.' . PHP_EOL;
    exit(1);
}

/* --- datos ------------------------------------------------------------ */
$locales = $db->query('SELECT slug, name FROM tenants WHERE status = "activo" ORDER BY id')->fetchAll();
$decir($locales !== [], 'hay al menos un local activo', count($locales) . ' local(es)');

echo str_repeat('-', 60) . PHP_EOL;

$presenter = new Foodix\Menu\MenuPresenter($config['asset_base_url']);
$repo = new Foodix\Menu\MenuRepository($db);
$resolver = new Foodix\Tenant\TenantResolver($db, $config['default_tenant']);

foreach ($locales as $fila) {
    $slug = (string) $fila['slug'];
    try {
        $tenant = $resolver->find($slug);
        $menu = $repo->menu($tenant['id'], null);
        $payload = $presenter->menu(
            $tenant,
            $repo->settings($tenant['id']),
            $menu,
            $repo->categories($tenant['id'], $menu['id']),
            $repo->products($tenant['id'], $menu['id']),
            $repo->tagsByProduct($tenant['id'], $menu['id']),
            $repo->optionGroups($tenant['id'], $menu['id']),
            $repo->optionGroupIdsByProduct($tenant['id'], $menu['id']),
            $repo->promos($tenant['id'], $menu['id']),
        );

        $conOpciones = count(array_filter($payload['items'], static fn (array $i): bool => $i['options'] !== []));
        $sinFoto = count(array_filter($payload['items'], static fn (array $i): bool => $i['image'] === null));

        $decir(true, sprintf('carta de %-14s', $slug), sprintf(
            '%d rubros · %d platos · %d con opciones · %d sin foto · %d promos',
            count($payload['categories']),
            count($payload['items']),
            $conOpciones,
            $sinFoto,
            count($payload['promos']),
        ));
    } catch (Throwable $e) {
        $decir(false, sprintf('carta de %-14s', $slug), $e->getMessage());
    }
}

echo str_repeat('-', 60) . PHP_EOL;

/* --- el motor de precios ---------------------------------------------
   Se cotiza de verdad contra el primer plato de la carta. Es la prueba
   de que la parte cara del backend funciona, no sólo que hay tablas. */
$pricing = new Foodix\Order\Pricing($db);

foreach ($locales as $fila) {
    $slug = (string) $fila['slug'];
    try {
        $tenant = $resolver->find($slug);
        $menu = $repo->menu($tenant['id'], null);
        $settings = $repo->settings($tenant['id']);
        $productos = $repo->products($tenant['id'], $menu['id']);

        if ($productos === []) {
            // Un local recién dado de alta todavía no cargó platos. Es un
            // estado normal, no un problema: si esto fuera una falla, el
            // diagnóstico avisaría en rojo por algo que está bien.
            printf('  aviso  %-22s sin platos cargados todavía%s', $slug, PHP_EOL);
            continue;
        }

        $quote = $pricing->quote(
            $tenant['id'],
            $menu['id'],
            [[
                'key' => 'check',
                'itemId' => (string) $productos[0]['slug'],
                'qty' => 2,
                'optionIds' => [],
                'note' => '',
            ]],
            'pickup',
            null,
            $settings,
        );

        $esperado = (float) $productos[0]['price'] * 2;
        $decir(
            abs($quote['total'] - $esperado) < 0.01,
            sprintf('cotización de %-11s', $slug),
            sprintf('2 x %s = %s', $productos[0]['slug'], number_format($quote['total'], 2, ',', '.')),
        );
    } catch (Throwable $e) {
        $decir(false, sprintf('cotización de %-11s', $slug), $e->getMessage());
    }
}

$pedidos = (int) $db->query('SELECT COUNT(*) FROM orders')->fetchColumn();
echo sprintf('  info   pedidos guardados: %d%s', $pedidos, PHP_EOL);

echo str_repeat('-', 60) . PHP_EOL;

$mp = \Foodix\Payment\MercadoPago::desdeConfig($config['mercadopago']);
if ($mp === null) {
    echo '  aviso  Mercado Pago sin conectar (MP_ACCESS_TOKEN vacío).' . PHP_EOL;
    echo $config['allow_fake_payments']
        ? '         Los pagos con Mercado Pago van al cobro simulado.' . PHP_EOL
        : '         Con ALLOW_FAKE_PAYMENTS en false, el checkout no ofrece cómo cobrar.' . PHP_EOL;
} else {
    try {
        $cuenta = $mp->cuenta();
        $decir(
            true,
            'Mercado Pago responde',
            sprintf(
                '%s · cuenta %s%s',
                $mp->esPrueba() ? 'token de PRUEBA' : 'token de PRODUCCIÓN',
                $cuenta['nickname'] ?? $cuenta['id'] ?? '?',
                isset($cuenta['site_id']) ? ' (' . $cuenta['site_id'] . ')' : '',
            ),
        );
    } catch (Throwable $e) {
        $decir(false, 'Mercado Pago responde', $e->getMessage());
    }

    echo $config['api_public_url'] === ''
        ? '  info   sin API_PUBLIC_URL: no hay webhook. Los pagos se confirman' . PHP_EOL
            . '         cuando el cliente vuelve a la pantalla de su pedido.' . PHP_EOL
        : '  info   webhook en ' . $config['api_public_url'] . '/webhooks/mercadopago' . PHP_EOL;
    if ($config['mercadopago']['webhook_secret'] === '' && $config['api_public_url'] !== '') {
        echo '  aviso  sin MP_WEBHOOK_SECRET: los avisos no se validan por firma.' . PHP_EOL;
    }
}

if ($config['allow_fake_payments'] && $mp === null) {
    echo '  aviso  ALLOW_FAKE_PAYMENTS está en true: hay un endpoint que da'
        . PHP_EOL . '         pedidos por pagados sin pasarela. En producción, false.' . PHP_EOL;
}

echo str_repeat('-', 60) . PHP_EOL;
echo $fallas === 0
    ? 'Todo en orden.' . PHP_EOL . PHP_EOL
    : $fallas . ' cosa(s) para revisar.' . PHP_EOL . PHP_EOL;

exit($fallas === 0 ? 0 : 1);
