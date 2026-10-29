<?php

declare(strict_types=1);

namespace Foodix\Payment;

use Foodix\Support\HttpException;

/**
 * Lo poco que hace falta de la API de Mercado Pago, sin SDK.
 *
 * Checkout Pro: se crea una preferencia con el total del pedido, el
 * cliente paga en la página de Mercado Pago y vuelve. Lo que vuelve en
 * la URL no se cree nunca: el estado del pago se le pregunta siempre a
 * la API con el access token del local.
 *
 * Con un token de prueba (empieza con TEST-) todo pasa en el sandbox y
 * se paga con las tarjetas de prueba de Mercado Pago.
 */
final class MercadoPago
{
    private const API = 'https://api.mercadopago.com';

    public function __construct(private readonly string $accessToken)
    {
    }

    /** Null si no hay token cargado: el local todavía no conectó su cuenta. */
    public static function desdeConfig(array $config): ?self
    {
        $token = trim((string) ($config['access_token'] ?? ''));

        return $token === '' ? null : new self($token);
    }

    public function esPrueba(): bool
    {
        return str_starts_with($this->accessToken, 'TEST-');
    }

    /**
     * La preferencia de pago de un pedido. Va un solo ítem con el total
     * ya calculado, envío y descuentos incluidos: Mercado Pago no acepta
     * ítems con precio negativo, y así lo que se cobra es exactamente
     * lo que dice el pedido.
     *
     * @param array<string,mixed> $order    la fila de orders, con items
     * @return array{id:string, url:string}
     */
    public function crearPreferencia(
        array $order,
        string $marca,
        string $urlFront,
        ?string $urlNotificaciones,
    ): array {
        $publicId = (string) $order['public_id'];
        $vuelta = rtrim($urlFront, '/') . '/pedido/' . $publicId;

        $detalle = implode(', ', array_map(
            static fn (array $i): string => $i['qty'] . '× ' . $i['name'],
            $order['items'] ?? [],
        ));

        $cuerpo = [
            'items' => [[
                'id' => $publicId,
                'title' => sprintf('Pedido #%s · %s', $order['number'], $marca),
                'description' => mb_substr($detalle, 0, 250),
                'quantity' => 1,
                'currency_id' => (string) ($order['currency'] ?? 'ARS'),
                'unit_price' => round((float) $order['total'], 2),
            ]],
            'payer' => array_filter([
                'name' => (string) $order['customer_name'],
                'email' => $order['customer_email'] ?: null,
            ]),
            // Con esto se encuentra el pedido cuando vuelve el pago.
            'external_reference' => $publicId,
            'back_urls' => ['success' => $vuelta, 'failure' => $vuelta, 'pending' => $vuelta],
            'statement_descriptor' => mb_substr(strtoupper(preg_replace('/[^A-Za-z0-9 ]/', '', $marca) ?? ''), 0, 22),
            'metadata' => ['pedido' => $publicId],
        ];

        // Mercado Pago sólo vuelve solo (sin que el cliente toque
        // «Volver al sitio») a una dirección https.
        if (str_starts_with($vuelta, 'https://')) {
            $cuerpo['auto_return'] = 'approved';
        }

        // Y sólo puede avisar a una dirección pública. En localhost no
        // hay webhook: la pantalla del pedido pregunta por el pago.
        if ($urlNotificaciones !== null && str_starts_with($urlNotificaciones, 'https://')) {
            $cuerpo['notification_url'] = $urlNotificaciones;
        }

        $res = $this->pedir('POST', '/checkout/preferences', $cuerpo, 'pref-' . $publicId . '-' . bin2hex(random_bytes(4)));

        $url = $this->esPrueba() ? ($res['sandbox_init_point'] ?? null) : ($res['init_point'] ?? null);
        if (!is_string($url) || $url === '') {
            throw new HttpException(502, 'Mercado Pago no devolvió el link de pago.', 'mp_sin_link');
        }

        return ['id' => (string) $res['id'], 'url' => $url];
    }

    /** @return array<string,mixed> */
    public function pago(string $id): array
    {
        if (!preg_match('/^\d{1,20}$/', $id)) {
            throw HttpException::badRequest('Identificador de pago inválido.', 'mp_pago_invalido');
        }

        return $this->pedir('GET', '/v1/payments/' . $id);
    }

    /**
     * Los pagos de un pedido, del más nuevo al más viejo. Sirve cuando
     * no llegó el webhook: en local nunca llega, y en producción puede
     * tardar.
     *
     * @return list<array<string,mixed>>
     */
    public function pagosDe(string $externalReference): array
    {
        $res = $this->pedir('GET', '/v1/payments/search?' . http_build_query([
            'external_reference' => $externalReference,
            'sort' => 'date_created',
            'criteria' => 'desc',
            'limit' => 20,
        ]));

        return array_values($res['results'] ?? []);
    }

    /** Para el chequeo: si el token anda y de quién es la cuenta. */
    public function cuenta(): array
    {
        return $this->pedir('GET', '/users/me');
    }

    /**
     * Valida la firma de una notificación (el header x-signature).
     *
     * Mercado Pago firma «id:{data.id};request-id:{x-request-id};ts:{ts};»
     * con la clave secreta del webhook. Igual el pago se vuelve a pedir a
     * la API, así que esto es una capa más, no la única.
     */
    public static function firmaValida(string $firma, string $requestId, string $dataId, string $secreto): bool
    {
        $partes = [];
        foreach (explode(',', $firma) as $par) {
            [$k, $v] = array_map('trim', explode('=', $par, 2) + [1 => '']);
            $partes[$k] = $v;
        }

        if (($partes['ts'] ?? '') === '' || ($partes['v1'] ?? '') === '') {
            return false;
        }

        // El id va en minúscula si es alfanumérico, según la documentación.
        $plantilla = 'id:' . strtolower($dataId) . ';';
        if ($requestId !== '') {
            $plantilla .= 'request-id:' . $requestId . ';';
        }
        $plantilla .= 'ts:' . $partes['ts'] . ';';

        return hash_equals(hash_hmac('sha256', $plantilla, $secreto), $partes['v1']);
    }

    /**
     * @param array<string,mixed>|null $cuerpo
     * @return array<string,mixed>
     */
    private function pedir(string $metodo, string $ruta, ?array $cuerpo = null, ?string $idempotencia = null): array
    {
        $ch = curl_init(self::API . $ruta);
        $headers = [
            'Authorization: Bearer ' . $this->accessToken,
            'Accept: application/json',
        ];
        if ($cuerpo !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        if ($idempotencia !== null) {
            $headers[] = 'X-Idempotency-Key: ' . $idempotencia;
        }

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $metodo,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_POSTFIELDS => $cuerpo === null ? null : json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);

        $respuesta = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $errorRed = curl_error($ch);

        if ($respuesta === false) {
            throw new HttpException(502, 'No pudimos conectarnos con Mercado Pago. Probá de nuevo en un rato.', 'mp_sin_conexion');
        }

        $datos = json_decode((string) $respuesta, true);

        if ($status === 401) {
            throw new HttpException(502, 'Mercado Pago rechazó el access token. Revisá MP_ACCESS_TOKEN en el .env.', 'mp_token_invalido');
        }
        if ($status < 200 || $status >= 300 || !is_array($datos)) {
            $mensaje = is_array($datos) ? (string) ($datos['message'] ?? 'error') : $errorRed;
            throw new HttpException(502, 'Mercado Pago respondió con un error: ' . $mensaje, 'mp_error');
        }

        return $datos;
    }
}
