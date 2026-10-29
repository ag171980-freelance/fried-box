<?php

declare(strict_types=1);

namespace Foodix\Order;

use Foodix\Menu\MenuRepository;
use Foodix\Payment\Cobros;
use Foodix\Payment\MercadoPago;
use Foodix\Support\HttpException;
use Foodix\Support\Request;
use Foodix\Support\Response;
use Foodix\Tenant\TenantResolver;

final class OrderController
{
    private const METODOS_PAGO = ['mercadopago', 'efectivo'];
    private const MODOS = ['delivery', 'pickup'];

    public function __construct(
        private readonly MenuRepository $menus,
        private readonly OrderRepository $orders,
        private readonly OrderPresenter $presenter,
        private readonly Pricing $pricing,
        private readonly TenantResolver $tenants,
        private readonly bool $permitirPagoSimulado,
        private readonly ?MercadoPago $mp = null,
        private readonly ?Cobros $cobros = null,
        private readonly string $urlFront = '',
        private readonly ?string $urlWebhook = null,
    ) {
    }

    /**
     * POST /orders/quote
     *
     * El total de verdad. El front manda qué pidió, nunca cuánto sale.
     *
     * @param array<string,string> $params
     */
    public function quote(array $params): void
    {
        $req = Request::json();
        [$tenant, $menu, $settings] = $this->contexto($params);

        $quote = $this->pricing->quote(
            $tenant['id'],
            $menu['id'],
            $req->lines(),
            $req->enum('mode', self::MODOS, 'delivery'),
            $req->str('couponCode', 40) ?: null,
            $settings,
        );

        Response::json($this->limpiar($quote));
    }

    /**
     * POST /orders
     *
     * @param array<string,string> $params
     */
    public function create(array $params): void
    {
        $req = Request::json();
        [$tenant, $menu, $settings] = $this->contexto($params);

        // El local cerrado se corta acá, antes de tocar nada. El front
        // también lo bloquea, pero esa pantalla es sugerencia: la que
        // manda es esta línea, que ve la misma fila que ve el panel.
        $this->exigirAbierto($settings);

        $mode = $req->enum('mode', self::MODOS, 'delivery');
        $paymentMethod = $req->enum('paymentMethod', self::METODOS_PAGO, 'mercadopago');

        // Sin cuenta de Mercado Pago y sin simulador no hay cómo cobrar:
        // se corta antes de crear un pedido que nadie va a poder pagar.
        if ($paymentMethod === 'mercadopago' && $this->mp === null && !$this->permitirPagoSimulado) {
            throw new HttpException(503, 'Por ahora este local no acepta Mercado Pago. Elegí efectivo.', 'mp_no_configurado');
        }
        $customer = $req->obj('customer');

        $datos = [
            'mode' => $mode,
            'paymentMethod' => $paymentMethod,
            'note' => $req->str('note', 300),
            'customer' => [
                'name' => self::campo($customer, 'name', 120),
                'phone' => self::campo($customer, 'phone', 40),
                'email' => self::campo($customer, 'email', 160),
                'address' => self::campo($customer, 'address', 200),
                'apt' => self::campo($customer, 'apt', 80),
                'changeFor' => self::numero($customer['changeFor'] ?? null),
            ],
        ];

        $errores = $this->validar($datos, $settings);
        if ($errores !== []) {
            Response::json([
                'error' => ['codigo' => 'datos_invalidos', 'mensaje' => 'Faltan datos del pedido.'],
                'campos' => $errores,
            ], 422);
            return;
        }

        // Se vuelve a cotizar acá y no se confía en lo que cotizó el
        // carrito: entre que el cliente abrió la app y apretó pagar pudo
        // subir un precio o agotarse un plato.
        $quote = $this->pricing->quote(
            $tenant['id'],
            $menu['id'],
            $req->lines(),
            $mode,
            $req->str('couponCode', 40) ?: null,
            $settings,
        );

        if ($quote['lines'] === []) {
            throw HttpException::badRequest('El pedido no tiene nada adentro.', 'pedido_vacio');
        }

        if (!$quote['valid']) {
            Response::json([
                'error' => ['codigo' => 'pedido_desactualizado', 'mensaje' => 'El pedido cambió desde que lo armaste.'],
                'issues' => $quote['issues'],
                'quote' => $this->limpiar($quote),
            ], 409);
            return;
        }

        if ($quote['belowMinimum']) {
            Response::json([
                'error' => [
                    'codigo' => 'monto_minimo',
                    'mensaje' => 'El pedido no llega al mínimo para envío.',
                ],
                'quote' => $this->limpiar($quote),
            ], 422);
            return;
        }

        $creado = $this->orders->create($tenant['id'], $menu['id'], $quote, $datos);
        $order = $this->presenter->order($this->orders->find($tenant['id'], $creado['publicId']));

        // El front sirve una sola marca desde la raíz, sin slug en la URL:
        // /pedido/…, no /friedbox/pedido/…
        $checkoutUrl = '/pedido/' . $creado['publicId'];
        $pagoError = null;

        if ($paymentMethod === 'mercadopago') {
            try {
                // Con Mercado Pago conectado es el link de pago: una
                // dirección de otro dominio, y el navegador sale de la app.
                $checkoutUrl = $this->linkDePago($tenant, $creado['publicId']);
            } catch (HttpException $e) {
                // El pedido ya existe. Si Mercado Pago no contestó, el
                // cliente va a su pedido y paga desde ahí con «Ir a pagar».
                $pagoError = $e->getMessage();
            }
        }

        Response::json([
            'order' => $order,
            'checkoutUrl' => $checkoutUrl,
            'pagoError' => $pagoError,
        ], 201);
    }

    /**
     * POST /orders/{publicId}/pagar
     *
     * Un link de pago nuevo para un pedido que todavía no se pagó: el
     * cliente cerró la pestaña de Mercado Pago, o el pago fue rechazado.
     *
     * @param array<string,string> $params
     */
    public function pagar(array $params): void
    {
        $tenant = $this->tenants->find($this->tenants->resolveSlug($params['tenantSlug'] ?? null));
        $publicId = self::publicId($params);
        $order = $this->orders->find($tenant['id'], $publicId);

        if ($order['payment_method'] !== 'mercadopago'
            || !in_array($order['status'], ['pendiente_de_pago', 'pago_rechazado'], true)) {
            throw new HttpException(409, 'Este pedido ya no está esperando el pago.', 'pedido_sin_pago_pendiente');
        }

        Response::json(['checkoutUrl' => $this->linkDePago($tenant, $publicId)]);
    }

    /**
     * POST /orders/{publicId}/pago/sincronizar
     *
     * Le pregunta a Mercado Pago cómo salió el pago y actualiza el
     * pedido. Es lo que confirma el pago en local, donde el webhook no
     * puede llegar, y el respaldo en producción si el webhook se demora.
     * Devuelve el pedido como queda.
     *
     * @param array<string,string> $params
     */
    public function sincronizarPago(array $params): void
    {
        $tenant = $this->tenants->find($this->tenants->resolveSlug($params['tenantSlug'] ?? null));
        $publicId = self::publicId($params);
        $order = $this->orders->find($tenant['id'], $publicId);

        $pagoError = null;
        if ($this->cobros !== null
            && $order['payment_method'] === 'mercadopago'
            && in_array($order['status'], ['pendiente_de_pago', 'pago_rechazado'], true)) {
            try {
                $this->cobros->sincronizar($publicId);
                $order = $this->orders->find($tenant['id'], $publicId);
            } catch (HttpException $e) {
                // Si Mercado Pago no contesta, se muestra el pedido como
                // estaba: el próximo intento lo resuelve.
                $pagoError = $e->getMessage();
            }
        }

        Response::json(['order' => $this->presenter->order($order), 'pagoError' => $pagoError]);
    }

    /**
     * POST /webhooks/mercadopago
     *
     * El aviso de Mercado Pago de que un pago cambió. Trae sólo el id: el
     * pago se pide a la API con el token del local y recién ahí se
     * aplica. Si hay clave secreta configurada, además se valida la firma.
     *
     * Siempre contesta rápido: si tarda o falla, Mercado Pago reintenta.
     */
    public function webhook(string $secreto): void
    {
        if ($this->cobros === null) {
            Response::json(['ok' => false, 'motivo' => 'Mercado Pago no está configurado.']);
            return;
        }

        $cuerpo = json_decode((string) file_get_contents('php://input'), true);
        $cuerpo = is_array($cuerpo) ? $cuerpo : [];

        // Dos formatos conviven: el webhook nuevo ({ type, data: { id } }
        // y ?data.id=) y el IPN viejo (?topic=payment&id=). PHP convierte
        // el punto de «data.id» en guion bajo.
        $tipo = (string) ($cuerpo['type'] ?? $_GET['type'] ?? $_GET['topic'] ?? '');
        $id = (string) ($_GET['data_id'] ?? $cuerpo['data']['id'] ?? $_GET['id'] ?? '');

        if ($tipo !== 'payment' || $id === '') {
            Response::json(['ok' => true, 'ignorado' => true]);
            return;
        }

        if ($secreto !== '' && !MercadoPago::firmaValida(
            (string) ($_SERVER['HTTP_X_SIGNATURE'] ?? ''),
            (string) ($_SERVER['HTTP_X_REQUEST_ID'] ?? ''),
            $id,
            $secreto,
        )) {
            throw new HttpException(401, 'Firma inválida.', 'mp_firma_invalida');
        }

        $this->cobros->aplicarPorId($id);

        Response::json(['ok' => true]);
    }

    /** @param array{id:int,slug:string,name:string} $tenant */
    private function linkDePago(array $tenant, string $publicId): string
    {
        if ($this->mp === null) {
            if (!$this->permitirPagoSimulado) {
                throw new HttpException(503, 'Por ahora este local no acepta Mercado Pago.', 'mp_no_configurado');
            }
            return '/pago-simulado/' . $publicId;
        }

        $order = $this->orders->find($tenant['id'], $publicId);

        return $this->mp->crearPreferencia(
            $order,
            (string) $tenant['name'],
            $this->urlFront,
            $this->urlWebhook,
        )['url'];
    }

    /**
     * GET /orders/{publicId}
     *
     * @param array<string,string> $params
     */
    public function show(array $params): void
    {
        $tenant = $this->tenants->find($this->tenants->resolveSlug($params['tenantSlug'] ?? null));
        $order = $this->orders->find($tenant['id'], self::publicId($params));

        Response::json(['order' => $this->presenter->order($order)]);
    }

    /**
     * POST /orders/{publicId}/pago-simulado  { "resultado": "aprobado" | "rechazado" }
     *
     * Reemplaza al webhook de Mercado Pago hasta que existan las
     * credenciales. Está detrás de ALLOW_FAKE_PAYMENTS porque es,
     * literalmente, un endpoint para dar pedidos por pagados: en
     * producción tiene que devolver 403.
     *
     * @param array<string,string> $params
     */
    public function fakePayment(array $params): void
    {
        if (!$this->permitirPagoSimulado) {
            throw new HttpException(403, 'El pago simulado está deshabilitado.', 'pago_simulado_off');
        }

        $req = Request::json();
        $tenant = $this->tenants->find($this->tenants->resolveSlug($params['tenantSlug'] ?? null));

        // Sin valor por defecto a propósito: si el cliente manda algo que
        // no se entiende, la respuesta es un error. Caer en "aprobado"
        // convertiría cualquier typo en un cobro dado por bueno.
        $resultado = $req->str('resultado', 20);
        if (!in_array($resultado, ['aprobado', 'rechazado'], true)) {
            throw HttpException::badRequest(
                'El resultado del pago tiene que ser «aprobado» o «rechazado».',
                'resultado_invalido',
            );
        }

        $order = $this->orders->settlePayment(
            $tenant['id'],
            self::publicId($params),
            $resultado === 'aprobado',
            'simulado',
            'sim_' . bin2hex(random_bytes(6)),
        );

        Response::json(['order' => $this->presenter->order($order)]);
    }

    /* ----------------------------------------------------------------- */

    /**
     * @param array<string,string> $params
     * @return array{0: array<string,mixed>, 1: array{id:int,slug:string,name:string}, 2: array<string,mixed>}
     */
    private function contexto(array $params): array
    {
        $tenant = $this->tenants->find($this->tenants->resolveSlug($params['tenantSlug'] ?? null));
        $menu = $this->menus->menu($tenant['id'], $params['menuSlug'] ?? null);

        return [$tenant, $menu, $this->menus->settings($tenant['id'])];
    }

    /**
     * Corta el pedido si el local no está tomando pedidos.
     *
     * Va sólo en `create`, no en `quote`: ver un total con el local
     * cerrado no hace daño y la carta sigue siendo útil para mirar. Lo
     * que no puede pasar es que entre un pedido a una cocina apagada.
     *
     * @param array<string,mixed> $settings
     */
    private function exigirAbierto(array $settings): void
    {
        if ((bool) ($settings['is_open'] ?? 1)) {
            return;
        }

        $mensaje = trim((string) ($settings['closed_message'] ?? ''));

        throw new HttpException(
            409,
            $mensaje !== '' ? $mensaje : 'El local no está tomando pedidos en este momento.',
            'local_cerrado',
        );
    }

    /**
     * @param array<string,mixed> $datos
     * @param array<string,mixed> $settings
     * @return array<string,string>
     */
    private function validar(array $datos, array $settings): array
    {
        $errores = [];
        $c = $datos['customer'];

        if (mb_strlen($c['name']) < 2) {
            $errores['name'] = 'Necesitamos un nombre para llamarte.';
        }

        if (strlen(preg_replace('/\D/', '', $c['phone']) ?? '') < 8) {
            $errores['phone'] = 'Poné un teléfono con área, sin el 15.';
        }

        if ($c['email'] !== '' && !filter_var($c['email'], FILTER_VALIDATE_EMAIL)) {
            $errores['email'] = 'Ese correo no parece válido.';
        }

        if ($datos['mode'] === 'delivery') {
            if (!$settings['accepts_delivery']) {
                $errores['mode'] = 'Este local no hace envíos.';
            }
            if (mb_strlen($c['address']) < 5) {
                $errores['address'] = 'Calle y altura, así el repartidor te encuentra.';
            }
        }

        if ($datos['mode'] === 'pickup' && !$settings['accepts_pickup']) {
            $errores['mode'] = 'Este local no permite retirar.';
        }

        return $errores;
    }

    /** El detalle interno de las opciones y los centavos no salen a la calle. */
    private function limpiar(array $quote): array
    {
        unset($quote['cents'], $quote['couponId']);

        $quote['lines'] = array_map(static function (array $line): array {
            unset($line['options'], $line['productId'], $line['basePrice']);
            return $line;
        }, $quote['lines']);

        return $quote;
    }

    /** @param array<string,mixed> $obj */
    private static function campo(array $obj, string $key, int $max): string
    {
        $value = $obj[$key] ?? '';
        if (!is_string($value)) {
            return '';
        }
        $clean = preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '';

        return mb_substr(trim($clean), 0, $max);
    }

    private static function numero(mixed $value): ?float
    {
        if (is_string($value)) {
            $value = str_replace(['.', ' '], '', $value);
            $value = str_replace(',', '.', $value);
        }

        return is_numeric($value) ? (float) $value : null;
    }

    /** @param array<string,string> $params */
    private static function publicId(array $params): string
    {
        $id = $params['publicId'] ?? '';

        if (preg_match('/^ord_[0-9a-f]{22}$/', $id) !== 1) {
            throw HttpException::notFound('No encontramos ese pedido.', 'pedido_no_encontrado');
        }

        return $id;
    }
}
