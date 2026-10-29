<?php

declare(strict_types=1);

namespace Foodix\Menu;

use Foodix\Order\PromoRules;

/**
 * El contrato con el front vive acá.
 *
 * La forma que se arma en esta clase es exactamente la que hoy devuelve
 * getMenu() en frontend/src/mocks/api.js. Si algún día el front deja de
 * dibujar algo, este es el primer archivo que hay que abrir.
 *
 * Hacia afuera se exponen slugs y no ids numéricos: el front ya usa
 * 'b-clasica' como clave de React y en el enlace /?plato=b-clasica.
 */
final class MenuPresenter
{
    public function __construct(private readonly string $assetBaseUrl = '')
    {
    }

    /**
     * @param array{id:int, slug:string, name:string, tagline:?string} $tenant
     * @param array<string,mixed> $settings
     * @param array{id:int, slug:string, name:string} $menu
     * @param list<array<string,mixed>> $categories
     * @param list<array<string,mixed>> $products
     * @param array<int, list<string>> $tagsByProduct
     * @param array<int, array<string,mixed>> $optionGroups
     * @param array<int, list<int>> $groupIdsByProduct
     * @param list<array<string,mixed>> $promos
     * @return array<string, mixed>
     */
    public function menu(
        array $tenant,
        array $settings,
        array $menu,
        array $categories,
        array $products,
        array $tagsByProduct,
        array $optionGroups,
        array $groupIdsByProduct,
        array $promos,
    ): array {
        return [
            'restaurant' => $this->restaurant($tenant, $settings),
            'menu' => ['id' => $menu['slug'], 'name' => $menu['name']],
            'categories' => array_map(
                static fn (array $c): array => ['id' => $c['slug'], 'name' => $c['name']],
                $categories,
            ),
            'items' => array_map(
                fn (array $p): array => $this->item($p, $tagsByProduct, $optionGroups, $groupIdsByProduct),
                $products,
            ),
            'promos' => array_map(
                fn (array $p): array => [
                    'id' => $p['slug'],
                    'kicker' => $p['kicker'],
                    'title' => $p['title'],
                    'body' => $p['body'],
                    // Null: el front pone la imagen genérica de la marca.
                    'image' => $this->asset($p['image_path']),
                    'itemId' => $p['product_slug'],
                    'percent' => $p['discount_percent'] === null ? null : (float) $p['discount_percent'],
                    'days' => $p['days'] === null || $p['days'] === '' ? [] : explode(',', $p['days']),
                    // Si descuenta hoy. Una promo de los lunes se sigue
                    // mostrando el martes, pero el ticket no la aplica.
                    'today' => PromoRules::valeElDia($p['days'], PromoRules::hoy()),
                ],
                $promos,
            ),
        ];
    }

    /**
     * @param array{id:int, slug:string, name:string, tagline:?string} $tenant
     * @param array<string,mixed> $settings
     * @return array<string,mixed>
     */
    private function restaurant(array $tenant, array $settings): array
    {
        return [
            'id' => $tenant['slug'],
            'name' => $tenant['name'],
            'tagline' => $tenant['tagline'],
            'address' => $settings['address'],
            'phone' => $settings['phone'],
            'hours' => $settings['hours_text'],
            'currency' => $settings['currency'],
            'deliveryFee' => (float) $settings['delivery_fee'],
            'minOrder' => (float) $settings['min_order'],
            'etaDelivery' => self::eta($settings['eta_delivery_min'], $settings['eta_delivery_max']),
            'etaPickup' => self::eta($settings['eta_pickup_min'], $settings['eta_pickup_max']),
            'acceptsDelivery' => (bool) $settings['accepts_delivery'],
            'acceptsPickup' => (bool) $settings['accepts_pickup'],
            // Abierto o cerrado lo prende el local desde el panel. Antes
            // la carta decía «Abierto» escrito a mano y no era un dato.
            'isOpen' => (bool) ($settings['is_open'] ?? 1),
            'closedMessage' => $settings['closed_message'] ?? null,
            // El estilo de carta y la paleta salen de la base: cada local
            // se queda con la combinación que eligió, no con la que tenga
            // guardada en localStorage el teléfono que lo abre.
            'theme' => $settings['theme'],
            'layout' => $settings['layout'],
        ];
    }

    private static function eta(mixed $min, mixed $max): string
    {
        return sprintf('%d a %d min', (int) $min, (int) $max);
    }

    /**
     * @param array<string,mixed> $p
     * @param array<int, list<string>> $tagsByProduct
     * @param array<int, array<string,mixed>> $optionGroups
     * @param array<int, list<int>> $groupIdsByProduct
     * @return array<string,mixed>
     */
    private function item(
        array $p,
        array $tagsByProduct,
        array $optionGroups,
        array $groupIdsByProduct,
    ): array {
        $id = (int) $p['id'];

        $options = [];
        foreach ($groupIdsByProduct[$id] ?? [] as $groupId) {
            if (isset($optionGroups[$groupId])) {
                $options[] = self::optionGroup($optionGroups[$groupId]);
            }
        }

        return [
            'id' => $p['slug'],
            'category' => $p['category_slug'],
            'name' => $p['name'],
            'description' => $p['description'],
            'price' => (float) $p['price'],
            'image' => $this->asset($p['image_path']),
            'art' => $p['art_shape'] === null
                ? null
                : ['shape' => $p['art_shape'], 'hue' => (int) $p['art_hue']],
            'badge' => $p['badge'],
            'popular' => (bool) $p['is_popular'],
            'tags' => $tagsByProduct[$id] ?? [],
            'options' => $options,
        ];
    }

    /**
     * @param array<string,mixed> $g
     * @return array<string,mixed>
     */
    private static function optionGroup(array $g): array
    {
        return [
            'id' => $g['slug'],
            'name' => $g['name'],
            'type' => $g['type'],
            'required' => (bool) $g['is_required'],
            'max' => $g['max_choices'] === null ? null : (int) $g['max_choices'],
            'choices' => array_map(
                static fn (array $c): array => [
                    'id' => $c['slug'],
                    'name' => $c['name'],
                    'price' => (float) $c['price_delta'],
                    'default' => (bool) $c['is_default'],
                    // Va sola: «Sin salsas» no se combina con las salsas.
                    'exclusive' => (bool) $c['is_exclusive'],
                ],
                $g['choices'],
            ),
        ];
    }

    private function asset(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }

        return $this->assetBaseUrl === '' ? $path : $this->assetBaseUrl . $path;
    }
}
