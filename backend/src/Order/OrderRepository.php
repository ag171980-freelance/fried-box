<?php

declare(strict_types=1);

namespace Foodix\Order;

use Foodix\Support\HttpException;
use Foodix\Support\Money;
use PDO;
use Throwable;

final class OrderRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    /**
     * Crea el pedido entero o no crea nada.
     *
     * Todo va en una transacción: si falla al guardar la tercera línea,
     * no puede quedar en la base media comanda que la cocina vea y
     * prepare.
     *
     * @param array<string,mixed> $quote  lo que devolvió Pricing
     * @param array<string,mixed> $datos  cliente, modo, pago, aclaración
     * @return array{id:int, publicId:string, number:int}
     */
    public function create(int $tenantId, int $menuId, array $quote, array $datos): array
    {
        $publicId = 'ord_' . bin2hex(random_bytes(11));

        $esContado = $datos['paymentMethod'] !== 'mercadopago';
        $status = $esContado ? 'confirmado' : 'pendiente_de_pago';
        $paymentStatus = $esContado ? 'a_convenir' : 'pendiente';

        $this->db->beginTransaction();

        try {
            $number = $this->nextNumber($tenantId);

            $stmt = $this->db->prepare(
                'INSERT INTO orders
                   (tenant_id, menu_id, public_id, number, status, mode,
                    payment_method, payment_status,
                    customer_name, customer_phone, customer_email,
                    address, address_extra, note, change_for,
                    coupon_id, coupon_code,
                    subtotal, discount, shipping, total, currency, eta_text)
                 VALUES
                   (:tenant, :menu, :public, :number, :status, :mode,
                    :method, :pstatus,
                    :name, :phone, :email,
                    :address, :extra, :note, :change,
                    :coupon_id, :coupon_code,
                    :subtotal, :discount, :shipping, :total, :currency, :eta)',
            );

            $stmt->execute([
                'tenant' => $tenantId,
                'menu' => $menuId,
                'public' => $publicId,
                'number' => $number,
                'status' => $status,
                'mode' => $datos['mode'],
                'method' => $datos['paymentMethod'],
                'pstatus' => $paymentStatus,
                'name' => $datos['customer']['name'],
                'phone' => $datos['customer']['phone'],
                'email' => $datos['customer']['email'] ?: null,
                'address' => $datos['customer']['address'] ?: null,
                'extra' => $datos['customer']['apt'] ?: null,
                'note' => $datos['note'] ?: null,
                'change' => $datos['customer']['changeFor'] === null
                    ? null
                    : Money::toDecimal(Money::toCents($datos['customer']['changeFor'])),
                'coupon_id' => $quote['couponId'],
                'coupon_code' => $quote['coupon']['code'] ?? null,
                'subtotal' => Money::toDecimal($quote['cents']['subtotal']),
                'discount' => Money::toDecimal($quote['cents']['discount']),
                'shipping' => Money::toDecimal($quote['cents']['shipping']),
                'total' => Money::toDecimal($quote['cents']['total']),
                'currency' => $quote['currency'],
                'eta' => $quote['eta'],
            ]);

            $orderId = (int) $this->db->lastInsertId();

            $insItem = $this->db->prepare(
                'INSERT INTO order_items
                   (order_id, product_id, product_slug, name, base_price, unit_price, qty, line_total, note, sort_order)
                 VALUES (:order, :product, :slug, :name, :base, :unit, :qty, :total, :note, :sort)',
            );
            $insOption = $this->db->prepare(
                'INSERT INTO order_item_options
                   (order_item_id, choice_id, group_slug, choice_slug, name, price_delta, sort_order)
                 VALUES (:item, :choice, :group, :cslug, :name, :delta, :sort)',
            );

            foreach ($quote['lines'] as $i => $line) {
                $insItem->execute([
                    'order' => $orderId,
                    'product' => $line['productId'],
                    'slug' => $line['itemId'],
                    'name' => $line['name'],
                    'base' => Money::toDecimal(Money::toCents($line['basePrice'])),
                    'unit' => Money::toDecimal(Money::toCents($line['unitPrice'])),
                    'qty' => $line['qty'],
                    'total' => Money::toDecimal(Money::toCents($line['total'])),
                    'note' => $line['note'] ?: null,
                    'sort' => $i,
                ]);

                $itemId = (int) $this->db->lastInsertId();

                foreach (array_values($line['options']) as $j => $opt) {
                    $insOption->execute([
                        'item' => $itemId,
                        'choice' => (int) $opt['choice_id'],
                        'group' => $opt['group_slug'],
                        'cslug' => $opt['choice_slug'],
                        'name' => $opt['choice_name'],
                        'delta' => Money::toDecimal(Money::toCents($opt['price_delta'])),
                        'sort' => $j,
                    ]);
                }
            }

            if ($quote['couponId'] !== null) {
                $this->db
                    ->prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = :id')
                    ->execute(['id' => $quote['couponId']]);
            }

            $this->addEvent($orderId, $status, 'Pedido recibido', 'cliente');

            $this->db->prepare(
                'INSERT INTO payments (order_id, provider, status, amount)
                 VALUES (:order, :provider, :status, :amount)',
            )->execute([
                'order' => $orderId,
                'provider' => $datos['paymentMethod'],
                'status' => $esContado ? 'pendiente' : 'pendiente',
                'amount' => Money::toDecimal($quote['cents']['total']),
            ]);

            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return ['id' => $orderId, 'publicId' => $publicId, 'number' => $number];
    }

    /**
     * Reserva el próximo número del local.
     *
     * FOR UPDATE bloquea la fila hasta el commit. Sin eso, dos pedidos
     * simultáneos leen el mismo valor y el segundo choca contra la clave
     * única (tenant_id, number).
     */
    private function nextNumber(int $tenantId): int
    {
        $this->db
            ->prepare('INSERT IGNORE INTO order_counters (tenant_id, next_number) VALUES (:t, 1001)')
            ->execute(['t' => $tenantId]);

        $stmt = $this->db->prepare('SELECT next_number FROM order_counters WHERE tenant_id = :t FOR UPDATE');
        $stmt->execute(['t' => $tenantId]);
        $number = (int) $stmt->fetchColumn();

        $this->db
            ->prepare('UPDATE order_counters SET next_number = next_number + 1 WHERE tenant_id = :t')
            ->execute(['t' => $tenantId]);

        return $number;
    }

    public function addEvent(int $orderId, string $status, ?string $note, string $source): void
    {
        $this->db->prepare(
            'INSERT INTO order_events (order_id, status, note, source) VALUES (:o, :s, :n, :src)',
        )->execute(['o' => $orderId, 's' => $status, 'n' => $note, 'src' => $source]);
    }

    /**
     * Un pedido con todo adentro.
     *
     * Se busca por public_id y además por tenant: el enlace de un pedido
     * de un local no puede abrirse desde otro.
     *
     * @return array<string,mixed>
     */
    public function find(int $tenantId, string $publicId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM orders WHERE tenant_id = :t AND public_id = :p LIMIT 1',
        );
        $stmt->execute(['t' => $tenantId, 'p' => $publicId]);
        $order = $stmt->fetch();

        if ($order === false) {
            throw HttpException::notFound('No encontramos ese pedido.', 'pedido_no_encontrado');
        }

        $orderId = (int) $order['id'];

        $stmt = $this->db->prepare(
            'SELECT id, product_slug, name, unit_price, qty, line_total, note
               FROM order_items WHERE order_id = :o ORDER BY sort_order ASC, id ASC',
        );
        $stmt->execute(['o' => $orderId]);
        $items = $stmt->fetchAll();

        $stmt = $this->db->prepare(
            'SELECT oio.order_item_id, oio.name, oio.price_delta
               FROM order_item_options oio
               JOIN order_items oi ON oi.id = oio.order_item_id
              WHERE oi.order_id = :o
              ORDER BY oio.sort_order ASC, oio.id ASC',
        );
        $stmt->execute(['o' => $orderId]);

        $optionsByItem = [];
        foreach ($stmt->fetchAll() as $row) {
            $optionsByItem[(int) $row['order_item_id']][] = $row;
        }

        $stmt = $this->db->prepare(
            'SELECT status, note, source, created_at
               FROM order_events WHERE order_id = :o ORDER BY created_at ASC, id ASC',
        );
        $stmt->execute(['o' => $orderId]);

        $order['items'] = $items;
        $order['optionsByItem'] = $optionsByItem;
        $order['events'] = $stmt->fetchAll();

        return $order;
    }

    /**
     * Registra el resultado de un cobro y mueve el pedido.
     *
     * @return array<string,mixed> el pedido actualizado
     */
    public function settlePayment(
        int $tenantId,
        string $publicId,
        bool $approved,
        string $provider,
        ?string $providerRef,
        ?string $payload = null,
    ): array {
        $order = $this->find($tenantId, $publicId);
        $orderId = (int) $order['id'];

        if ($order['payment_status'] === 'aprobado') {
            // Mercado Pago reintenta los webhooks. Cobrar dos veces el
            // mismo pedido no es una opción.
            return $this->find($tenantId, $publicId);
        }

        $status = $approved ? 'confirmado' : 'pago_rechazado';
        $paymentStatus = $approved ? 'aprobado' : 'rechazado';

        $this->db->beginTransaction();

        try {
            $this->db->prepare(
                'UPDATE orders
                    SET status = :s, payment_status = :ps, paid_at = :paid
                  WHERE id = :id',
            )->execute([
                's' => $status,
                'ps' => $paymentStatus,
                'paid' => $approved ? date('Y-m-d H:i:s') : null,
                'id' => $orderId,
            ]);

            $this->db->prepare(
                'INSERT INTO payments (order_id, provider, provider_ref, status, amount, payload)
                 VALUES (:o, :prov, :ref, :st, :amount, :payload)',
            )->execute([
                'o' => $orderId,
                'prov' => $provider,
                'ref' => $providerRef,
                'st' => $paymentStatus,
                'amount' => $order['total'],
                'payload' => $payload,
            ]);

            $this->addEvent(
                $orderId,
                $status,
                $approved ? 'Pago acreditado' : 'El pago no pasó',
                'pasarela',
            );

            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return $this->find($tenantId, $publicId);
    }
}
