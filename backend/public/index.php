<?php

declare(strict_types=1);

/**
 * Front controller. Todo entra por acá.
 */

use Foodix\Admin\AdminController;
use Foodix\Admin\AdminRepository;
use Foodix\Admin\Auth;
use Foodix\Admin\Uploads;
use Foodix\Menu\MenuController;
use Foodix\Menu\MenuPresenter;
use Foodix\Menu\MenuRepository;
use Foodix\Order\OrderController;
use Foodix\Order\OrderPresenter;
use Foodix\Order\OrderRepository;
use Foodix\Order\Pricing;
use Foodix\Support\Database;
use Foodix\Support\HttpException;
use Foodix\Support\Response;
use Foodix\Support\Router;
use Foodix\Tenant\TenantResolver;

$root = dirname(__DIR__);

/** Autoload PSR-4 a mano: el proyecto no usa Composer. */
spl_autoload_register(static function (string $class) use ($root): void {
    $prefix = 'Foodix\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = str_replace('\\', '/', substr($class, strlen($prefix)));
    $file = $root . '/src/' . $relative . '.php';
    if (is_file($file)) {
        require $file;
    }
});

/**
 * Las fotos que sube el local son archivos, no rutas de la API.
 *
 * Con `php -S … index.php` todo entra por este script, así que un GET a
 * /uploads/platos/x.jpg llegaría acá y saldría 404. Devolver false le
 * dice al servidor embebido que sirva el archivo él. Bajo Apache esta
 * rama no se ejecuta: ahí el archivo se encuentra antes del rewrite.
 */
if (
    PHP_SAPI === 'cli-server'
    && preg_match('#^/uploads/[a-z0-9/_-]+\.(jpg|jpeg|png|webp)$#i', parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '') === 1
    && is_file(__DIR__ . parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH))
) {
    return false;
}

/** @var array<string, mixed> $config */
$config = require $root . '/config/config.php';

// En desarrollo los errores se ven; en producción van al log y el
// cliente recibe un 500 pelado.
ini_set('display_errors', $config['debug'] ? '1' : '0');
error_reporting($config['debug'] ? E_ALL : E_ALL & ~E_DEPRECATED);

Response::cors($config['cors_origins']);

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $router = new Router();

    $router->get('/health', static function (): void {
        Response::json(['ok' => true, 'servicio' => 'foodix-api']);
    });

    $router->get('/menu', static function (array $p) use ($config): void {
        menuController($config)->show($p);
    });
    $router->get('/menu/{menuSlug}', static function (array $p) use ($config): void {
        menuController($config)->show($p);
    });
    $router->get('/menus', static function (array $p) use ($config): void {
        menuController($config)->index($p);
    });

    // Mismas rutas con el local explícito en el camino.
    $router->get('/t/{tenantSlug}/menu', static function (array $p) use ($config): void {
        menuController($config)->show($p);
    });
    $router->get('/t/{tenantSlug}/menu/{menuSlug}', static function (array $p) use ($config): void {
        menuController($config)->show($p);
    });
    $router->get('/t/{tenantSlug}/menus', static function (array $p) use ($config): void {
        menuController($config)->index($p);
    });

    /* --- pedidos --------------------------------------------------- */
    $router->post('/orders/quote', static function (array $p) use ($config): void {
        orderController($config)->quote($p);
    });
    $router->post('/orders', static function (array $p) use ($config): void {
        orderController($config)->create($p);
    });
    $router->get('/orders/{publicId}', static function (array $p) use ($config): void {
        orderController($config)->show($p);
    });
    $router->post('/orders/{publicId}/pago-simulado', static function (array $p) use ($config): void {
        orderController($config)->fakePayment($p);
    });

    $router->post('/t/{tenantSlug}/orders/quote', static function (array $p) use ($config): void {
        orderController($config)->quote($p);
    });
    $router->post('/t/{tenantSlug}/orders', static function (array $p) use ($config): void {
        orderController($config)->create($p);
    });
    $router->get('/t/{tenantSlug}/orders/{publicId}', static function (array $p) use ($config): void {
        orderController($config)->show($p);
    });
    $router->post('/t/{tenantSlug}/orders/{publicId}/pago-simulado', static function (array $p) use ($config): void {
        orderController($config)->fakePayment($p);
    });

    /* --- panel de administración ------------------------------------
       Todo lo de /admin exige sesión salvo el login. El local sale del
       usuario, no de la URL: por eso acá no hay ningún {tenantSlug}. */

    $router->post('/admin/login', static function () use ($config): void {
        adminController($config)->login();
    });
    $router->post('/admin/logout', static function () use ($config): void {
        adminController($config)->logout();
    });
    $router->get('/admin/me', static function () use ($config): void {
        adminController($config)->yo();
    });
    $router->post('/admin/password', static function () use ($config): void {
        adminController($config)->cambiarClave();
    });

    // Una sola llamada con todo lo que el panel necesita al abrir.
    $router->get('/admin/panel', static function () use ($config): void {
        adminController($config)->panel();
    });

    $router->put('/admin/settings', static function () use ($config): void {
        adminController($config)->guardarSettings();
    });
    $router->post('/admin/estado', static function () use ($config): void {
        adminController($config)->cambiarEstado();
    });

    $router->post('/admin/categories', static function () use ($config): void {
        adminController($config)->crearCategoria();
    });
    $router->put('/admin/categories/{id}', static function (array $p) use ($config): void {
        adminController($config)->actualizarCategoria($p);
    });
    $router->delete('/admin/categories/{id}', static function (array $p) use ($config): void {
        adminController($config)->borrarCategoria($p);
    });

    $router->post('/admin/products', static function () use ($config): void {
        adminController($config)->crearProducto();
    });
    $router->put('/admin/products/{id}', static function (array $p) use ($config): void {
        adminController($config)->actualizarProducto($p);
    });
    $router->post('/admin/products/{id}/disponibilidad', static function (array $p) use ($config): void {
        adminController($config)->cambiarDisponibilidad($p);
    });
    $router->post('/admin/products/{id}/foto', static function (array $p) use ($config): void {
        adminController($config)->subirFoto($p);
    });
    $router->delete('/admin/products/{id}/foto', static function (array $p) use ($config): void {
        adminController($config)->borrarFoto($p);
    });
    $router->delete('/admin/products/{id}', static function (array $p) use ($config): void {
        adminController($config)->borrarProducto($p);
    });

    $router->post('/admin/option-groups', static function () use ($config): void {
        adminController($config)->guardarGrupo();
    });
    $router->put('/admin/option-groups/{id}', static function (array $p) use ($config): void {
        adminController($config)->guardarGrupo($p);
    });
    $router->delete('/admin/option-groups/{id}', static function (array $p) use ($config): void {
        adminController($config)->borrarGrupo($p);
    });

    $router->post('/admin/promos', static function () use ($config): void {
        adminController($config)->guardarPromo();
    });
    $router->put('/admin/promos/{id}', static function (array $p) use ($config): void {
        adminController($config)->guardarPromo($p);
    });
    $router->delete('/admin/promos/{id}', static function (array $p) use ($config): void {
        adminController($config)->borrarPromo($p);
    });

    $router->post('/admin/coupons', static function () use ($config): void {
        adminController($config)->guardarCupon();
    });
    $router->put('/admin/coupons/{id}', static function (array $p) use ($config): void {
        adminController($config)->guardarCupon($p);
    });
    $router->delete('/admin/coupons/{id}', static function (array $p) use ($config): void {
        adminController($config)->borrarCupon($p);
    });

    [$handler, $params] = $router->match(
        $_SERVER['REQUEST_METHOD'] ?? 'GET',
        Router::currentPath(),
    );

    $handler($params);
} catch (HttpException $e) {
    Response::error($e->status, $e->getMessage(), $e->errorCode);
} catch (Throwable $e) {
    error_log('[foodix] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());

    Response::error(
        500,
        $config['debug'] ? $e->getMessage() : 'Algo se rompió de nuestro lado.',
        'error_interno',
    );
}

/**
 * Armado a mano de las dependencias. Con tres clases no hace falta un
 * contenedor; cuando sean quince, sí.
 *
 * @param array<string, mixed> $config
 */
function menuController(array $config): MenuController
{
    $db = Database::connect($config['db']);

    return new MenuController(
        new MenuRepository($db),
        new MenuPresenter($config['asset_base_url']),
        new TenantResolver($db, $config['default_tenant']),
    );
}

/** @param array<string, mixed> $config */
function adminController(array $config): AdminController
{
    $db = Database::connect($config['db']);

    return new AdminController(
        new Auth($db),
        new AdminRepository($db),
        new Uploads(__DIR__ . '/uploads'),
    );
}

/** @param array<string, mixed> $config */
function orderController(array $config): OrderController
{
    $db = Database::connect($config['db']);

    return new OrderController(
        new MenuRepository($db),
        new OrderRepository($db),
        new OrderPresenter(),
        new Pricing($db),
        new TenantResolver($db, $config['default_tenant']),
        $config['allow_fake_payments'],
    );
}
