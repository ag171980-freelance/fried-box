<?php

declare(strict_types=1);

namespace Foodix\Order;

use DateTimeImmutable;
use DateTimeZone;
use PDO;

/**
 * Qué promos descuentan hoy y sobre qué platos.
 *
 * Una promo descuenta si tiene porcentaje, está activa, está dentro de
 * sus fechas y hoy es uno de sus días. A qué platos alcanza lo dice
 * applies_to: toda la carta, algunos rubros o algunos platos.
 */
final class PromoRules
{
    /** En el orden de DateTime::format('N'): 1 es lunes. */
    public const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];

    /**
     * El día de la semana se mira en la hora del local, no en la del
     * servidor: un lunes a las 22 en Buenos Aires ya es martes en UTC.
     */
    private const ZONA = 'America/Argentina/Buenos_Aires';

    public function __construct(private readonly PDO $db)
    {
    }

    public static function hoy(): string
    {
        $n = (int) (new DateTimeImmutable('now', new DateTimeZone(self::ZONA)))->format('N');

        return self::DIAS[$n - 1];
    }

    /**
     * Las promos que descuentan hoy, cada una con lo que abarca.
     *
     * @return list<array{id:int, title:string, percent:float, appliesTo:string, categoryIds:list<int>, productIds:list<int>}>
     */
    public function vigentesHoy(int $tenantId, int $menuId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, title, discount_percent, days, applies_to
               FROM promos
              WHERE tenant_id = :t AND menu_id = :m
                AND is_active = 1
                AND discount_percent > 0
                AND (starts_at IS NULL OR starts_at <= NOW())
                AND (ends_at   IS NULL OR ends_at   >= NOW())
              ORDER BY sort_order ASC, id ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);

        $hoy = self::hoy();
        $promos = [];
        foreach ($stmt->fetchAll() as $row) {
            if (!self::valeElDia($row['days'], $hoy)) {
                continue;
            }
            $promos[(int) $row['id']] = [
                'id' => (int) $row['id'],
                'title' => (string) $row['title'],
                'percent' => (float) $row['discount_percent'],
                'appliesTo' => (string) $row['applies_to'],
                'categoryIds' => [],
                'productIds' => [],
            ];
        }

        if ($promos === []) {
            return [];
        }

        $in = implode(',', array_fill(0, count($promos), '?'));
        $ids = array_keys($promos);

        $stmt = $this->db->prepare("SELECT promo_id, category_id FROM promo_categories WHERE promo_id IN ($in)");
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $row) {
            $promos[(int) $row['promo_id']]['categoryIds'][] = (int) $row['category_id'];
        }

        $stmt = $this->db->prepare("SELECT promo_id, product_id FROM promo_products WHERE promo_id IN ($in)");
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $row) {
            $promos[(int) $row['promo_id']]['productIds'][] = (int) $row['product_id'];
        }

        return array_values($promos);
    }

    /**
     * La mejor promo para un plato. No se suman: si un plato entra en
     * dos, se lleva el porcentaje más alto.
     *
     * @param list<array<string,mixed>> $promos
     * @return array<string,mixed>|null
     */
    public static function mejorPara(array $promos, int $productId, int $categoryId): ?array
    {
        $mejor = null;
        foreach ($promos as $promo) {
            $entra = match ($promo['appliesTo']) {
                'rubros' => in_array($categoryId, $promo['categoryIds'], true),
                'platos' => in_array($productId, $promo['productIds'], true),
                default => true,
            };
            if ($entra && ($mejor === null || $promo['percent'] > $mejor['percent'])) {
                $mejor = $promo;
            }
        }

        return $mejor;
    }

    /** $days viene de una columna SET: «lun,mie» o NULL para todos. */
    public static function valeElDia(?string $days, string $hoy): bool
    {
        return $days === null || $days === '' || in_array($hoy, explode(',', $days), true);
    }
}
