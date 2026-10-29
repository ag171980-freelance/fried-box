<?php

declare(strict_types=1);

namespace Foodix\Menu;

use Foodix\Support\Response;
use Foodix\Tenant\TenantResolver;

final class MenuController
{
    /** Una carta cambia poco; un minuto de caché le saca mucha carga al servidor. */
    private const CACHE_SECONDS = 60;

    public function __construct(
        private readonly MenuRepository $repo,
        private readonly MenuPresenter $presenter,
        private readonly TenantResolver $tenants,
    ) {
    }

    /**
     * GET /menu
     * GET /menu/{menuSlug}
     * GET /t/{tenantSlug}/menu
     * GET /t/{tenantSlug}/menu/{menuSlug}
     *
     * @param array<string,string> $params
     */
    public function show(array $params): void
    {
        $tenant = $this->tenants->find($this->tenants->resolveSlug($params['tenantSlug'] ?? null));
        $menu = $this->repo->menu($tenant['id'], $params['menuSlug'] ?? null);

        $tenantId = $tenant['id'];
        $menuId = $menu['id'];

        $payload = $this->presenter->menu(
            $tenant,
            $this->repo->settings($tenantId),
            $menu,
            $this->repo->categories($tenantId, $menuId),
            $this->repo->products($tenantId, $menuId),
            $this->repo->tagsByProduct($tenantId, $menuId),
            $this->repo->optionGroups($tenantId, $menuId),
            $this->repo->optionGroupIdsByProduct($tenantId, $menuId),
            $this->repo->promos($tenantId, $menuId),
        );

        Response::json($payload, 200, self::CACHE_SECONDS);
    }

    /**
     * GET /menus
     * GET /t/{tenantSlug}/menus
     *
     * Las cartas que tiene el local. Sirve para el día que un mismo
     * local publique carta de almuerzo y carta de noche.
     *
     * @param array<string,string> $params
     */
    public function index(array $params): void
    {
        $tenant = $this->tenants->find($this->tenants->resolveSlug($params['tenantSlug'] ?? null));

        $menus = array_map(
            static fn (array $m): array => [
                'id' => $m['slug'],
                'name' => $m['name'],
                'default' => (bool) $m['is_default'],
            ],
            $this->repo->menusOf($tenant['id']),
        );

        Response::json([
            'restaurant' => ['id' => $tenant['slug'], 'name' => $tenant['name']],
            'menus' => $menus,
        ], 200, self::CACHE_SECONDS);
    }
}
