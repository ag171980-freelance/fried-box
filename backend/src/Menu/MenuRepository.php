<?php

declare(strict_types=1);

namespace Foodix\Menu;

use Foodix\Support\HttpException;
use PDO;

/**
 * Lee una carta completa.
 *
 * Son siete consultas fijas, no una por plato. Con 29 platos la
 * diferencia no se nota; con una carta de 200 y varios locales pegando
 * al mismo tiempo, sí. Cada consulta trae su tabla entera acotada al
 * menú y el armado se hace en PHP, que para este volumen es más barato
 * que un join gigante con filas repetidas.
 *
 * Toda consulta lleva tenant_id aunque menu_id ya lo implique. Es
 * redundante a propósito: si algún día un id de menú se filtra o se
 * adivina, el filtro por local sigue tapando el agujero.
 */
final class MenuRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    /** @return array<string, mixed> */
    public function settings(int $tenantId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM tenant_settings WHERE tenant_id = :t LIMIT 1');
        $stmt->execute(['t' => $tenantId]);
        $row = $stmt->fetch();

        if ($row === false) {
            throw HttpException::notFound('El local no tiene configuración cargada.', 'sin_configuracion');
        }

        return $row;
    }

    /**
     * El menú pedido, o el marcado por defecto si no se pidió ninguno.
     *
     * @return array{id:int, slug:string, name:string}
     */
    public function menu(int $tenantId, ?string $menuSlug): array
    {
        if ($menuSlug !== null && $menuSlug !== '') {
            $stmt = $this->db->prepare(
                'SELECT id, slug, name
                   FROM menus
                  WHERE tenant_id = :t AND slug = :s AND is_active = 1
                  LIMIT 1',
            );
            $stmt->execute(['t' => $tenantId, 's' => $menuSlug]);
        } else {
            $stmt = $this->db->prepare(
                'SELECT id, slug, name
                   FROM menus
                  WHERE tenant_id = :t AND is_active = 1
                  ORDER BY is_default DESC, sort_order ASC, id ASC
                  LIMIT 1',
            );
            $stmt->execute(['t' => $tenantId]);
        }

        $row = $stmt->fetch();
        if ($row === false) {
            throw HttpException::notFound('Ese local no tiene una carta publicada.', 'carta_no_encontrada');
        }

        return ['id' => (int) $row['id'], 'slug' => (string) $row['slug'], 'name' => (string) $row['name']];
    }

    /** @return list<array<string,mixed>> */
    public function menusOf(int $tenantId): array
    {
        $stmt = $this->db->prepare(
            'SELECT slug, name, is_default
               FROM menus
              WHERE tenant_id = :t AND is_active = 1
              ORDER BY is_default DESC, sort_order ASC, id ASC',
        );
        $stmt->execute(['t' => $tenantId]);

        return $stmt->fetchAll();
    }

    /** @return list<array<string,mixed>> */
    public function categories(int $tenantId, int $menuId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, slug, name
               FROM categories
              WHERE tenant_id = :t AND menu_id = :m AND is_active = 1
              ORDER BY sort_order ASC, id ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);

        return $stmt->fetchAll();
    }

    /** @return list<array<string,mixed>> */
    public function products(int $tenantId, int $menuId): array
    {
        $stmt = $this->db->prepare(
            'SELECT p.id, p.slug, p.name, p.description, p.price, p.image_path,
                    p.art_shape, p.art_hue, p.badge, p.is_popular, p.category_id,
                    c.slug AS category_slug
               FROM products p
               JOIN categories c ON c.id = p.category_id
              WHERE p.tenant_id = :t
                AND p.menu_id = :m
                AND p.is_available = 1
                AND c.is_active = 1
              ORDER BY c.sort_order ASC, p.sort_order ASC, p.id ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);

        return $stmt->fetchAll();
    }

    /**
     * Etiquetas agrupadas por id de plato.
     *
     * @return array<int, list<string>>
     */
    public function tagsByProduct(int $tenantId, int $menuId): array
    {
        $stmt = $this->db->prepare(
            'SELECT pt.product_id, pt.tag
               FROM product_tags pt
               JOIN products p ON p.id = pt.product_id
              WHERE p.tenant_id = :t AND p.menu_id = :m
              ORDER BY pt.tag ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);

        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(int) $row['product_id']][] = (string) $row['tag'];
        }

        return $out;
    }

    /**
     * Grupos de opciones de la carta, cada uno con sus opciones ya
     * adentro. Se traen todos los del menú de una y después se reparten:
     * el mismo grupo lo usan varios platos.
     *
     * @return array<int, array<string,mixed>>  indexado por id de grupo
     */
    public function optionGroups(int $tenantId, int $menuId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, slug, name, type, is_required, max_choices
               FROM option_groups
              WHERE tenant_id = :t AND menu_id = :m
              ORDER BY sort_order ASC, id ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);

        $groups = [];
        foreach ($stmt->fetchAll() as $row) {
            $row['choices'] = [];
            $groups[(int) $row['id']] = $row;
        }

        if ($groups === []) {
            return [];
        }

        $stmt = $this->db->prepare(
            'SELECT oc.option_group_id, oc.slug, oc.name, oc.price_delta, oc.is_default, oc.is_exclusive
               FROM option_choices oc
               JOIN option_groups og ON og.id = oc.option_group_id
              WHERE og.tenant_id = :t AND og.menu_id = :m AND oc.is_available = 1
              ORDER BY oc.sort_order ASC, oc.id ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);

        foreach ($stmt->fetchAll() as $choice) {
            $groupId = (int) $choice['option_group_id'];
            if (isset($groups[$groupId])) {
                $groups[$groupId]['choices'][] = $choice;
            }
        }

        return $groups;
    }

    /**
     * Qué grupos usa cada plato, en orden.
     *
     * @return array<int, list<int>>  id de plato => ids de grupo
     */
    public function optionGroupIdsByProduct(int $tenantId, int $menuId): array
    {
        $stmt = $this->db->prepare(
            'SELECT pog.product_id, pog.option_group_id
               FROM product_option_groups pog
               JOIN products p ON p.id = pog.product_id
              WHERE p.tenant_id = :t AND p.menu_id = :m
              ORDER BY pog.sort_order ASC, pog.option_group_id ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);

        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(int) $row['product_id']][] = (int) $row['option_group_id'];
        }

        return $out;
    }

    /**
     * Promos vigentes ahora. Las fechas se comparan en la base para no
     * depender de la hora del servidor de PHP.
     *
     * @return list<array<string,mixed>>
     */
    public function promos(int $tenantId, int $menuId): array
    {
        $stmt = $this->db->prepare(
            'SELECT pr.slug, pr.kicker, pr.title, pr.body, p.slug AS product_slug,
                    pr.discount_percent, pr.days, pr.image_path
               FROM promos pr
          LEFT JOIN products p ON p.id = pr.product_id AND p.is_available = 1
              WHERE pr.tenant_id = :t
                AND pr.menu_id = :m
                AND pr.is_active = 1
                AND (pr.starts_at IS NULL OR pr.starts_at <= NOW())
                AND (pr.ends_at   IS NULL OR pr.ends_at   >= NOW())
              ORDER BY pr.sort_order ASC, pr.id ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);

        return $stmt->fetchAll();
    }
}
