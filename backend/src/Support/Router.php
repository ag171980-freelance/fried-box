<?php

declare(strict_types=1);

namespace Foodix\Support;

/**
 * Router mínimo. Patrones con {parametros} y nada más: mientras la API
 * tenga menos de veinte rutas, esto es más fácil de leer que cualquier
 * cosa con reflexión.
 */
final class Router
{
    /** @var list<array{method:string, regex:string, params:list<string>, handler:callable}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler): void
    {
        $this->add('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable $handler): void
    {
        $this->add('POST', $pattern, $handler);
    }

    public function put(string $pattern, callable $handler): void
    {
        $this->add('PUT', $pattern, $handler);
    }

    public function delete(string $pattern, callable $handler): void
    {
        $this->add('DELETE', $pattern, $handler);
    }

    private function add(string $method, string $pattern, callable $handler): void
    {
        $params = [];
        $regex = preg_replace_callback(
            '/\{([a-zA-Z_]+)\}/',
            static function (array $m) use (&$params): string {
                $params[] = $m[1];
                return '([^/]+)';
            },
            $pattern,
        );

        $this->routes[] = [
            'method' => $method,
            'regex' => '#^' . $regex . '$#',
            'params' => $params,
            'handler' => $handler,
        ];
    }

    /**
     * Devuelve el handler y sus parámetros, o null si no hay ruta.
     * Si el camino existe pero con otro verbo, tira 405 en vez de 404:
     * es la diferencia entre "no existe" y "así no se pide".
     *
     * @return array{callable, array<string,string>}
     */
    public function match(string $method, string $path): array
    {
        $pathExists = false;

        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $path, $m)) {
                continue;
            }
            $pathExists = true;

            if ($route['method'] !== $method) {
                continue;
            }

            array_shift($m);
            return [$route['handler'], array_combine($route['params'], $m) ?: []];
        }

        if ($pathExists) {
            throw new HttpException(405, 'Ese recurso no acepta ' . $method . '.', 'metodo_no_permitido');
        }

        throw HttpException::notFound('No hay nada en ' . $path . '.', 'ruta_no_encontrada');
    }

    /**
     * Saca de la URL el directorio donde está montado el front controller,
     * para que la API funcione igual en la raíz del dominio que colgada de
     * /foodix/backend/public en el XAMPP de casa.
     */
    public static function currentPath(): string
    {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');

        if ($base !== '' && str_starts_with($uri, $base)) {
            $uri = substr($uri, strlen($base));
        }

        return '/' . trim($uri, '/');
    }
}
