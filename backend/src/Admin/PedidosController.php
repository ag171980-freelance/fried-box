<?php

declare(strict_types=1);

namespace Foodix\Admin;

use DateTimeImmutable;
use Foodix\Order\OrderPresenter;
use Foodix\Order\OrderRepository;
use Foodix\Support\HttpException;
use Foodix\Support\Request;
use Foodix\Support\Response;

/**
 * Los pedidos, del lado del local: los que hay que preparar ahora y los
 * que ya pasaron.
 *
 * Igual que el resto del panel, el tenant sale del usuario logueado y
 * nunca de la petición: un local no puede ver ni mover pedidos de otro.
 */
final class PedidosController
{
    /** Lo que todavía necesita que alguien haga algo. */
    private const EN_CURSO = ['pendiente_de_pago', 'confirmado', 'cocina', 'camino', 'listo'];

    /** Lo que ya terminó, para bien o para mal. */
    private const CERRADOS = ['entregado', 'cancelado', 'pago_rechazado'];

    private const FLOW = [
        'delivery' => ['confirmado', 'cocina', 'camino', 'entregado'],
        'pickup' => ['confirmado', 'cocina', 'listo', 'entregado'],
    ];

    /** Lo que queda en el historial del pedido, y lo que lee el cliente. */
    private const NOTAS = [
        'confirmado' => 'Pedido confirmado',
        'cocina' => 'En la cocina',
        'camino' => 'Salió para tu dirección',
        'listo' => 'Listo para retirar',
        'entregado' => 'Entregado',
        'cancelado' => 'El local canceló el pedido',
    ];

    public function __construct(
        private readonly Auth $auth,
        private readonly OrderRepository $orders,
        private readonly OrderPresenter $presenter,
        private readonly EstadisticasRepository $estadisticas,
    ) {
    }

    /**
     * GET /admin/orders?vista=curso
     * GET /admin/orders?vista=historial&dia=2026-10-29&q=juan
     */
    public function listar(): void
    {
        $t = $this->tenant();
        $vista = ($_GET['vista'] ?? 'curso') === 'historial' ? 'historial' : 'curso';
        $buscar = trim(mb_substr((string) ($_GET['q'] ?? ''), 0, 60));

        if ($vista === 'curso') {
            // Sin fecha: un pedido de anoche que quedó sin entregar
            // también tiene que aparecer.
            $filas = $this->orders->panel($t, self::EN_CURSO, null, null, $buscar);
        } else {
            [$desde, $hasta] = self::dia((string) ($_GET['dia'] ?? ''));
            $filas = $this->orders->panel($t, self::CERRADOS, $desde, $hasta, $buscar, 500);
        }

        $pedidos = array_map(fn (array $o): array => $this->vista($o), $filas);

        Response::json([
            'vista' => $vista,
            'orders' => $pedidos,
            'enCurso' => count($this->orders->panel($t, ['confirmado', 'cocina', 'camino', 'listo'], null, null, null)),
        ]);
    }

    /**
     * GET /admin/stats?dias=30
     *
     * Los totales (hoy, mes, desde siempre) no dependen de $dias; el
     * resto mira los últimos $dias días.
     */
    public function estadisticas(): void
    {
        $t = $this->tenant();
        $dias = (int) ($_GET['dias'] ?? 30);
        $dias = in_array($dias, [7, 30, 90, 365], true) ? $dias : 30;

        Response::json(['dias' => $dias] + $this->estadisticas->resumen($t, $dias));
    }

    /** GET /admin/orders/{id} */
    public function mostrar(array $params): void
    {
        $t = $this->tenant();

        Response::json(['order' => $this->vista($this->orders->find($t, self::publicId($params)))]);
    }

    /**
     * POST /admin/orders/{id}/estado   { status, note? }
     *
     * Sólo se aceptan los movimientos que el pedido tiene disponibles:
     * avanzar un paso, volver uno atrás si se tocó sin querer, o cancelar.
     */
    public function cambiarEstado(array $params): void
    {
        $t = $this->tenant();
        $id = self::publicId($params);
        $req = Request::json();

        $order = $this->orders->find($t, $id);
        $acciones = self::acciones($order);
        $status = $req->str('status', 32);

        $permitidos = array_filter([$acciones['siguiente'], $acciones['anterior'], $acciones['cancelar'] ? 'cancelado' : null]);
        if (!in_array($status, $permitidos, true)) {
            throw HttpException::badRequest('El pedido ya no puede pasar a ese estado.', 'estado_invalido');
        }

        // Sólo la cancelación lleva un motivo escrito por el local: es lo
        // que lee el cliente en su pedido. El resto usa el texto fijo.
        $nota = trim($req->str('note', 200));
        if ($status !== 'cancelado' || $nota === '') {
            $nota = self::NOTAS[$status] ?? null;
        }

        $this->orders->cambiarEstado($t, $id, $status, $nota);

        Response::json(['order' => $this->vista($this->orders->find($t, $id))]);
    }

    /* ---------------------------------------------------------------- */

    private function tenant(): int
    {
        return (int) $this->auth->exigirUsuario()['tenant_id'];
    }

    /**
     * Lo mismo que ve el cliente, más lo que necesita el local: el mail,
     * de dónde vino cada cambio y qué botones mostrar.
     *
     * @param array<string,mixed> $order
     * @return array<string,mixed>
     */
    private function vista(array $order): array
    {
        $vista = $this->presenter->order($order);
        $vista['customer']['email'] = $order['customer_email'];
        $vista['updatedAt'] = str_replace(' ', 'T', (string) $order['updated_at']);
        $vista['acciones'] = self::acciones($order);
        $vista['events'] = array_map(
            static fn (array $e): array => [
                'status' => $e['status'],
                'note' => $e['note'],
                'source' => $e['source'],
                'at' => str_replace(' ', 'T', (string) $e['created_at']),
            ],
            $order['events'] ?? [],
        );

        return $vista;
    }

    /**
     * @param array<string,mixed> $order
     * @return array{siguiente: ?string, anterior: ?string, cancelar: bool}
     */
    private static function acciones(array $order): array
    {
        $status = (string) $order['status'];
        $flow = self::FLOW[$order['mode']] ?? self::FLOW['delivery'];
        $i = array_search($status, $flow, true);

        if ($i === false) {
            // Esperando el pago: el local no lo puede confirmar a mano
            // (no sabe si se cobró), pero sí cancelarlo. Cancelado y
            // rechazado ya no se mueven.
            return ['siguiente' => null, 'anterior' => null, 'cancelar' => $status === 'pendiente_de_pago'];
        }

        return [
            'siguiente' => $flow[$i + 1] ?? null,
            // Volver un paso sirve para deshacer un toque de más. Desde
            // «confirmado» no hay a dónde volver.
            'anterior' => $i > 0 ? $flow[$i - 1] : null,
            'cancelar' => $status !== 'entregado',
        ];
    }

    /**
     * El día pedido, como rango [desde, hasta). Por defecto, hoy.
     *
     * @return array{0: string, 1: string}
     */
    private static function dia(string $dia): array
    {
        $fecha = DateTimeImmutable::createFromFormat('!Y-m-d', $dia) ?: new DateTimeImmutable('today');

        return [$fecha->format('Y-m-d 00:00:00'), $fecha->modify('+1 day')->format('Y-m-d 00:00:00')];
    }

    /** @param array<string,string> $params */
    private static function publicId(array $params): string
    {
        $id = (string) ($params['id'] ?? '');
        if (!preg_match('/^ord_[a-z0-9]{10,40}$/', $id)) {
            throw HttpException::notFound('No encontramos ese pedido.', 'pedido_no_encontrado');
        }

        return $id;
    }
}
