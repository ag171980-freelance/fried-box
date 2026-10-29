<?php

declare(strict_types=1);

namespace Foodix\Support;

use PDO;
use PDOException;
use RuntimeException;

/**
 * Conexión PDO única por proceso.
 *
 * Tres cosas que no son negociables y por eso están fijas acá:
 * excepciones en vez de códigos de error silenciosos, sin emulación de
 * prepared statements (así los tipos viajan bien y no hay inyección por
 * interpolación) y utf8mb4 desde el saludo inicial.
 */
final class Database
{
    private static ?PDO $pdo = null;

    /** @param array{host:string,port:int,name:string,user:string,pass:string} $config */
    public static function connect(array $config): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $config['host'],
            $config['port'],
            $config['name'],
        );

        try {
            self::$pdo = new PDO($dsn, $config['user'], $config['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]);
        } catch (PDOException $e) {
            // El mensaje de PDO puede traer usuario y host. No sale de acá.
            throw new RuntimeException('No se pudo conectar con la base de datos.', 0, $e);
        }

        return self::$pdo;
    }

    public static function reset(): void
    {
        self::$pdo = null;
    }
}
