<?php

declare(strict_types=1);

namespace Foodix\Tenant;

use Foodix\Support\HttpException;
use PDO;

/**
 * Averigua de qué local es cada petición.
 *
 * Orden de prioridad, de lo más explícito a lo más implícito:
 *
 *   1. el slug en la ruta        /t/cafe-rivas/menu
 *   2. la cabecera X-Tenant      X-Tenant: cafe-rivas
 *   3. el parámetro ?tenant=
 *   4. el subdominio             cafe-rivas.foodix.app
 *   5. DEFAULT_TENANT del .env
 *
 * El paso 5 existe sólo para que el front actual, que todavía pega a
 * /menu pelado, siga funcionando mientras se conecta. En producción hay
 * que sacarlo: un pedido sin local identificado es un error, no un
 * pedido al local por defecto.
 */
final class TenantResolver
{
    public function __construct(
        private readonly PDO $db,
        private readonly string $defaultSlug,
    ) {
    }

    public function resolveSlug(?string $fromPath = null): string
    {
        if (is_string($fromPath) && $fromPath !== '') {
            return $fromPath;
        }

        $header = trim($_SERVER['HTTP_X_TENANT'] ?? '');
        if ($header !== '') {
            return $header;
        }

        $query = trim((string) ($_GET['tenant'] ?? ''));
        if ($query !== '') {
            return $query;
        }

        $subdomain = $this->subdomain();
        if ($subdomain !== null) {
            return $subdomain;
        }

        return $this->defaultSlug;
    }

    private function subdomain(): ?string
    {
        $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        $host = explode(':', $host)[0];

        // Una IP no tiene subdominio. Sin este corte, 127.0.0.1 se parte
        // en cuatro y devuelve "127" como si fuera un local.
        if ($host === '' || filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return null;
        }

        $parts = explode('.', $host);

        // Hace falta algo tipo local.dominio.tld. localhost no alcanza.
        if (count($parts) < 3 || in_array($parts[0], ['www', 'api'], true)) {
            return null;
        }

        return $parts[0];
    }

    /**
     * @return array{id:int, slug:string, name:string, tagline:?string}
     */
    public function find(string $slug): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, slug, name, tagline
               FROM tenants
              WHERE slug = :slug AND status = :status
              LIMIT 1',
        );
        $stmt->execute(['slug' => $slug, 'status' => 'activo']);
        $tenant = $stmt->fetch();

        if ($tenant === false) {
            // Mismo mensaje exista o no el local pero esté pausado: no
            // hace falta contarle a nadie qué slugs están tomados.
            throw HttpException::notFound(
                'No encontramos ese local.',
                'local_no_encontrado',
            );
        }

        return [
            'id' => (int) $tenant['id'],
            'slug' => (string) $tenant['slug'],
            'name' => (string) $tenant['name'],
            'tagline' => $tenant['tagline'],
        ];
    }
}
