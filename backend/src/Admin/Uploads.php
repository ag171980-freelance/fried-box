<?php

declare(strict_types=1);

namespace Foodix\Admin;

use Foodix\Support\HttpException;
use Foodix\Support\Slug;

/**
 * Las fotos de los platos que sube el local.
 *
 * Lo que entra por acá es un archivo que mandó alguien de afuera, así
 * que no se le cree nada: ni el nombre, ni la extensión, ni el
 * Content-Type, que los pone el cliente y se falsifican solos.
 *
 * Lo que sí se hace:
 *
 *  - se mira el contenido real con getimagesize(), no la extensión;
 *  - sólo pasan JPEG, PNG y WebP;
 *  - se **reescribe** la imagen con GD en vez de mover el archivo. Un
 *    archivo que es JPEG válido y además PHP válido deja de serlo
 *    después de pasar por imagecreatefrom*() + imagejpeg();
 *  - el nombre de destino lo inventamos nosotros, nunca el que vino;
 *  - se guarda en una carpeta que, además, tiene su .htaccess negando
 *    la ejecución de PHP.
 */
final class Uploads
{
    private const MAX_BYTES = 6 * 1024 * 1024;   // 6 MB de origen
    private const LADO_MAX = 1200;               // el lado largo final
    private const LADO_MIN_SM = 480;             // la versión chica del srcset

    /** Lo que el front pide como /uploads/... y Vite proxea al backend. */
    private const RUTA_PUBLICA = '/uploads/platos';

    public function __construct(private readonly string $dirPublico)
    {
    }

    /**
     * Procesa $_FILES['foto'] y devuelve la ruta pública a guardar.
     *
     * @param array<string,mixed>|null $archivo
     */
    public function guardarFoto(?array $archivo, string $tenantSlug, int $productId): string
    {
        if ($archivo === null || ($archivo['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            throw HttpException::badRequest('No llegó ninguna imagen.', 'sin_archivo');
        }

        if ($archivo['error'] !== UPLOAD_ERR_OK) {
            throw HttpException::badRequest(
                $archivo['error'] === UPLOAD_ERR_INI_SIZE || $archivo['error'] === UPLOAD_ERR_FORM_SIZE
                    ? 'La imagen es más pesada de lo que acepta el servidor.'
                    : 'No pudimos recibir la imagen. Probá de nuevo.',
                'subida_fallida',
            );
        }

        $tmp = (string) $archivo['tmp_name'];

        // Sin esto, alguien podría pasar una ruta cualquiera del disco.
        if (!is_uploaded_file($tmp)) {
            throw HttpException::badRequest('Eso no es un archivo subido.', 'archivo_invalido');
        }

        if ((int) $archivo['size'] > self::MAX_BYTES) {
            throw HttpException::badRequest('La imagen no puede pasar de 6 MB.', 'imagen_pesada');
        }

        // El tipo sale del contenido, no de lo que dijo el navegador.
        $info = @getimagesize($tmp);
        if ($info === false) {
            throw HttpException::badRequest('El archivo no es una imagen.', 'no_es_imagen');
        }

        [$ancho, $alto, $tipo] = $info;

        $lectores = [
            IMAGETYPE_JPEG => 'imagecreatefromjpeg',
            IMAGETYPE_PNG => 'imagecreatefrompng',
            IMAGETYPE_WEBP => 'imagecreatefromwebp',
        ];

        if (!isset($lectores[$tipo])) {
            throw HttpException::badRequest('Sólo aceptamos JPG, PNG o WebP.', 'formato_no_soportado');
        }

        if ($ancho < 200 || $alto < 200) {
            throw HttpException::badRequest('La imagen es muy chica: pedimos 200×200 como mínimo.', 'imagen_chica');
        }

        // Una imagen de 40.000×40.000 pesa poco comprimida y revienta la
        // memoria al descomprimirla. 40 MP es techo de sobra para una foto.
        if ($ancho * $alto > 40_000_000) {
            throw HttpException::badRequest('La imagen tiene demasiados píxeles.', 'imagen_enorme');
        }

        $origen = @$lectores[$tipo]($tmp);
        if ($origen === false) {
            throw HttpException::badRequest('No pudimos abrir la imagen.', 'imagen_rota');
        }

        $dir = $this->dirPublico . '/platos';
        if (!is_dir($dir) && !@mkdir($dir, 0o755, true) && !is_dir($dir)) {
            throw new HttpException(500, 'No pudimos crear la carpeta de imágenes.', 'sin_carpeta');
        }

        $this->protegerCarpeta($this->dirPublico);

        // El nombre lo armamos nosotros. El del archivo original no se usa
        // ni para derivarlo: ahí es donde entran los ../ y los .php.
        $base = sprintf('%s-%d-%s', Slug::de($tenantSlug), $productId, bin2hex(random_bytes(4)));

        $grande = $this->escribirJpeg($origen, $dir . '/' . $base . '.jpg', self::LADO_MAX);
        $chica = $this->escribirJpeg($origen, $dir . '/' . $base . '-sm.jpg', self::LADO_MIN_SM);

        imagedestroy($origen);

        if (!$grande || !$chica) {
            throw new HttpException(500, 'No pudimos guardar la imagen.', 'escritura_fallida');
        }

        return self::RUTA_PUBLICA . '/' . $base . '.jpg';
    }

    /**
     * Borra una foto subida y su versión chica.
     *
     * Sólo toca archivos dentro de la carpeta de subidas: una ruta como
     * `/img/platos/b-clasica.jpg`, que es material del repositorio, se
     * ignora en vez de borrarse.
     */
    public function borrarFoto(?string $rutaPublica): void
    {
        if ($rutaPublica === null || !str_starts_with($rutaPublica, self::RUTA_PUBLICA . '/')) {
            return;
        }

        $nombre = basename($rutaPublica);
        if (!preg_match('/^[a-z0-9-]+\.jpg$/', $nombre)) {
            return;
        }

        $dir = $this->dirPublico . '/platos';
        @unlink($dir . '/' . $nombre);
        @unlink($dir . '/' . substr($nombre, 0, -4) . '-sm.jpg');
    }

    /**
     * Reescala manteniendo la proporción y guarda JPEG.
     * Si la imagen ya es más chica que el lado pedido, no la agranda.
     */
    private function escribirJpeg(\GdImage $origen, string $destino, int $ladoMax): bool
    {
        $ancho = imagesx($origen);
        $alto = imagesy($origen);
        $escala = min(1.0, $ladoMax / max($ancho, $alto));

        $nuevoAncho = max(1, (int) round($ancho * $escala));
        $nuevoAlto = max(1, (int) round($alto * $escala));

        $lienzo = imagecreatetruecolor($nuevoAncho, $nuevoAlto);

        // Los PNG y WebP con transparencia quedarían con fondo negro al
        // pasar a JPEG, que no tiene canal alfa. Se pinta blanco debajo.
        $blanco = imagecolorallocate($lienzo, 255, 255, 255);
        imagefilledrectangle($lienzo, 0, 0, $nuevoAncho, $nuevoAlto, $blanco);

        imagecopyresampled($lienzo, $origen, 0, 0, 0, 0, $nuevoAncho, $nuevoAlto, $ancho, $alto);

        $ok = imagejpeg($lienzo, $destino, 82);
        imagedestroy($lienzo);

        return $ok;
    }

    /**
     * Deja un .htaccess que apaga PHP en la carpeta de subidas.
     *
     * Con el servidor embebido de PHP no hace nada, pero en Apache —que
     * es donde esto va a correr— es la diferencia entre una carpeta de
     * imágenes y una de scripts ajenos.
     */
    private function protegerCarpeta(string $dir): void
    {
        $archivo = $dir . '/.htaccess';
        if (is_file($archivo)) {
            return;
        }

        @file_put_contents($archivo, <<<'HTACCESS'
        # Acá sólo hay imágenes subidas por el local. Nada se ejecuta.
        php_flag engine off
        RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .phar
        RemoveType .php .phtml .php3 .php4 .php5 .php7 .php8 .phar

        <IfModule mod_authz_core.c>
          <FilesMatch "\.(?i:php|phtml|phar|html?|js)$">
            Require all denied
          </FilesMatch>
        </IfModule>

        HTACCESS);
    }
}

