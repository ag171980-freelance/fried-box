<?php

declare(strict_types=1);

namespace Foodix\Support;

/**
 * Todo lo que sale de la API pasa por acá.
 */
final class Response
{
    /**
     * CORS acotado a una lista blanca. Nunca `*`: hoy el menú es público
     * pero los endpoints de pedidos van a viajar por el mismo origen y
     * abrirlo ahora es una puerta que después nadie se acuerda de cerrar.
     *
     * @param list<string> $allowedOrigins
     */
    public static function cors(array $allowedOrigins): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
            header('Access-Control-Allow-Headers: Content-Type, X-Tenant, Authorization');
            header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
            header('Access-Control-Max-Age: 600');
        }
    }

    /**
     * Responde JSON. Si el cliente ya tiene esta versión exacta del
     * cuerpo, devuelve 304 y no manda nada: una carta la piden muchos
     * teléfonos seguidos y casi nunca cambió entre uno y otro.
     */
    public static function json(mixed $payload, int $status = 200, int $maxAge = 0): void
    {
        $body = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        );

        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');

        if ($status === 200 && $maxAge > 0) {
            $etag = '"' . md5($body) . '"';

            // `private` y no `public`: la misma URL /menu devuelve cosas
            // distintas según el local, así que una caché compartida
            // (un CDN, un proxy de oficina) podría entregarle a un
            // cliente la carta de otro restaurante. El Vary avisa
            // igual, pero la cabecera privada es la que de verdad
            // cierra la puerta.
            header('Cache-Control: private, max-age=' . $maxAge);
            header('Vary: X-Tenant, Origin', false);
            header('ETag: ' . $etag);

            if (trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
                http_response_code(304);
                return;
            }
        } else {
            header('Cache-Control: no-store');
        }

        http_response_code($status);
        echo $body;
    }

    public static function error(int $status, string $message, string $code = 'error'): void
    {
        self::json(['error' => ['codigo' => $code, 'mensaje' => $message]], $status);
    }
}
