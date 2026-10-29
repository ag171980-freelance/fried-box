<?php

declare(strict_types=1);

namespace Foodix\Support;

/**
 * Texto de persona a slug de URL.
 *
 * «Papas con cheddar» -> papas-con-cheddar
 * «Café Rivas»        -> cafe-rivas
 *
 * Los acentos se sacan antes de filtrar: sin ese paso «Café» quedaría
 * en «caf-», porque la é no sobrevive al [^a-z0-9].
 */
final class Slug
{
    private const ACENTOS = [
        'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'ã' => 'a', 'å' => 'a',
        'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
        'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o', 'õ' => 'o',
        'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u',
        'ñ' => 'n', 'ç' => 'c',
    ];

    public static function de(string $texto): string
    {
        $texto = strtr(mb_strtolower(trim($texto), 'UTF-8'), self::ACENTOS);
        $texto = preg_replace('/[^a-z0-9]+/', '-', $texto) ?? '';

        return trim($texto, '-');
    }
}
