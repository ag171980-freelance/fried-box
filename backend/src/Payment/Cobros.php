<?php

declare(strict_types=1);

namespace Foodix\Payment;

use Foodix\Order\OrderRepository;

/**
 * Lo que pasa con un pedido cuando Mercado Pago dice algo de su pago.
 *
 * Llega por dos caminos que terminan acá: el webhook (en producción) y
 * la pantalla del pedido preguntando (siempre, y es lo único que anda en
 * local). Los dos pueden traer el mismo pago varias veces, así que todo
 * es idempotente: un pago ya registrado no se vuelve a procesar.
 */
final class Cobros
{
    /** Estados de Mercado Pago que todavía pueden terminar bien. */
    private const EN_CURSO = ['pending', 'in_process', 'authorized', 'in_mediation'];

    public function __construct(
        private readonly OrderRepository $orders,
        private readonly MercadoPago $mp,
    ) {
    }

    /**
     * Le pregunta a Mercado Pago por los pagos del pedido y aplica el que
     * corresponda: uno aprobado si hay, si no el último.
     */
    public function sincronizar(string $publicId): void
    {
        $pagos = $this->mp->pagosDe($publicId);
        if ($pagos === []) {
            return;
        }

        $aprobado = null;
        foreach ($pagos as $p) {
            if (($p['status'] ?? '') === 'approved') {
                $aprobado = $p;
                break;
            }
        }

        $this->aplicar($aprobado ?? $pagos[0]);
    }

    /** El webhook trae sólo el id: el pago se pide a la API, nunca se cree lo que llegó. */
    public function aplicarPorId(string $paymentId): void
    {
        $this->aplicar($this->mp->pago($paymentId));
    }

    /** @param array<string,mixed> $pago tal como lo devuelve la API */
    private function aplicar(array $pago): void
    {
        $publicId = (string) ($pago['external_reference'] ?? '');
        $tenantId = $this->orders->tenantDePedido($publicId);
        if ($tenantId === null) {
            return; // Un pago que no es de un pedido nuestro.
        }

        $ref = (string) ($pago['id'] ?? '');
        if ($ref === '' || $this->orders->pagoRegistrado('mercadopago', $ref)) {
            return;
        }

        $estado = (string) ($pago['status'] ?? '');
        if (in_array($estado, self::EN_CURSO, true)) {
            return; // Todavía no se sabe: el próximo aviso lo resuelve.
        }

        $order = $this->orders->find($tenantId, $publicId);
        $payload = json_encode($pago, JSON_UNESCAPED_UNICODE) ?: null;
        $monto = round((float) ($pago['transaction_amount'] ?? 0), 2);

        if ($estado !== 'approved') {
            // Rechazado o cancelado. Si el pedido ya estaba pagado (con
            // otro intento), este rechazo viejo no lo toca.
            if ($order['payment_status'] === 'aprobado') {
                $this->orders->registrarPago((int) $order['id'], 'mercadopago', $ref, 'rechazado', $monto, $payload);
                return;
            }
            $this->orders->settlePayment($tenantId, $publicId, false, 'mercadopago', $ref, $payload);
            return;
        }

        // Aprobado. Antes de dar el pedido por pagado: que sea la plata
        // que dice el pedido, en la misma moneda.
        $coincide = abs($monto - round((float) $order['total'], 2)) < 0.01
            && ($pago['currency_id'] ?? $order['currency']) === $order['currency'];

        if ($order['status'] === 'cancelado' || !$coincide) {
            $this->orders->registrarPago((int) $order['id'], 'mercadopago', $ref, 'aprobado', $monto, $payload);
            $this->orders->addEvent(
                (int) $order['id'],
                (string) $order['status'],
                $order['status'] === 'cancelado'
                    ? sprintf('Llegó un pago aprobado (Mercado Pago %s) de un pedido cancelado: hay que devolverlo.', $ref)
                    : sprintf('El pago de Mercado Pago %s no coincide con el total: revisarlo antes de preparar.', $ref),
                'pasarela',
            );
            return;
        }

        $this->orders->settlePayment($tenantId, $publicId, true, 'mercadopago', $ref, $payload);
    }
}
