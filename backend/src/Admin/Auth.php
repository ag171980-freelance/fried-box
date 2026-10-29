<?php

declare(strict_types=1);

namespace Foodix\Admin;

use Foodix\Support\HttpException;
use PDO;

/**
 * Quién entra al panel.
 *
 * El navegador guarda un token opaco y lo manda en `Authorization:
 * Bearer …`. En la base no queda el token sino su SHA-256: si alguien
 * se lleva un volcado, no se lleva sesiones vivas.
 *
 * No hay refresh ni roles finos todavía. Un usuario pertenece a un
 * local y sólo puede tocar ese local; eso es lo que importa mientras
 * haya varias marcas en la misma base.
 */
final class Auth
{
    /** Cuánto dura una sesión sin volver a entrar. */
    private const DIAS = 14;

    /**
     * Cuánto se demora a propósito cuando el mail no existe.
     *
     * password_verify sobre un hash real tarda ~200 ms; si el mail no
     * existe y contestáramos de una, el tiempo de respuesta diría
     * «este mail no está en la base». Se verifica contra un hash de
     * descarte para que los dos caminos tarden lo mismo.
     */
    private const HASH_SEÑUELO = '$2y$12$VcEJeFZRT9q3TCpyVmyBkuVol8V/usZtsblUnUMPkNzzb1kZzjIOe';

    public function __construct(private readonly PDO $db)
    {
    }

    /**
     * Valida mail y contraseña y abre una sesión.
     *
     * @return array{token:string, expira:string, user:array<string,mixed>}
     */
    public function login(string $email, string $password): array
    {
        $stmt = $this->db->prepare(
            'SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.password_hash, u.is_active,
                    t.slug AS tenant_slug, t.name AS tenant_name
               FROM users u
               JOIN tenants t ON t.id = u.tenant_id
              WHERE u.email = :email
              LIMIT 1',
        );
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        // Mismo mensaje y mismo tiempo para «no existe» y «clave mala»:
        // de lo contrario el formulario sirve para averiguar qué mails
        // están dados de alta.
        if ($user === false) {
            password_verify($password, self::HASH_SEÑUELO);
            throw HttpException::unauthorized('Mail o contraseña incorrectos.', 'credenciales_invalidas');
        }

        if (!password_verify($password, $user['password_hash'])) {
            throw HttpException::unauthorized('Mail o contraseña incorrectos.', 'credenciales_invalidas');
        }

        if (!$user['is_active']) {
            throw HttpException::forbidden('Esta cuenta está dada de baja.', 'cuenta_inactiva');
        }

        // Si el costo de bcrypt cambió, se re-guarda con el nuevo al
        // primer login correcto. El usuario no se entera.
        if (password_needs_rehash($user['password_hash'], PASSWORD_BCRYPT, ['cost' => 12])) {
            $this->db
                ->prepare('UPDATE users SET password_hash = :h WHERE id = :id')
                ->execute(['h' => password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]), 'id' => $user['id']]);
        }

        $token = bin2hex(random_bytes(32));
        $expira = (new \DateTimeImmutable('+' . self::DIAS . ' days'))->format('Y-m-d H:i:s');

        $this->db
            ->prepare('INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at)
                       VALUES (:h, :u, :e, NOW())')
            ->execute(['h' => hash('sha256', $token), 'u' => $user['id'], 'e' => $expira]);

        $this->db
            ->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id')
            ->execute(['id' => $user['id']]);

        $this->limpiarVencidas();

        return ['token' => $token, 'expira' => $expira, 'user' => self::publico($user)];
    }

    /**
     * Resuelve la sesión de la petición actual. Tira 401 si no hay.
     *
     * @return array<string,mixed> el usuario, con tenant_id y tenant_slug
     */
    public function exigirUsuario(): array
    {
        $token = self::tokenDeLaPeticion();
        if ($token === null) {
            throw HttpException::unauthorized();
        }

        $stmt = $this->db->prepare(
            'SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.is_active,
                    t.slug AS tenant_slug, t.name AS tenant_name
               FROM sessions s
               JOIN users u   ON u.id = s.user_id
               JOIN tenants t ON t.id = u.tenant_id
              WHERE s.token_hash = :h
                AND s.expires_at > NOW()
              LIMIT 1',
        );
        $stmt->execute(['h' => hash('sha256', $token)]);
        $user = $stmt->fetch();

        if ($user === false) {
            throw HttpException::unauthorized('La sesión venció. Entrá de nuevo.', 'sesion_vencida');
        }

        if (!$user['is_active']) {
            throw HttpException::forbidden('Esta cuenta está dada de baja.', 'cuenta_inactiva');
        }

        $this->db
            ->prepare('UPDATE sessions SET last_seen_at = NOW() WHERE token_hash = :h')
            ->execute(['h' => hash('sha256', $token)]);

        return $user;
    }

    public function logout(): void
    {
        $token = self::tokenDeLaPeticion();
        if ($token === null) {
            return;
        }

        $this->db
            ->prepare('DELETE FROM sessions WHERE token_hash = :h')
            ->execute(['h' => hash('sha256', $token)]);
    }

    /**
     * Cambia la contraseña del usuario, pidiéndole la actual.
     */
    public function cambiarClave(int $userId, string $actual, string $nueva): void
    {
        $stmt = $this->db->prepare('SELECT password_hash FROM users WHERE id = :id');
        $stmt->execute(['id' => $userId]);
        $hash = $stmt->fetchColumn();

        if ($hash === false || !password_verify($actual, (string) $hash)) {
            throw HttpException::forbidden('La contraseña actual no coincide.', 'clave_incorrecta');
        }

        if (mb_strlen($nueva) < 8) {
            throw HttpException::badRequest('La contraseña nueva necesita al menos 8 caracteres.', 'clave_corta');
        }

        $this->db
            ->prepare('UPDATE users SET password_hash = :h WHERE id = :id')
            ->execute(['h' => password_hash($nueva, PASSWORD_BCRYPT, ['cost' => 12]), 'id' => $userId]);

        // Cambiar la clave cierra las demás sesiones: si alguien se metió
        // con la vieja, el cambio lo tiene que echar.
        $this->db->prepare('DELETE FROM sessions WHERE user_id = :id AND token_hash <> :h')->execute([
            'id' => $userId,
            'h' => hash('sha256', self::tokenDeLaPeticion() ?? ''),
        ]);
    }

    /** @param array<string,mixed> $user */
    public static function publico(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'email' => $user['email'],
            'name' => $user['name'],
            'role' => $user['role'],
            'tenant' => ['slug' => $user['tenant_slug'], 'name' => $user['tenant_name']],
        ];
    }

    private static function tokenDeLaPeticion(): ?string
    {
        $cabecera = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';

        // Apache con CGI a veces no pasa Authorization; getallheaders lo ve.
        if ($cabecera === '' && function_exists('getallheaders')) {
            foreach (getallheaders() as $nombre => $valor) {
                if (strcasecmp($nombre, 'Authorization') === 0) {
                    $cabecera = $valor;
                    break;
                }
            }
        }

        if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', trim((string) $cabecera), $m) !== 1) {
            return null;
        }

        return strtolower($m[1]);
    }

    private function limpiarVencidas(): void
    {
        $this->db->exec('DELETE FROM sessions WHERE expires_at < NOW()');
    }
}
