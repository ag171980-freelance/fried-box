<?php

declare(strict_types=1);

namespace Foodix\Payment;

/**
 * Con qué cuenta cobra un local, y a dónde vuelve su cliente.
 *
 * Existe para que las cuatro cosas que antes eran globales viajen
 * juntas: si alguien agrega una quinta, aparece acá y el compilador le
 * avisa a quien la tenga que pasar.
 *
 * `mp` en null significa «este local todavía no conectó su cuenta». No
 * es un error: es el estado de toda marca nueva hasta que alguien entra
 * al panel y carga el token.
 */
final class CuentaMp
{
    public function __construct(
        public readonly ?MercadoPago $mp,
        public readonly ?Cobros $cobros,
        /** La clave del webhook, o '' si el local no la configuró. */
        public readonly string $secretoWebhook,
        /** El sitio del local, a donde vuelve el cliente desde el pago. */
        public readonly string $urlFront,
        /** La dirección que recibe los avisos, o null si no hay backend público. */
        public readonly ?string $urlWebhook,
    ) {
    }

    public function cobra(): bool
    {
        return $this->mp !== null;
    }
}
