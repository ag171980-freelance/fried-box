<?php

declare(strict_types=1);

namespace Foodix\Admin;

use PDO;

/**
 * Los números del local: cuánto vendió y qué pide la gente.
 *
 * Todo sale de los pedidos guardados, que copian nombre y precio en el
 * momento de la compra: si mañana cambia la carta, las estadísticas de
 * la semana pasada siguen diciendo lo que se vendió de verdad.
 *
 * Una venta es un pedido confirmado, esté en marcha o entregado. No
 * cuentan los cancelados, los de pago rechazado ni los que esperan el
 * pago: no es plata que entró.
 *
 * Las fechas se comparan con CURDATE() de la base, que es la misma
 * hora con la que se guardó created_at.
 */
final class EstadisticasRepository
{
    private const VENTA = "o.status IN ('confirmado','cocina','camino','listo','entregado')";

    public function __construct(private readonly PDO $db)
    {
    }

    /**
     * @return array<string,mixed>
     */
    public function resumen(int $tenantId, int $dias): array
    {
        $hoy = (string) $this->db->query('SELECT CURDATE()')->fetchColumn();

        return [
            'hoy' => $hoy,
            'totales' => $this->totales($tenantId),
            'porDia' => $this->porDia($tenantId, $dias, $hoy),
            'productos' => $this->productos($tenantId, $dias),
            'opciones' => $this->opciones($tenantId, $dias),
            'porHora' => $this->porHora($tenantId, $dias),
            'porModo' => $this->agrupado($tenantId, $dias, 'mode'),
            'porMedio' => $this->agrupado($tenantId, $dias, 'payment_method'),
        ];
    }

    /** Hoy, este mes y desde el primer pedido. */
    private function totales(int $tenantId): array
    {
        $stmt = $this->db->prepare(
            'SELECT
                COALESCE(SUM(CASE WHEN o.created_at >= CURDATE() THEN o.total END), 0) AS hoy_ventas,
                COUNT(CASE WHEN o.created_at >= CURDATE() THEN 1 END)                 AS hoy_pedidos,
                COALESCE(SUM(CASE WHEN o.created_at >= DATE_FORMAT(CURDATE(), \'%Y-%m-01\') THEN o.total END), 0) AS mes_ventas,
                COUNT(CASE WHEN o.created_at >= DATE_FORMAT(CURDATE(), \'%Y-%m-01\') THEN 1 END)                 AS mes_pedidos,
                COALESCE(SUM(o.total), 0) AS total_ventas,
                COUNT(*)                  AS total_pedidos
               FROM orders o
              WHERE o.tenant_id = :t AND ' . self::VENTA,
        );
        $stmt->execute(['t' => $tenantId]);
        $r = $stmt->fetch();

        $stmt = $this->db->prepare(
            "SELECT COUNT(*) FROM orders o
              WHERE o.tenant_id = :t AND o.status = 'cancelado' AND o.created_at >= CURDATE()",
        );
        $stmt->execute(['t' => $tenantId]);

        return [
            'hoy' => ['ventas' => (float) $r['hoy_ventas'], 'pedidos' => (int) $r['hoy_pedidos']],
            'mes' => ['ventas' => (float) $r['mes_ventas'], 'pedidos' => (int) $r['mes_pedidos']],
            'total' => ['ventas' => (float) $r['total_ventas'], 'pedidos' => (int) $r['total_pedidos']],
            'canceladosHoy' => (int) $stmt->fetchColumn(),
        ];
    }

    /**
     * Un punto por día, también los días sin ventas: un hueco en el
     * gráfico tiene que verse como cero, no desaparecer.
     *
     * @return list<array{dia:string, ventas:float, pedidos:int}>
     */
    private function porDia(int $tenantId, int $dias, string $hoy): array
    {
        $stmt = $this->db->prepare(
            'SELECT DATE(o.created_at) AS dia, SUM(o.total) AS ventas, COUNT(*) AS pedidos
               FROM orders o
              WHERE o.tenant_id = :t AND ' . self::VENTA . '
                AND o.created_at >= CURDATE() - INTERVAL :d DAY
              GROUP BY DATE(o.created_at)',
        );
        $stmt->bindValue('t', $tenantId, PDO::PARAM_INT);
        $stmt->bindValue('d', $dias - 1, PDO::PARAM_INT);
        $stmt->execute();

        $hay = [];
        foreach ($stmt->fetchAll() as $r) {
            $hay[(string) $r['dia']] = $r;
        }

        $out = [];
        $base = new \DateTimeImmutable($hoy);
        for ($i = $dias - 1; $i >= 0; $i--) {
            $dia = $base->modify("-$i day")->format('Y-m-d');
            $out[] = [
                'dia' => $dia,
                'ventas' => isset($hay[$dia]) ? (float) $hay[$dia]['ventas'] : 0.0,
                'pedidos' => isset($hay[$dia]) ? (int) $hay[$dia]['pedidos'] : 0,
            ];
        }

        return $out;
    }

    /**
     * Lo más pedido. Por nombre y no por id: el plato pudo haberse
     * borrado, pero lo que se vendió se vendió.
     *
     * @return list<array{nombre:string, unidades:int, ventas:float}>
     */
    private function productos(int $tenantId, int $dias): array
    {
        $stmt = $this->db->prepare(
            'SELECT oi.name AS nombre, SUM(oi.qty) AS unidades, SUM(oi.line_total) AS ventas
               FROM order_items oi
               JOIN orders o ON o.id = oi.order_id
              WHERE o.tenant_id = :t AND ' . self::VENTA . '
                AND o.created_at >= CURDATE() - INTERVAL :d DAY
              GROUP BY oi.name
              ORDER BY unidades DESC, ventas DESC
              LIMIT 15',
        );
        $stmt->bindValue('t', $tenantId, PDO::PARAM_INT);
        $stmt->bindValue('d', $dias - 1, PDO::PARAM_INT);
        $stmt->execute();

        return array_map(static fn (array $r): array => [
            'nombre' => (string) $r['nombre'],
            'unidades' => (int) $r['unidades'],
            'ventas' => (float) $r['ventas'],
        ], $stmt->fetchAll());
    }

    /**
     * Las opciones más elegidas (las salsas, en Friedbox). Cada opción
     * cuenta tantas veces como unidades del plato: dos boxes con
     * barbacoa son dos barbacoas.
     *
     * Se junta por nombre y no por grupo: la barbacoa del box de 3 y la
     * del de 6 son la misma salsa, aunque vivan en grupos distintos.
     *
     * @return list<array{nombre:string, veces:int}>
     */
    private function opciones(int $tenantId, int $dias): array
    {
        $stmt = $this->db->prepare(
            'SELECT oio.name AS nombre, SUM(oi.qty) AS veces
               FROM order_item_options oio
               JOIN order_items oi ON oi.id = oio.order_item_id
               JOIN orders o ON o.id = oi.order_id
              WHERE o.tenant_id = :t AND ' . self::VENTA . '
                AND o.created_at >= CURDATE() - INTERVAL :d DAY
              GROUP BY oio.name
              ORDER BY veces DESC
              LIMIT 20',
        );
        $stmt->bindValue('t', $tenantId, PDO::PARAM_INT);
        $stmt->bindValue('d', $dias - 1, PDO::PARAM_INT);
        $stmt->execute();

        return array_map(static fn (array $r): array => [
            'nombre' => (string) $r['nombre'],
            'veces' => (int) $r['veces'],
        ], $stmt->fetchAll());
    }

    /**
     * A qué hora entran los pedidos, las 24 horas aunque alguna esté en
     * cero. Sirve para decidir horarios y cuánta gente poner.
     *
     * @return list<array{hora:int, pedidos:int}>
     */
    private function porHora(int $tenantId, int $dias): array
    {
        $stmt = $this->db->prepare(
            'SELECT HOUR(o.created_at) AS hora, COUNT(*) AS pedidos
               FROM orders o
              WHERE o.tenant_id = :t AND ' . self::VENTA . '
                AND o.created_at >= CURDATE() - INTERVAL :d DAY
              GROUP BY HOUR(o.created_at)',
        );
        $stmt->bindValue('t', $tenantId, PDO::PARAM_INT);
        $stmt->bindValue('d', $dias - 1, PDO::PARAM_INT);
        $stmt->execute();

        $hay = [];
        foreach ($stmt->fetchAll() as $r) {
            $hay[(int) $r['hora']] = (int) $r['pedidos'];
        }

        return array_map(static fn (int $h): array => ['hora' => $h, 'pedidos' => $hay[$h] ?? 0], range(0, 23));
    }

    /**
     * Ventas partidas por una columna fija del pedido (modo o medio de
     * pago). $columna nunca viene del usuario.
     *
     * @return array<string, array{ventas:float, pedidos:int}>
     */
    private function agrupado(int $tenantId, int $dias, string $columna): array
    {
        $stmt = $this->db->prepare(
            "SELECT o.`$columna` AS clave, SUM(o.total) AS ventas, COUNT(*) AS pedidos
               FROM orders o
              WHERE o.tenant_id = :t AND " . self::VENTA . '
                AND o.created_at >= CURDATE() - INTERVAL :d DAY
              GROUP BY o.`' . $columna . '`',
        );
        $stmt->bindValue('t', $tenantId, PDO::PARAM_INT);
        $stmt->bindValue('d', $dias - 1, PDO::PARAM_INT);
        $stmt->execute();

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(string) $r['clave']] = ['ventas' => (float) $r['ventas'], 'pedidos' => (int) $r['pedidos']];
        }

        return $out;
    }
}
