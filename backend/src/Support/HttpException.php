<?php

declare(strict_types=1);

namespace Foodix\Support;

use RuntimeException;

/**
 * Error que ya sabe con qué código HTTP quiere salir.
 * Todo lo que no sea de esta clase se trata como un 500.
 */
final class HttpException extends RuntimeException
{
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly string $errorCode = 'error',
    ) {
        parent::__construct($message);
    }

    public static function notFound(string $message, string $code = 'no_encontrado'): self
    {
        return new self(404, $message, $code);
    }

    public static function badRequest(string $message, string $code = 'peticion_invalida'): self
    {
        return new self(400, $message, $code);
    }

    public static function unauthorized(string $message = 'Tenés que iniciar sesión.', string $code = 'sin_sesion'): self
    {
        return new self(401, $message, $code);
    }

    public static function forbidden(string $message, string $code = 'sin_permiso'): self
    {
        return new self(403, $message, $code);
    }
}
