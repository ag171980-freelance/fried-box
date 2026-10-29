<?php

declare(strict_types=1);

namespace Foodix\Support;

/**
 * Las cuentas se hacen en centavos, con enteros.
 *
 * En la base el dinero es DECIMAL(12,2), que es exacto, pero PHP lo
 * recibe como string y en cuanto se suma con `+` se vuelve float. Con
 * pesos enteros no se rompe nada; con un 10% de descuento sobre tres
 * líneas sí aparecen los 0.30000000000000004. Se entra a centavos al
 * leer y se sale recién al serializar.
 */
final class Money
{
    public static function toCents(int|float|string|null $value): int
    {
        return (int) round(((float) $value) * 100);
    }

    /** Devuelve un número apto para JSON, ya redondeado a dos decimales. */
    public static function fromCents(int $cents): float
    {
        return round($cents / 100, 2);
    }

    /** Para guardar en una columna DECIMAL sin pasar por float. */
    public static function toDecimal(int $cents): string
    {
        $sign = $cents < 0 ? '-' : '';
        $cents = abs($cents);

        return sprintf('%s%d.%02d', $sign, intdiv($cents, 100), $cents % 100);
    }

    /** Porcentaje sobre un monto, redondeado al centavo. */
    public static function percentOf(int $cents, float $percent): int
    {
        return (int) round($cents * $percent / 100);
    }
}
