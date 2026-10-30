<?php

declare(strict_types=1);

namespace Foodix\Admin;

use Foodix\Order\PromoRules;
use Foodix\Support\HttpException;
use Foodix\Support\Request;
use Foodix\Support\Response;

/**
 * El panel del local.
 *
 * Todas las rutas menos `login` pasan por `Auth::exigirUsuario()`, y el
 * tenant_id sale **del usuario**, nunca de la petición. Esa es la regla
 * que hace que no importe lo que alguien mande en la URL o en el body:
 * sólo puede tocar su propio local.
 */
final class AdminController
{
    /** Lo que la carta sabe dibujar; ver frontend/src/styles. */
    private const TEMAS = ['friedbox-claro', 'friedbox', 'sifon', 'tostado', 'sal', 'higo', 'menta', 'fuego', 'vermut', 'carbon'];
    private const ESTILOS = ['lista', 'grilla', 'mosaico', 'vidriera', 'cinta', 'carrusel'];
    private const ETIQUETAS = ['veg', 'hot', 'sintacc', 'vegano'];
    private const FORMAS = [
        'burger', 'pizza', 'empanada', 'docena', 'milanesa', 'papas', 'provoleta',
        'rabas', 'tabla', 'ensalada', 'bowl', 'flan', 'brownie', 'botella', 'vaso',
    ];

    public function __construct(
        private readonly Auth $auth,
        private readonly AdminRepository $repo,
        private readonly Uploads $uploads,
    ) {
    }

    /* ----------------------------------------------------------------
       Sesión
       ---------------------------------------------------------------- */

    public function login(): void
    {
        $req = Request::json();
        $email = mb_strtolower(trim($req->str('email', 160)));
        $password = $req->str('password', 200);

        if ($email === '' || $password === '') {
            throw HttpException::badRequest('Faltan el mail y la contraseña.', 'datos_incompletos');
        }

        Response::json($this->auth->login($email, $password));
    }

    public function logout(): void
    {
        $this->auth->logout();
        Response::json(['ok' => true]);
    }

    public function yo(): void
    {
        $user = $this->auth->exigirUsuario();
        Response::json(['user' => Auth::publico($user)]);
    }

    public function cambiarClave(): void
    {
        $user = $this->auth->exigirUsuario();
        $req = Request::json();

        $this->auth->cambiarClave(
            (int) $user['id'],
            $req->str('actual', 200),
            $req->str('nueva', 200),
        );

        Response::json(['ok' => true]);
    }

    /* ----------------------------------------------------------------
       Todo junto: lo que el panel pide al abrir
       ---------------------------------------------------------------- */

    public function panel(): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];

        Response::json([
            'user' => Auth::publico($user),
            'menu' => $menu,
            'settings' => $this->repo->settings($t),
            'categories' => $this->repo->categorias($t, $menu['id']),
            'products' => $this->repo->productos($t, $menu['id']),
            'optionGroups' => $this->repo->gruposDeOpciones($t, $menu['id']),
            'promos' => $this->repo->promos($t, $menu['id']),
            'coupons' => $this->repo->cupones($t),
            'catalogo' => [
                'themes' => self::TEMAS,
                'layouts' => self::ESTILOS,
                'tags' => self::ETIQUETAS,
                'artShapes' => self::FORMAS,
            ],
        ]);
    }

    /* ----------------------------------------------------------------
       Configuración del local
       ---------------------------------------------------------------- */

    public function guardarSettings(): void
    {
        [$user] = $this->contexto();
        $req = Request::json();

        $edMin = self::entero($req->float('etaDeliveryMin'), 0, 240, 30);
        $edMax = self::entero($req->float('etaDeliveryMax'), 0, 240, 45);
        $epMin = self::entero($req->float('etaPickupMin'), 0, 240, 15);
        $epMax = self::entero($req->float('etaPickupMax'), 0, 240, 20);

        // Un rango al revés se muestra como «45 a 30 min». Se ordena acá
        // en vez de rechazarlo: es un error de tipeo, no un ataque.
        if ($edMin > $edMax) {
            [$edMin, $edMax] = [$edMax, $edMin];
        }
        if ($epMin > $epMax) {
            [$epMin, $epMax] = [$epMax, $epMin];
        }

        $aceptaEnvio = $req->bool('acceptsDelivery', true);
        $aceptaRetiro = $req->bool('acceptsPickup', true);

        if (!$aceptaEnvio && !$aceptaRetiro) {
            throw HttpException::badRequest(
                'Tenés que dejar al menos una forma de entrega: envío o retiro.',
                'sin_forma_de_entrega',
            );
        }

        $nombre = trim($req->str('name', 120));
        if ($nombre === '') {
            throw HttpException::badRequest('El local necesita un nombre.', 'sin_nombre');
        }

        $this->repo->guardarSettings((int) $user['tenant_id'], [
            'name' => $nombre,
            'tagline' => self::opcional($req->str('tagline', 200)),
            'address' => self::opcional($req->str('address', 200)),
            'phone' => self::opcional($req->str('phone', 40)),
            'whatsapp' => self::opcional($req->str('whatsapp', 40)),
            'hoursText' => self::opcional($req->str('hoursText', 160)),
            'isOpen' => $req->bool('isOpen', true),
            'closedMessage' => self::opcional($req->str('closedMessage', 160)),
            'acceptsDelivery' => $aceptaEnvio,
            'acceptsPickup' => $aceptaRetiro,
            'deliveryFee' => max(0.0, $req->float('deliveryFee') ?? 0.0),
            // El monto se guarda igual aunque esté apagado: lo que manda
            // es el interruptor, y así el local no lo pierde.
            'deliveryFeeVariable' => $req->bool('deliveryFeeVariable', false),
            'minOrder' => max(0.0, $req->float('minOrder') ?? 0.0),
            'minOrderEnabled' => $req->bool('minOrderEnabled', true),
            'etaDeliveryMin' => $edMin,
            'etaDeliveryMax' => $edMax,
            'etaPickupMin' => $epMin,
            'etaPickupMax' => $epMax,
            'theme' => $req->enum('theme', self::TEMAS, 'sifon'),
            'layout' => $req->enum('layout', self::ESTILOS, 'lista'),
            'frontUrl' => self::sitio($req->str('frontUrl', 200)),
            // Las credenciales van vacías salvo que el local las esté
            // cargando ahora: el panel no las tiene, porque nunca se las
            // devolvimos. Vacío significa «no las toques».
            'mpAccessToken' => $req->str('mpAccessToken', 400),
            'mpWebhookSecret' => $req->str('mpWebhookSecret', 200),
            'mpDesconectar' => $req->bool('mpDesconectar', false),
        ]);

        Response::json(['settings' => $this->repo->settings((int) $user['tenant_id'])]);
    }

    /**
     * El sitio del local, a donde vuelve el cliente desde Mercado Pago.
     *
     * Se exige http(s) y se corta la barra final. Una dirección sin
     * esquema («friedbox.com.ar») armaría una vuelta relativa y el
     * cliente terminaría en una página que no existe justo después de
     * pagar, que es el peor momento para una pantalla en blanco.
     */
    private static function sitio(string $valor): string
    {
        $valor = rtrim(trim($valor), '/');
        if ($valor === '') {
            return '';
        }

        if (!str_starts_with($valor, 'http://') && !str_starts_with($valor, 'https://')) {
            throw HttpException::badRequest(
                'El sitio del local tiene que empezar con https://',
                'sitio_invalido',
            );
        }

        return $valor;
    }

    /** El interruptor grande de la pantalla principal. */
    public function cambiarEstado(): void
    {
        [$user] = $this->contexto();
        $req = Request::json();

        $this->repo->cambiarEstado(
            (int) $user['tenant_id'],
            $req->bool('isOpen', true),
            self::opcional($req->str('closedMessage', 160)),
        );

        Response::json(['settings' => $this->repo->settings((int) $user['tenant_id'])]);
    }

    /* ----------------------------------------------------------------
       Rubros
       ---------------------------------------------------------------- */

    public function crearCategoria(): void
    {
        [$user, $menu] = $this->contexto();
        $req = Request::json();

        $nombre = trim($req->str('name', 120));
        if ($nombre === '') {
            throw HttpException::badRequest('El rubro necesita un nombre.', 'sin_nombre');
        }

        $id = $this->repo->crearCategoria(
            (int) $user['tenant_id'],
            $menu['id'],
            $nombre,
            self::entero($req->float('sortOrder'), 0, 9999, 999),
        );

        Response::json(['id' => $id, 'categories' => $this->repo->categorias((int) $user['tenant_id'], $menu['id'])], 201);
    }

    /** @param array<string,string> $params */
    public function actualizarCategoria(array $params): void
    {
        [$user, $menu] = $this->contexto();
        $req = Request::json();

        $nombre = trim($req->str('name', 120));
        if ($nombre === '') {
            throw HttpException::badRequest('El rubro necesita un nombre.', 'sin_nombre');
        }

        $this->repo->actualizarCategoria(
            (int) $user['tenant_id'],
            self::id($params),
            $nombre,
            self::entero($req->float('sortOrder'), 0, 9999, 999),
        );

        Response::json(['categories' => $this->repo->categorias((int) $user['tenant_id'], $menu['id'])]);
    }

    /** @param array<string,string> $params */
    public function borrarCategoria(array $params): void
    {
        [$user, $menu] = $this->contexto();
        $this->repo->borrarCategoria((int) $user['tenant_id'], self::id($params));

        Response::json(['categories' => $this->repo->categorias((int) $user['tenant_id'], $menu['id'])]);
    }

    /* ----------------------------------------------------------------
       Platos
       ---------------------------------------------------------------- */

    public function crearProducto(): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];

        $id = $this->repo->crearProducto($t, $menu['id'], $this->leerProducto());

        Response::json(['id' => $id, 'products' => $this->repo->productos($t, $menu['id'])], 201);
    }

    /** @param array<string,string> $params */
    public function actualizarProducto(array $params): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];

        $this->repo->actualizarProducto($t, $menu['id'], self::id($params), $this->leerProducto());

        Response::json(['products' => $this->repo->productos($t, $menu['id'])]);
    }

    /** @param array<string,string> $params */
    public function cambiarDisponibilidad(array $params): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];

        $this->repo->cambiarDisponibilidad($t, self::id($params), Request::json()->bool('isAvailable', true));

        Response::json(['products' => $this->repo->productos($t, $menu['id'])]);
    }

    /** @param array<string,string> $params */
    public function subirFoto(array $params): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];
        $id = self::id($params);

        // Confirma que el plato es de este local antes de escribir nada
        // en disco: si no, cualquiera llenaría la carpeta de imágenes.
        $anterior = $this->repo->fotoActual($t, $id);

        $ruta = $this->uploads->guardarFoto(
            $_FILES['foto'] ?? null,
            (string) $user['tenant_slug'],
            $id,
        );

        $this->repo->guardarFoto($t, $id, $ruta);
        $this->uploads->borrarFoto($anterior);

        Response::json(['image' => $ruta, 'products' => $this->repo->productos($t, $menu['id'])]);
    }

    /** @param array<string,string> $params */
    public function borrarFoto(array $params): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];
        $id = self::id($params);

        $anterior = $this->repo->fotoActual($t, $id);
        $this->repo->guardarFoto($t, $id, '');
        $this->uploads->borrarFoto($anterior);

        Response::json(['products' => $this->repo->productos($t, $menu['id'])]);
    }

    /** @param array<string,string> $params */
    public function borrarProducto(array $params): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];
        $id = self::id($params);

        $foto = $this->repo->fotoActual($t, $id);
        $this->repo->borrarProducto($t, $id);
        $this->uploads->borrarFoto($foto);

        Response::json(['products' => $this->repo->productos($t, $menu['id'])]);
    }

    /* ----------------------------------------------------------------
       Grupos de opciones
       ---------------------------------------------------------------- */

    public function guardarGrupo(array $params = []): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];
        $req = Request::json();

        $nombre = trim($req->str('name', 120));
        if ($nombre === '') {
            throw HttpException::badRequest('El grupo necesita un nombre.', 'sin_nombre');
        }

        $tipo = $req->enum('type', ['single', 'multi'], 'single');
        $elecciones = $this->leerElecciones($req);

        if ($elecciones === []) {
            throw HttpException::badRequest('El grupo necesita al menos una opción.', 'sin_opciones');
        }

        $max = self::entero($req->float('maxChoices'), 1, 20, $tipo === 'single' ? 1 : count($elecciones));
        $min = self::entero($req->float('minChoices'), 0, 20, 0);
        $req_ = $req->bool('isRequired', false);

        // «Obligatorio» y «mínimo 0» se contradicen, y el carrito usa el
        // mínimo para decidir si falta elegir. Se acomoda en vez de
        // guardar un grupo que nunca se podría completar.
        if ($req_ && $min < 1) {
            $min = 1;
        }
        if ($tipo === 'single') {
            $max = 1;
            $min = min($min, 1);
        }
        if ($min > $max) {
            $min = $max;
        }

        $id = $this->repo->guardarGrupo($t, $menu['id'], isset($params['id']) ? self::id($params) : null, [
            'name' => $nombre,
            'type' => $tipo,
            'isRequired' => $req_,
            'minChoices' => $min,
            'maxChoices' => $max,
            'sortOrder' => self::entero($req->float('sortOrder'), 0, 9999, 999),
            'choices' => $elecciones,
        ]);

        Response::json([
            'id' => $id,
            'optionGroups' => $this->repo->gruposDeOpciones($t, $menu['id']),
        ]);
    }

    /** @param array<string,string> $params */
    public function borrarGrupo(array $params): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];

        $this->repo->borrarGrupo($t, self::id($params));

        Response::json(['optionGroups' => $this->repo->gruposDeOpciones($t, $menu['id'])]);
    }

    /* ----------------------------------------------------------------
       Promos y cupones
       ---------------------------------------------------------------- */

    public function guardarPromo(array $params = []): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];
        $req = Request::json();

        $titulo = trim($req->str('title', 160));
        if ($titulo === '') {
            throw HttpException::badRequest('La promo necesita un título.', 'sin_titulo');
        }

        $productId = $req->float('productId');

        // Sin porcentaje la promo es sólo un aviso en la carta.
        $porcentaje = $req->float('discountPercent');
        $porcentaje = $porcentaje === null || $porcentaje <= 0 ? null : min(100.0, round($porcentaje, 2));

        $alcance = $req->enum('appliesTo', ['todo', 'rubros', 'platos'], 'todo');
        $categoryIds = array_map('intval', $req->numList('categoryIds', 200));
        $productIds = array_map('intval', $req->numList('productIds', 500));
        if ($porcentaje !== null && $alcance === 'rubros' && $categoryIds === []) {
            throw HttpException::badRequest('Elegí al menos un rubro para la promo.', 'sin_rubros');
        }
        if ($porcentaje !== null && $alcance === 'platos' && $productIds === []) {
            throw HttpException::badRequest('Elegí al menos un plato para la promo.', 'sin_platos');
        }

        $id = $this->repo->guardarPromo($t, $menu['id'], isset($params['id']) ? self::id($params) : null, [
            'kicker' => self::opcional($req->str('kicker', 80)),
            'title' => $titulo,
            'body' => self::opcional($req->str('body', 300)),
            'productId' => $productId === null || $productId <= 0 ? null : (int) $productId,
            'discountPercent' => $porcentaje,
            // Todos los días marcados es lo mismo que ninguno: se guarda
            // NULL para que agregar un día nuevo no haga falta nunca.
            'days' => self::dias($req->strList('days', 7, 3)),
            'appliesTo' => $alcance,
            'categoryIds' => $alcance === 'rubros' ? $categoryIds : [],
            'productIds' => $alcance === 'platos' ? $productIds : [],
            'isActive' => $req->bool('isActive', true),
            'sortOrder' => self::entero($req->float('sortOrder'), 0, 9999, 999),
        ]);

        Response::json(['id' => $id, 'promos' => $this->repo->promos($t, $menu['id'])]);
    }

    /** @param array<string,string> $params */
    public function borrarPromo(array $params): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];

        $id = self::id($params);

        $foto = $this->repo->fotoPromo($t, $id);
        $this->repo->borrarPromo($t, $id);
        $this->uploads->borrarFoto($foto);

        Response::json(['promos' => $this->repo->promos($t, $menu['id'])]);
    }

    /** @param array<string,string> $params */
    public function subirFotoPromo(array $params): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];
        $id = self::id($params);

        // Igual que con los platos: primero se confirma que la promo es
        // de este local, después se escribe en disco.
        $anterior = $this->repo->fotoPromo($t, $id);

        $ruta = $this->uploads->guardarFoto($_FILES['foto'] ?? null, (string) $user['tenant_slug'], $id, 'promos');

        $this->repo->guardarFotoPromo($t, $id, $ruta);
        $this->uploads->borrarFoto($anterior);

        Response::json(['image' => $ruta, 'promos' => $this->repo->promos($t, $menu['id'])]);
    }

    /** @param array<string,string> $params */
    public function borrarFotoPromo(array $params): void
    {
        [$user, $menu] = $this->contexto();
        $t = (int) $user['tenant_id'];
        $id = self::id($params);

        $anterior = $this->repo->fotoPromo($t, $id);
        $this->repo->guardarFotoPromo($t, $id, null);
        $this->uploads->borrarFoto($anterior);

        Response::json(['promos' => $this->repo->promos($t, $menu['id'])]);
    }

    public function guardarCupon(array $params = []): void
    {
        [$user] = $this->contexto();
        $t = (int) $user['tenant_id'];
        $req = Request::json();

        $codigo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $req->str('code', 40)) ?? '');
        if ($codigo === '') {
            throw HttpException::badRequest('El cupón necesita un código, sin espacios ni símbolos.', 'sin_codigo');
        }

        $tipo = $req->enum('type', ['percent', 'fixed', 'shipping'], 'percent');
        $valor = max(0.0, $req->float('value') ?? 0.0);

        if ($tipo === 'percent' && $valor > 100) {
            throw HttpException::badRequest('Un descuento por porcentaje no puede pasar de 100.', 'porcentaje_invalido');
        }
        if ($tipo === 'shipping') {
            $valor = 0.0;
        }

        $minOrder = $req->float('minOrder');
        $maxUses = $req->float('maxUses');

        $id = $this->repo->guardarCupon($t, isset($params['id']) ? self::id($params) : null, [
            'code' => $codigo,
            'type' => $tipo,
            'value' => $valor,
            'label' => trim($req->str('label', 80)) ?: self::etiquetaCupon($tipo, $valor),
            'minOrder' => $minOrder === null || $minOrder <= 0 ? null : $minOrder,
            'maxUses' => $maxUses === null || $maxUses <= 0 ? null : (int) $maxUses,
            'isActive' => $req->bool('isActive', true),
        ]);

        Response::json(['id' => $id, 'coupons' => $this->repo->cupones($t)]);
    }

    /** @param array<string,string> $params */
    public function borrarCupon(array $params): void
    {
        [$user] = $this->contexto();
        $t = (int) $user['tenant_id'];

        $this->repo->borrarCupon($t, self::id($params));

        Response::json(['coupons' => $this->repo->cupones($t)]);
    }

    /* ----------------------------------------------------------------
       Ayudas
       ---------------------------------------------------------------- */

    /**
     * Usuario y carta. El tenant_id sale del usuario de la sesión: si
     * saliera de la petición, el panel sería de todos.
     *
     * @return array{array<string,mixed>, array{id:int, slug:string, name:string}}
     */
    private function contexto(): array
    {
        $user = $this->auth->exigirUsuario();
        $menu = $this->repo->menuPorDefecto((int) $user['tenant_id']);

        return [$user, $menu];
    }

    /** @return array<string,mixed> */
    private function leerProducto(): array
    {
        $req = Request::json();

        $nombre = trim($req->str('name', 160));
        if ($nombre === '') {
            throw HttpException::badRequest('El plato necesita un nombre.', 'sin_nombre');
        }

        $precio = $req->float('price');
        if ($precio === null || $precio < 0) {
            throw HttpException::badRequest('El precio tiene que ser un número de cero para arriba.', 'precio_invalido');
        }

        $categoryId = (int) ($req->float('categoryId') ?? 0);
        if ($categoryId <= 0) {
            throw HttpException::badRequest('Elegí en qué rubro va el plato.', 'sin_rubro');
        }

        $forma = $req->str('artShape', 32);
        $imagen = self::opcional($req->str('image', 255));

        return [
            'categoryId' => $categoryId,
            'name' => $nombre,
            'description' => self::opcional($req->str('description', 400)),
            'price' => round($precio, 2),
            'image' => $imagen,
            // Sin foto, el dibujo vectorial es lo que evita el hueco gris.
            'artShape' => in_array($forma, self::FORMAS, true) ? $forma : ($imagen === null ? 'tabla' : null),
            'artHue' => self::entero($req->float('artHue'), 0, 359, 30),
            'badge' => self::opcional($req->str('badge', 40)),
            'isPopular' => $req->bool('isPopular', false),
            'isAvailable' => $req->bool('isAvailable', true),
            'sortOrder' => self::entero($req->float('sortOrder'), 0, 9999, 999),
            'tags' => array_values(array_intersect($req->strList('tags', 8, 32), self::ETIQUETAS)),
            'optionGroupIds' => array_map('intval', $req->numList('optionGroupIds', 20)),
        ];
    }

    /** @return list<array<string,mixed>> */
    private function leerElecciones(Request $req): array
    {
        $out = [];

        foreach ($req->objList('choices', 30) as $c) {
            $nombre = trim(substr((string) ($c['name'] ?? ''), 0, 120));
            if ($nombre === '') {
                continue;
            }

            $delta = is_numeric($c['priceDelta'] ?? null) ? (float) $c['priceDelta'] : 0.0;

            $out[] = [
                'name' => $nombre,
                'priceDelta' => round($delta, 2),
                'isDefault' => !empty($c['isDefault']),
                'isExclusive' => !empty($c['isExclusive']),
            ];
        }

        return $out;
    }

    /** @param array<string,string> $params */
    private static function id(array $params): int
    {
        $id = (int) ($params['id'] ?? 0);
        if ($id <= 0) {
            throw HttpException::badRequest('Falta el identificador.', 'sin_id');
        }

        return $id;
    }

    /** @param list<string> $dias */
    private static function dias(array $dias): ?string
    {
        $validos = array_values(array_intersect(PromoRules::DIAS, $dias));

        return $validos === [] || count($validos) === count(PromoRules::DIAS) ? null : implode(',', $validos);
    }

    private static function entero(?float $valor, int $min, int $max, int $default): int
    {
        if ($valor === null) {
            return $default;
        }

        return max($min, min($max, (int) round($valor)));
    }

    private static function opcional(string $valor): ?string
    {
        $valor = trim($valor);

        return $valor === '' ? null : $valor;
    }

    private static function etiquetaCupon(string $tipo, float $valor): string
    {
        return match ($tipo) {
            'percent' => rtrim(rtrim(number_format($valor, 2, ',', '.'), '0'), ',') . '% de descuento',
            'fixed' => '$' . number_format($valor, 0, ',', '.') . ' de descuento',
            default => 'Envío sin cargo',
        };
    }
}
