<?php

declare(strict_types=1);

namespace Foodix\Payment;

use Foodix\Order\OrderRepository;
use Foodix\Support\Secretos;

/**
 * Arma la cuenta de cobro de cada local.
 *
 * Antes Mercado Pago se construía una sola vez al arrancar, con el token
 * del .env. Eso alcanzaba mientras hubiera una marca; con dos, toda la
 * plata caía en la misma cuenta. Ahora el token sale de la fila del
 * local y se arma por pedido.
 *
 * Es barato: armar un MercadoPago es guardar un string. Lo que cuesta
 * son las llamadas HTTP, y esas no cambiaron.
 */
final class Cuentas
{
    public function __construct(
        private readonly OrderRepository $orders,
        private readonly Secretos $secretos,
        /**
         * El token del .env. Sigue existiendo por una sola razón: que la
         * marca que ya estaba cobrando no se quede sin cobrar el día que
         * esto se despliegue, antes de que nadie haya entrado al panel a
         * cargar su token. Ver `slugLegado`.
         */
        private readonly string $tokenLegado,
        private readonly string $secretoLegado,
        /**
         * A qué local le vale el token del .env: sólo a DEFAULT_TENANT.
         *
         * Esto es deliberado y es lo que vuelve seguro tener un token
         * global dando vueltas. Si el legado valiera para cualquiera, una
         * marca nueva sin token configurado cobraría en la cuenta de la
         * primera marca, que es exactamente el problema que este archivo
         * viene a resolver.
         */
        private readonly string $slugLegado,
        private readonly string $urlFrontGlobal,
        private readonly string $urlApiPublica,
    ) {
    }

    /**
     * @param array{id:int, slug:string} $tenant
     * @param array<string,mixed>        $settings fila de tenant_settings
     */
    public function de(array $tenant, array $settings): CuentaMp
    {
        $slug = (string) $tenant['slug'];

        $token = $this->secretos->descifrar($settings['mp_access_token'] ?? null);
        $secreto = $this->secretos->descifrar($settings['mp_webhook_secret'] ?? null);

        // El .env sólo cubre al local de siempre, y sólo mientras no haya
        // cargado el suyo. En cuanto lo carga, manda la base.
        if ($token === null && $slug === $this->slugLegado) {
            $token = $this->tokenLegado;
            $secreto ??= $this->secretoLegado;
        }

        $mp = MercadoPago::desdeToken($token);

        return new CuentaMp(
            $mp,
            $mp === null ? null : new Cobros($this->orders, $mp),
            trim((string) ($secreto ?? '')),
            $this->urlFront($settings),
            $this->urlWebhook($slug),
        );
    }

    /** @param array<string,mixed> $settings */
    private function urlFront(array $settings): string
    {
        $propia = rtrim(trim((string) ($settings['front_url'] ?? '')), '/');

        return $propia !== '' ? $propia : $this->urlFrontGlobal;
    }

    /**
     * El aviso de Mercado Pago llega con el id del pago y nada más. Para
     * pedirle los datos de ese pago hace falta el token del local, pero
     * de qué local es se sabe recién adentro de la respuesta: huevo y
     * gallina.
     *
     * Se corta dándole a cada local su propia dirección de aviso. La
     * `notification_url` va grabada en cada preferencia de pago, así que
     * Mercado Pago vuelve por donde le dijimos y el local viaja en la
     * ruta. Nada que adivinar.
     */
    private function urlWebhook(string $slug): ?string
    {
        if ($this->urlApiPublica === '') {
            return null;
        }

        return $this->urlApiPublica . '/t/' . $slug . '/webhooks/mercadopago';
    }
}
