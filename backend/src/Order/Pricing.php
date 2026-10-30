<?php

declare(strict_types=1);

namespace Foodix\Order;

use Foodix\Support\Money;
use PDO;

/**
 * El precio de un pedido se calcula acá y en ningún otro lado.
 *
 * El front manda qué platos y qué opciones, nunca cuánto salen. Todo lo
 * que llega del cliente se vuelve a buscar en la base: el precio, si el
 * plato sigue disponible y si esa opción pertenece de verdad a ese
 * plato. Un carrito puede haber estado dos días en localStorage, o
 * puede venir armado a mano.
 */
final class Pricing
{
    public function __construct(private readonly PDO $db)
    {
    }

    /**
     * @param list<array{key:string, itemId:string, qty:int, optionIds:list<string>, note:string}> $lines
     * @param array<string,mixed> $settings
     * @return array<string,mixed>
     */
    public function quote(
        int $tenantId,
        int $menuId,
        array $lines,
        string $mode,
        ?string $couponCode,
        array $settings,
    ): array {
        $slugs = array_values(array_unique(array_column($lines, 'itemId')));
        $products = $slugs === [] ? [] : $this->products($tenantId, $menuId, $slugs);
        $allowed = $products === [] ? [] : $this->allowedChoices($tenantId, $menuId, array_column($products, 'id'));
        $promos = $products === [] ? [] : (new PromoRules($this->db))->vigentesHoy($tenantId, $menuId);

        $issues = [];
        $priced = [];
        $subtotalCents = 0;
        $promoCents = 0;
        $promosAplicadas = [];

        foreach ($lines as $line) {
            $product = $products[$line['itemId']] ?? null;

            if ($product === null) {
                $issues[] = [
                    'key' => $line['key'],
                    'codigo' => 'plato_no_disponible',
                    'mensaje' => 'Sacamos un plato de la carta y ya no lo podemos preparar.',
                ];
                $priced[] = [
                    'key' => $line['key'],
                    'itemId' => $line['itemId'],
                    'name' => null,
                    'qty' => $line['qty'],
                    'unitPrice' => 0.0,
                    'total' => 0.0,
                    'optionsLabel' => '',
                    'note' => $line['note'],
                    'available' => false,
                ];
                continue;
            }

            $productId = (int) $product['id'];
            $choices = $allowed[$productId] ?? [];

            $picked = [];
            $extraCents = 0;
            foreach ($line['optionIds'] as $choiceSlug) {
                if (!isset($choices[$choiceSlug])) {
                    $issues[] = [
                        'key' => $line['key'],
                        'codigo' => 'opcion_invalida',
                        'mensaje' => sprintf('«%s» ya no está disponible para %s.', $choiceSlug, $product['name']),
                    ];
                    continue;
                }
                $picked[] = $choices[$choiceSlug];
                $extraCents += Money::toCents($choices[$choiceSlug]['price_delta']);
            }

            foreach ($this->groupIssues($line['key'], $product, $choices, $picked) as $issue) {
                $issues[] = $issue;
            }

            $unitCents = Money::toCents($product['price']) + $extraCents;
            $totalCents = $unitCents * $line['qty'];
            $subtotalCents += $totalCents;

            // La promo se calcula sobre la línea entera, opciones incluidas.
            $promo = PromoRules::mejorPara($promos, $productId, (int) $product['category_id']);
            $lineaPromoCents = $promo === null ? 0 : Money::percentOf($totalCents, $promo['percent']);
            $promoCents += $lineaPromoCents;
            if ($promo !== null) {
                $promosAplicadas[$promo['id']] = $promo['title'];
            }

            $priced[] = [
                'key' => $line['key'],
                'itemId' => $product['slug'],
                'productId' => $productId,
                'name' => $product['name'],
                'qty' => $line['qty'],
                'basePrice' => Money::fromCents(Money::toCents($product['price'])),
                'unitPrice' => Money::fromCents($unitCents),
                'total' => Money::fromCents($totalCents),
                'options' => $picked,
                'optionsLabel' => self::label(array_column($picked, 'choice_name')),
                'note' => $line['note'],
                'available' => true,
                'promo' => $promo === null ? null : [
                    'title' => $promo['title'],
                    'percent' => $promo['percent'],
                    'discount' => Money::fromCents($lineaPromoCents),
                ],
            ];
        }

        /* --- envío, cupón y total ------------------------------------ */

        // El envío puede estar a cotizar: lo manda un tercero y el precio
        // todavía no se sabe. Entonces no se suma nada, porque inventar
        // un número sería peor, y se avisa para que el ticket diga «a
        // cotizar» en vez de «sin cargo», que querría decir gratis.
        $shippingVariable = $mode === 'delivery' && (bool) ($settings['delivery_fee_variable'] ?? false);
        $shippingCents = $mode === 'delivery' && !$shippingVariable
            ? Money::toCents($settings['delivery_fee'])
            : 0;

        $hayMinimo = (bool) ($settings['min_order_enabled'] ?? true);
        $minOrderCents = $hayMinimo ? Money::toCents($settings['min_order']) : 0;

        [$coupon, $couponError] = $this->coupon($tenantId, $couponCode, $subtotalCents);

        // Un cupón de envío gratis sobre un envío que todavía no tiene
        // precio no descuenta nada, y dejarlo puesto diría «Envío sin
        // cargo» arriba de un «a cotizar». Se rechaza con el motivo.
        if ($coupon !== null && $coupon['type'] === 'shipping' && $shippingVariable) {
            $coupon = null;
            $couponError = 'El envío de este pedido se cotiza aparte, así que ese código no se puede aplicar.';
        }

        // El cupón va sobre lo que queda después de la promo: un 10% de
        // cupón encima de un 10% de promo no descuenta un 20% del total.
        $baseCuponCents = $subtotalCents - $promoCents;

        $discountCents = 0;
        if ($coupon !== null) {
            $discountCents = match ($coupon['type']) {
                'percent' => Money::percentOf($baseCuponCents, (float) $coupon['value']),
                'fixed' => min(Money::toCents($coupon['value']), $baseCuponCents),
                default => 0,
            };
            if ($coupon['type'] === 'shipping') {
                $shippingCents = 0;
            }
        }

        $totalCents = max(0, $subtotalCents - $promoCents - $discountCents + $shippingCents);
        $belowMinimum = $hayMinimo && $mode === 'delivery' && $subtotalCents < $minOrderCents;

        return [
            'lines' => $priced,
            'subtotal' => Money::fromCents($subtotalCents),
            'discount' => Money::fromCents($discountCents),
            'promoDiscount' => Money::fromCents($promoCents),
            'promoLabel' => $promosAplicadas === [] ? null : implode(' · ', $promosAplicadas),
            'shipping' => Money::fromCents($shippingCents),
            'shippingVariable' => $shippingVariable,
            'total' => Money::fromCents($totalCents),
            'currency' => $settings['currency'],
            'coupon' => $coupon === null ? null : [
                'code' => $coupon['code'],
                'label' => $coupon['label'],
                'type' => $coupon['type'],
            ],
            'couponId' => $coupon === null ? null : (int) $coupon['id'],
            'couponError' => $couponError,
            'belowMinimum' => $belowMinimum,
            'minOrder' => $hayMinimo ? Money::fromCents($minOrderCents) : null,
            'eta' => $mode === 'delivery'
                ? sprintf('%d a %d min', (int) $settings['eta_delivery_min'], (int) $settings['eta_delivery_max'])
                : sprintf('%d a %d min', (int) $settings['eta_pickup_min'], (int) $settings['eta_pickup_max']),
            'issues' => $issues,
            'valid' => $issues === [] && $priced !== [],
            'cents' => [
                'subtotal' => $subtotalCents,
                'discount' => $discountCents,
                'promoDiscount' => $promoCents,
                'shipping' => $shippingCents,
                'total' => $totalCents,
            ],
        ];
    }

    /**
     * El resumen de opciones de una línea. Las repetidas se juntan:
     * «Mayo de ajo x2 · Barbacoa», no «Mayo de ajo · Mayo de ajo · Barbacoa».
     *
     * @param list<string> $names
     */
    public static function label(array $names): string
    {
        $parts = [];
        foreach (array_count_values($names) as $name => $count) {
            $parts[] = $count > 1 ? sprintf('%s x%d', $name, $count) : (string) $name;
        }

        return implode(' · ', $parts);
    }

    /**
     * Grupos obligatorios sin elegir y grupos con más opciones de las
     * permitidas. Se avisa pero no se rompe: el carrito viejo se corrige
     * abriendo el plato de nuevo.
     *
     * @param array<string,mixed> $product
     * @param array<string,array<string,mixed>> $choices
     * @param list<array<string,mixed>> $picked
     * @return list<array<string,string>>
     */
    private function groupIssues(string $key, array $product, array $choices, array $picked): array
    {
        $issues = [];
        $porGrupo = [];

        foreach ($choices as $choice) {
            $porGrupo[$choice['group_slug']] ??= [
                'name' => $choice['group_name'],
                'type' => $choice['group_type'],
                'required' => (bool) $choice['group_required'],
                'max' => $choice['group_max'] === null ? null : (int) $choice['group_max'],
                'elegidas' => 0,
                'sola' => null,
            ];
        }

        foreach ($picked as $choice) {
            $porGrupo[$choice['group_slug']]['elegidas']++;
            if ($choice['is_exclusive']) {
                $porGrupo[$choice['group_slug']]['sola'] = $choice['choice_name'];
            }
        }

        foreach ($porGrupo as $grupo) {
            if ($grupo['required'] && $grupo['elegidas'] < 1) {
                $issues[] = [
                    'key' => $key,
                    'codigo' => 'falta_elegir',
                    'mensaje' => sprintf('En %s falta completar «%s».', $product['name'], $grupo['name']),
                ];
            }
            if ($grupo['type'] === 'single' && $grupo['elegidas'] > 1) {
                $issues[] = [
                    'key' => $key,
                    'codigo' => 'demasiadas_opciones',
                    'mensaje' => sprintf('En «%s» se elige una sola opción.', $grupo['name']),
                ];
            }
            if ($grupo['sola'] !== null && $grupo['elegidas'] > 1) {
                $issues[] = [
                    'key' => $key,
                    'codigo' => 'opcion_sola',
                    'mensaje' => sprintf('«%s» no se combina con otras opciones en %s.', $grupo['sola'], $product['name']),
                ];
            }
            if ($grupo['max'] !== null && $grupo['elegidas'] > $grupo['max']) {
                $issues[] = [
                    'key' => $key,
                    'codigo' => 'demasiadas_opciones',
                    'mensaje' => sprintf('En «%s» se eligen hasta %d.', $grupo['name'], $grupo['max']),
                ];
            }
        }

        return $issues;
    }

    /**
     * @param list<string> $slugs
     * @return array<string, array<string,mixed>>  indexado por slug
     */
    private function products(int $tenantId, int $menuId, array $slugs): array
    {
        $in = implode(',', array_fill(0, count($slugs), '?'));
        $stmt = $this->db->prepare(
            "SELECT id, slug, name, price, category_id
               FROM products
              WHERE tenant_id = ? AND menu_id = ? AND is_available = 1
                AND slug IN ($in)",
        );
        $stmt->execute([$tenantId, $menuId, ...$slugs]);

        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(string) $row['slug']] = $row;
        }

        return $out;
    }

    /**
     * Las opciones que cada plato realmente admite. Sin esto, un cliente
     * podría mandar el id de una opción gratis de otro plato.
     *
     * @param list<int|string> $productIds
     * @return array<int, array<string, array<string,mixed>>>
     */
    private function allowedChoices(int $tenantId, int $menuId, array $productIds): array
    {
        $ids = array_map('intval', $productIds);
        $in = implode(',', array_fill(0, count($ids), '?'));

        $stmt = $this->db->prepare(
            "SELECT pog.product_id,
                    og.slug AS group_slug, og.name AS group_name, og.type AS group_type,
                    og.is_required AS group_required, og.max_choices AS group_max,
                    oc.id AS choice_id, oc.slug AS choice_slug, oc.name AS choice_name,
                    oc.price_delta, oc.is_exclusive
               FROM product_option_groups pog
               JOIN option_groups og ON og.id = pog.option_group_id
               JOIN option_choices oc ON oc.option_group_id = og.id
              WHERE og.tenant_id = ? AND og.menu_id = ?
                AND oc.is_available = 1
                AND pog.product_id IN ($in)
              ORDER BY pog.sort_order ASC, oc.sort_order ASC",
        );
        $stmt->execute([$tenantId, $menuId, ...$ids]);

        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(int) $row['product_id']][(string) $row['choice_slug']] = $row;
        }

        return $out;
    }

    /**
     * @return array{0: ?array<string,mixed>, 1: ?string}
     */
    private function coupon(int $tenantId, ?string $code, int $subtotalCents): array
    {
        $code = strtoupper(trim((string) $code));
        if ($code === '') {
            return [null, null];
        }

        $stmt = $this->db->prepare(
            'SELECT id, code, type, value, label, min_order, max_uses, used_count
               FROM coupons
              WHERE tenant_id = :t AND code = :c AND is_active = 1
                AND (starts_at IS NULL OR starts_at <= NOW())
                AND (ends_at   IS NULL OR ends_at   >= NOW())
              LIMIT 1',
        );
        $stmt->execute(['t' => $tenantId, 'c' => $code]);
        $coupon = $stmt->fetch();

        if ($coupon === false) {
            return [null, 'Ese código no existe o ya venció.'];
        }

        if ($coupon['max_uses'] !== null && (int) $coupon['used_count'] >= (int) $coupon['max_uses']) {
            return [null, 'Ese código ya se usó todas las veces que se podía.'];
        }

        if ($coupon['min_order'] !== null && $subtotalCents < Money::toCents($coupon['min_order'])) {
            return [null, sprintf(
                'Ese código sirve a partir de $ %s.',
                number_format((float) $coupon['min_order'], 0, ',', '.'),
            )];
        }

        return [$coupon, null];
    }
}
