<?php

declare(strict_types=1);

namespace Foodix\Support;

/**
 * Guarda y recupera los secretos de cada local: hoy, los tokens de
 * Mercado Pago.
 *
 * Qué protege y qué no, para que nadie se confunda leyendo esto:
 *
 *   - Protege un dump o un backup de la base que se filtre. En hosting
 *     compartido ese es el escenario realista, y es grave: con el token
 *     de Mercado Pago de un local se le cobra y se le devuelve plata.
 *   - NO protege contra que entren al servidor, porque ahí se llevan
 *     también el .env con la clave. Para eso no hay solución del lado
 *     de la aplicación; la hay del lado de Mercado Pago, limitando los
 *     permisos del token.
 *
 * AES-256-GCM y no sodium porque sodium no está compilado en todos los
 * PHP donde esto corre (el XAMPP de desarrollo, por ejemplo). GCM es
 * autenticado: si alguien edita la fila a mano, el descifrado falla en
 * vez de devolver basura.
 */
final class Secretos
{
    private const CIFRADO = 'aes-256-gcm';
    private const LARGO_NONCE = 12;
    private const LARGO_TAG = 16;

    /** La clave en crudo, 32 bytes, o null si no hay ninguna configurada. */
    private readonly ?string $clave;

    public function __construct(string $appKey)
    {
        $this->clave = self::leerClave($appKey);
    }

    /**
     * Sin clave no se puede guardar nada. Lo pregunta el panel para
     * avisar antes de que el local escriba su token y lo pierda.
     */
    public function hayClave(): bool
    {
        return $this->clave !== null;
    }

    /**
     * El texto guardable. Devuelve base64 de nonce|tag|secreto para que
     * la columna sea VARCHAR y el valor sobreviva un mysqldump y un
     * restore sin que a nadie se le ocurra "arreglarle" la codificación.
     *
     * @throws \RuntimeException si no hay APP_KEY: guardar en claro un
     *         token de cobro no es una alternativa aceptable.
     */
    public function cifrar(string $claro): string
    {
        if ($claro === '') {
            return '';
        }

        if ($this->clave === null) {
            throw new \RuntimeException(
                'Falta APP_KEY en el .env: sin clave no se pueden guardar las credenciales de cobro.',
            );
        }

        $nonce = random_bytes(self::LARGO_NONCE);
        $tag = '';

        $cifrado = openssl_encrypt(
            $claro,
            self::CIFRADO,
            $this->clave,
            OPENSSL_RAW_DATA,
            $nonce,
            $tag,
        );

        if ($cifrado === false) {
            throw new \RuntimeException('No pudimos cifrar la credencial.');
        }

        return base64_encode($nonce . $tag . $cifrado);
    }

    /**
     * El secreto en claro, o null si no se puede recuperar: está vacío,
     * la fila quedó de otra APP_KEY, o alguien la editó a mano.
     *
     * Devuelve null en vez de explotar a propósito. Un token que no se
     * puede descifrar tiene que dejar al local sin Mercado Pago, que es
     * un error que se ve y se arregla, y no tumbar la carta entera.
     */
    public function descifrar(?string $guardado): ?string
    {
        $guardado = trim((string) $guardado);
        if ($guardado === '' || $this->clave === null) {
            return null;
        }

        $crudo = base64_decode($guardado, true);
        if ($crudo === false || strlen($crudo) <= self::LARGO_NONCE + self::LARGO_TAG) {
            return null;
        }

        $nonce = substr($crudo, 0, self::LARGO_NONCE);
        $tag = substr($crudo, self::LARGO_NONCE, self::LARGO_TAG);
        $cifrado = substr($crudo, self::LARGO_NONCE + self::LARGO_TAG);

        $claro = openssl_decrypt(
            $cifrado,
            self::CIFRADO,
            $this->clave,
            OPENSSL_RAW_DATA,
            $nonce,
            $tag,
        );

        return $claro === false ? null : $claro;
    }

    /**
     * Una clave nueva, lista para pegar en el .env. La usa el script de
     * instalación; no se llama en caliente.
     */
    public static function claveNueva(): string
    {
        return bin2hex(random_bytes(32));
    }

    /**
     * Acepta la clave en hexadecimal (64 caracteres, que es lo que
     * imprime claveNueva) o en base64. Cualquier otra cosa se trata como
     * «no hay clave»: más vale que el local no pueda cobrar que cifrar
     * con una clave recortada de 8 bytes que alguien tipeó a mano.
     */
    private static function leerClave(string $appKey): ?string
    {
        $appKey = trim($appKey);
        if ($appKey === '') {
            return null;
        }

        if (strlen($appKey) === 64 && ctype_xdigit($appKey)) {
            $bin = hex2bin($appKey);

            return $bin === false ? null : $bin;
        }

        $bin = base64_decode($appKey, true);

        return $bin !== false && strlen($bin) === 32 ? $bin : null;
    }
}
