<?php

declare(strict_types=1);

namespace Foodix\Order;

/**
 * La forma en que sale un pedido hacia el front.
 *
 * Igual que MenuPresenter: si una pantalla deja de dibujar algo, se
 * abre este archivo primero.
 */
final class OrderPresenter
{
    /** Los pasos que muestra la pantalla de seguimiento, según el modo. */
    private const FLOW_DELIVERY = ['confirmado', 'cocina', 'camino', 'entregado'];
    private const FLOW_PICKUP = ['confirmado', 'cocina', 'listo', 'entregado'];

    /**
     * @param array<string,mixed> $order
     * @return array<string,mixed>
     */
    public function order(array $order): array
    {
        $lines = [];
        foreach ($order['items'] as $item) {
            $options = $order['optionsByItem'][(int) $item['id']] ?? [];

            $lines[] = [
                'key' => 'oi' . $item['id'],
                'itemId' => $item['product_slug'],
                'name' => $item['name'],
                'qty' => (int) $item['qty'],
                'unitPrice' => (float) $item['unit_price'],
                'total' => (float) $item['line_total'],
                'optionsLabel' => Pricing::label(array_column($options, 'name')),
                'note' => $item['note'],
                'available' => true,
            ];
        }

        $flow = $order['mode'] === 'delivery' ? self::FLOW_DELIVERY : self::FLOW_PICKUP;
        $status = (string) $order['status'];

        return [
            'id' => $order['public_id'],
            'number' => (string) $order['number'],
            'status' => $status,
            'mode' => $order['mode'],
            'paymentMethod' => $order['payment_method'],
            'paymentStatus' => $order['payment_status'],
            'createdAt' => self::iso($order['created_at']),
            'paidAt' => self::iso($order['paid_at']),

            'customer' => [
                'name' => $order['customer_name'],
                'phone' => $order['customer_phone'],
                'address' => $order['address'],
                'apt' => $order['address_extra'],
            ],
            'note' => $order['note'],
            'changeFor' => $order['change_for'] === null ? null : (float) $order['change_for'],

            'lines' => $lines,
            'subtotal' => (float) $order['subtotal'],
            'discount' => (float) $order['discount'],
            'promoDiscount' => (float) $order['promo_discount'],
            'promoLabel' => $order['promo_label'],
            'shipping' => (float) $order['shipping'],
            'total' => (float) $order['total'],
            'currency' => $order['currency'],
            'coupon' => $order['coupon_code'] === null
                ? null
                : ['code' => $order['coupon_code'], 'label' => null],
            'eta' => $order['eta_text'],

            // El front dibuja la línea de tiempo con esto y no tiene que
            // saber qué estado va después de cuál.
            'flow' => array_map(
                static fn (string $paso): array => [
                    'id' => $paso,
                    'name' => self::stepName($paso),
                ],
                $flow,
            ),
            'flowIndex' => self::flowIndex($flow, $status),
            'events' => array_map(
                static fn (array $e): array => [
                    'status' => $e['status'],
                    'note' => $e['note'],
                    'at' => self::iso($e['created_at']),
                ],
                $order['events'] ?? [],
            ),
        ];
    }

    private static function flowIndex(array $flow, string $status): int
    {
        // -1 = todavía no arrancó (falta pagar, o el pago fue rechazado).
        $i = array_search($status, $flow, true);

        return $i === false ? -1 : (int) $i;
    }

    private static function stepName(string $paso): string
    {
        return match ($paso) {
            'confirmado' => 'Pedido confirmado',
            'cocina' => 'En la cocina',
            'camino' => 'En camino',
            'listo' => 'Listo para retirar',
            'entregado' => 'Entregado',
            default => $paso,
        };
    }

    private static function iso(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return str_replace(' ', 'T', $value);
    }
}
