<?php

declare(strict_types=1);

namespace Foodix\Support;

use JsonException;

/**
 * El cuerpo JSON de la petición, ya validado en lo básico.
 *
 * Nada de lo que llega del cliente se usa sin pasar por acá: cada
 * getter dice qué tipo espera y recorta lo que no cierra.
 */
final class Request
{
    /** @param array<string, mixed> $data */
    private function __construct(private readonly array $data)
    {
    }

    /**
     * El cuerpo parseado, una sola vez por petición.
     *
     * Varios métodos del panel piden el Request más de una vez (el
     * controlador para validar, el lector del formulario para armar la
     * fila). Sin esta caché, cada llamada vuelve a leer php://input y a
     * parsear el JSON para llegar al mismo resultado.
     */
    private static ?self $cache = null;

    public static function json(int $maxBytes = 65536): self
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        return self::$cache = self::parsear($maxBytes);
    }

    private static function parsear(int $maxBytes): self
    {
        $raw = file_get_contents('php://input');

        if ($raw === false || $raw === '') {
            return new self([]);
        }

        if (strlen($raw) > $maxBytes) {
            throw HttpException::badRequest('El cuerpo del pedido es demasiado grande.', 'cuerpo_grande');
        }

        try {
            $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw HttpException::badRequest('El cuerpo no es JSON válido.', 'json_invalido');
        }

        if (!is_array($data)) {
            throw HttpException::badRequest('Se esperaba un objeto JSON.', 'json_invalido');
        }

        return new self($data);
    }

    public function str(string $key, int $maxLength = 255, string $default = ''): string
    {
        $value = $this->data[$key] ?? null;

        if (!is_string($value) && !is_int($value) && !is_float($value)) {
            return $default;
        }

        // Fuera caracteres de control: no aportan nada y ensucian tickets y logs.
        $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string) $value) ?? '';

        return mb_substr(trim($clean), 0, $maxLength);
    }

    public function enum(string $key, array $allowed, string $default): string
    {
        $value = $this->str($key, 40);

        return in_array($value, $allowed, true) ? $value : $default;
    }

    public function float(string $key): ?float
    {
        $value = $this->data[$key] ?? null;

        return is_numeric($value) ? (float) $value : null;
    }

    /**
     * Un booleano tolerante: JSON manda true, pero un formulario puede
     * mandar "true", "on" o 1 y los tres quieren decir lo mismo.
     */
    public function bool(string $key, bool $default = false): bool
    {
        $value = $this->data[$key] ?? null;

        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            return $value != 0;
        }
        if (is_string($value)) {
            return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
        }

        return $default;
    }

    /**
     * Lista de textos cortos: etiquetas, códigos.
     *
     * @return list<string>
     */
    public function strList(string $key, int $maxItems = 20, int $maxLength = 64): array
    {
        $raw = $this->data[$key] ?? null;
        if (!is_array($raw)) {
            return [];
        }

        $out = [];
        foreach (array_slice($raw, 0, $maxItems) as $v) {
            if (is_string($v) && trim($v) !== '') {
                $out[] = mb_substr(trim($v), 0, $maxLength);
            }
        }

        return array_values(array_unique($out));
    }

    /**
     * Lista de números: ids de cosas que ya existen.
     *
     * @return list<float>
     */
    public function numList(string $key, int $maxItems = 20): array
    {
        $raw = $this->data[$key] ?? null;
        if (!is_array($raw)) {
            return [];
        }

        $out = [];
        foreach (array_slice($raw, 0, $maxItems) as $v) {
            if (is_numeric($v)) {
                $out[] = (float) $v;
            }
        }

        return array_values(array_unique($out));
    }

    /**
     * Lista de objetos sin normalizar: quien la pide se encarga de
     * limpiar cada campo, porque la forma cambia según el caso.
     *
     * @return list<array<string,mixed>>
     */
    public function objList(string $key, int $maxItems = 30): array
    {
        $raw = $this->data[$key] ?? null;
        if (!is_array($raw)) {
            return [];
        }

        $out = [];
        foreach (array_slice($raw, 0, $maxItems) as $v) {
            if (is_array($v)) {
                $out[] = $v;
            }
        }

        return $out;
    }

    /** @return array<string, mixed> */
    public function obj(string $key): array
    {
        $value = $this->data[$key] ?? null;

        return is_array($value) ? $value : [];
    }

    /**
     * Las líneas del pedido, normalizadas.
     *
     * El tope de 60 líneas y 99 unidades no es burocracia: sin límite,
     * una petición armada a mano puede pedir mil millones de empanadas y
     * hacer explotar el cálculo o la cocina.
     *
     * @return list<array{key:string, itemId:string, qty:int, optionIds:list<string>, note:string}>
     */
    public function lines(int $maxLines = 60): array
    {
        $raw = $this->data['lines'] ?? null;
        if (!is_array($raw)) {
            return [];
        }

        $out = [];
        foreach (array_slice($raw, 0, $maxLines) as $i => $line) {
            if (!is_array($line)) {
                continue;
            }

            $itemId = self::slug($line['itemId'] ?? '');
            if ($itemId === '') {
                continue;
            }

            $qty = (int) ($line['qty'] ?? 0);
            if ($qty < 1) {
                continue;
            }

            $optionIds = [];
            if (isset($line['optionIds']) && is_array($line['optionIds'])) {
                foreach (array_slice($line['optionIds'], 0, 20) as $opt) {
                    $slug = self::slug($opt);
                    if ($slug !== '') {
                        $optionIds[] = $slug;
                    }
                }
            }

            $note = is_string($line['note'] ?? null) ? mb_substr(trim($line['note']), 0, 200) : '';

            // La key la inventa el front para identificar la fila en React.
            // Se devuelve tal cual para que pueda emparejar la respuesta.
            $key = is_string($line['key'] ?? null) ? mb_substr($line['key'], 0, 200) : 'l' . $i;

            $out[] = [
                'key' => $key,
                'itemId' => $itemId,
                'qty' => min($qty, 99),
                'optionIds' => array_values(array_unique($optionIds)),
                'note' => $note,
            ];
        }

        return $out;
    }

    private static function slug(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        return preg_match('/^[a-z0-9][a-z0-9-]{0,63}$/', $value) === 1 ? $value : '';
    }
}
