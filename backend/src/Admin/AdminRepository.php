<?php

declare(strict_types=1);

namespace Foodix\Admin;

use Foodix\Support\HttpException;
use Foodix\Support\Slug;
use PDO;

/**
 * Las escrituras del panel.
 *
 * Regla única y sin excepciones: **toda** consulta lleva el tenant_id en
 * el WHERE. No alcanza con filtrar al listar; también al actualizar y al
 * borrar, porque el id viaja en la URL y alguien puede probar con otro.
 * Si una fila no es del local que pide, acá no existe.
 */
final class AdminRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    /* =================================================================
       Local: configuración, logística y estado
       ================================================================= */

    /** @return array<string,mixed> */
    public function settings(int $tenantId): array
    {
        $stmt = $this->db->prepare(
            'SELECT t.slug, t.name, t.tagline, s.*
               FROM tenants t
               JOIN tenant_settings s ON s.tenant_id = t.id
              WHERE t.id = :t',
        );
        $stmt->execute(['t' => $tenantId]);
        $row = $stmt->fetch();

        if ($row === false) {
            throw HttpException::notFound('El local no existe.');
        }

        return [
            'slug' => $row['slug'],
            'name' => $row['name'],
            'tagline' => $row['tagline'],
            'address' => $row['address'],
            'phone' => $row['phone'],
            'whatsapp' => $row['whatsapp'],
            'hoursText' => $row['hours_text'],
            'isOpen' => (bool) $row['is_open'],
            'closedMessage' => $row['closed_message'],
            'acceptsDelivery' => (bool) $row['accepts_delivery'],
            'acceptsPickup' => (bool) $row['accepts_pickup'],
            'deliveryFee' => (float) $row['delivery_fee'],
            'minOrder' => (float) $row['min_order'],
            'etaDeliveryMin' => (int) $row['eta_delivery_min'],
            'etaDeliveryMax' => (int) $row['eta_delivery_max'],
            'etaPickupMin' => (int) $row['eta_pickup_min'],
            'etaPickupMax' => (int) $row['eta_pickup_max'],
            'theme' => $row['theme'],
            'layout' => $row['layout'],
        ];
    }

    /** @param array<string,mixed> $d */
    public function guardarSettings(int $tenantId, array $d): void
    {
        $this->db->prepare('UPDATE tenants SET name = :n, tagline = :g WHERE id = :t')->execute([
            'n' => $d['name'],
            'g' => $d['tagline'],
            't' => $tenantId,
        ]);

        $this->db->prepare(
            'UPDATE tenant_settings SET
                address = :dir, phone = :tel, whatsapp = :wa, hours_text = :hs,
                is_open = :abierto, closed_message = :msg,
                accepts_delivery = :envio, accepts_pickup = :retiro,
                delivery_fee = :costo, min_order = :minimo,
                eta_delivery_min = :edmin, eta_delivery_max = :edmax,
                eta_pickup_min = :epmin, eta_pickup_max = :epmax,
                theme = :tema, layout = :estilo
              WHERE tenant_id = :t',
        )->execute([
            'dir' => $d['address'],
            'tel' => $d['phone'],
            'wa' => $d['whatsapp'],
            'hs' => $d['hoursText'],
            'abierto' => $d['isOpen'] ? 1 : 0,
            'msg' => $d['closedMessage'],
            'envio' => $d['acceptsDelivery'] ? 1 : 0,
            'retiro' => $d['acceptsPickup'] ? 1 : 0,
            'costo' => $d['deliveryFee'],
            'minimo' => $d['minOrder'],
            'edmin' => $d['etaDeliveryMin'],
            'edmax' => $d['etaDeliveryMax'],
            'epmin' => $d['etaPickupMin'],
            'epmax' => $d['etaPickupMax'],
            'tema' => $d['theme'],
            'estilo' => $d['layout'],
            't' => $tenantId,
        ]);
    }

    /** El interruptor de abierto/cerrado, que es el que más se usa. */
    public function cambiarEstado(int $tenantId, bool $abierto, ?string $mensaje): void
    {
        $this->db->prepare(
            'UPDATE tenant_settings SET is_open = :a, closed_message = :m WHERE tenant_id = :t',
        )->execute(['a' => $abierto ? 1 : 0, 'm' => $mensaje, 't' => $tenantId]);
    }

    /* =================================================================
       Carta: el menú por defecto del local
       ================================================================= */

    /** @return array{id:int, slug:string, name:string} */
    public function menuPorDefecto(int $tenantId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, slug, name FROM menus
              WHERE tenant_id = :t
              ORDER BY is_default DESC, sort_order ASC, id ASC
              LIMIT 1',
        );
        $stmt->execute(['t' => $tenantId]);
        $menu = $stmt->fetch();

        if ($menu === false) {
            throw HttpException::notFound('El local no tiene ninguna carta.');
        }

        return ['id' => (int) $menu['id'], 'slug' => $menu['slug'], 'name' => $menu['name']];
    }

    /* =================================================================
       Rubros
       ================================================================= */

    /** @return list<array<string,mixed>> */
    public function categorias(int $tenantId, int $menuId): array
    {
        $stmt = $this->db->prepare(
            'SELECT c.id, c.slug, c.name, c.sort_order,
                    (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS platos
               FROM categories c
              WHERE c.tenant_id = :t AND c.menu_id = :m
              ORDER BY c.sort_order ASC, c.id ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);

        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'slug' => $r['slug'],
            'name' => $r['name'],
            'sortOrder' => (int) $r['sort_order'],
            'productCount' => (int) $r['platos'],
        ], $stmt->fetchAll());
    }

    public function crearCategoria(int $tenantId, int $menuId, string $nombre, int $orden): int
    {
        $slug = $this->slugLibre('categories', $menuId, Slug::de($nombre) ?: 'rubro');

        $this->db->prepare(
            'INSERT INTO categories (tenant_id, menu_id, slug, name, sort_order)
             VALUES (:t, :m, :s, :n, :o)',
        )->execute(['t' => $tenantId, 'm' => $menuId, 's' => $slug, 'n' => $nombre, 'o' => $orden]);

        return (int) $this->db->lastInsertId();
    }

    public function actualizarCategoria(int $tenantId, int $id, string $nombre, int $orden): void
    {
        $this->exigirFila('categories', $tenantId, $id, 'El rubro no existe.');

        $this->db->prepare(
            'UPDATE categories SET name = :n, sort_order = :o WHERE id = :id AND tenant_id = :t',
        )->execute(['n' => $nombre, 'o' => $orden, 'id' => $id, 't' => $tenantId]);
    }

    public function borrarCategoria(int $tenantId, int $id): void
    {
        $this->exigirFila('categories', $tenantId, $id, 'El rubro no existe.');

        // products -> categories es RESTRICT, así que la base lo frenaría
        // igual. Se chequea antes para poder decir por qué.
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM products WHERE category_id = :id');
        $stmt->execute(['id' => $id]);

        if ((int) $stmt->fetchColumn() > 0) {
            throw HttpException::badRequest(
                'El rubro todavía tiene platos. Movelos o borralos primero.',
                'rubro_con_platos',
            );
        }

        $this->db->prepare('DELETE FROM categories WHERE id = :id AND tenant_id = :t')
            ->execute(['id' => $id, 't' => $tenantId]);
    }

    /* =================================================================
       Platos
       ================================================================= */

    /** @return list<array<string,mixed>> */
    public function productos(int $tenantId, int $menuId): array
    {
        $stmt = $this->db->prepare(
            'SELECT p.*, c.name AS categoria
               FROM products p
               JOIN categories c ON c.id = p.category_id
              WHERE p.tenant_id = :t AND p.menu_id = :m
              ORDER BY c.sort_order ASC, p.sort_order ASC, p.id ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);
        $filas = $stmt->fetchAll();

        if ($filas === []) {
            return [];
        }

        $ids = array_map(static fn (array $r): int => (int) $r['id'], $filas);
        $etiquetas = $this->etiquetasPorProducto($ids);
        $grupos = $this->gruposPorProducto($ids);

        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'slug' => $r['slug'],
            'name' => $r['name'],
            'description' => $r['description'],
            'price' => (float) $r['price'],
            'image' => $r['image_path'],
            'art' => $r['art_shape'] === null
                ? null
                : ['shape' => $r['art_shape'], 'hue' => (int) $r['art_hue']],
            'badge' => $r['badge'],
            'isPopular' => (bool) $r['is_popular'],
            'isAvailable' => (bool) $r['is_available'],
            'sortOrder' => (int) $r['sort_order'],
            'categoryId' => (int) $r['category_id'],
            'categoryName' => $r['categoria'],
            'tags' => $etiquetas[(int) $r['id']] ?? [],
            'optionGroupIds' => $grupos[(int) $r['id']] ?? [],
        ], $filas);
    }

    /**
     * @param array<string,mixed> $d
     */
    public function crearProducto(int $tenantId, int $menuId, array $d): int
    {
        $this->exigirCategoria($tenantId, $menuId, (int) $d['categoryId']);

        $slug = $this->slugLibre('products', $menuId, Slug::de((string) $d['name']) ?: 'plato');

        $this->db->prepare(
            'INSERT INTO products
               (tenant_id, menu_id, category_id, slug, name, description, price,
                image_path, art_shape, art_hue, badge, is_popular, is_available, sort_order)
             VALUES
               (:t, :m, :c, :s, :n, :d, :p, :img, :shape, :hue, :badge, :pop, :disp, :orden)',
        )->execute([
            't' => $tenantId,
            'm' => $menuId,
            'c' => $d['categoryId'],
            's' => $slug,
            'n' => $d['name'],
            'd' => $d['description'],
            'p' => $d['price'],
            'img' => $d['image'],
            'shape' => $d['artShape'],
            'hue' => $d['artHue'],
            'badge' => $d['badge'],
            'pop' => $d['isPopular'] ? 1 : 0,
            'disp' => $d['isAvailable'] ? 1 : 0,
            'orden' => $d['sortOrder'],
        ]);

        $id = (int) $this->db->lastInsertId();
        $this->guardarEtiquetas($id, $d['tags']);
        $this->guardarGruposDeProducto($tenantId, $menuId, $id, $d['optionGroupIds']);

        return $id;
    }

    /** @param array<string,mixed> $d */
    public function actualizarProducto(int $tenantId, int $menuId, int $id, array $d): void
    {
        $this->exigirFila('products', $tenantId, $id, 'El plato no existe.');
        $this->exigirCategoria($tenantId, $menuId, (int) $d['categoryId']);

        $this->db->prepare(
            'UPDATE products SET
                category_id = :c, name = :n, description = :d, price = :p,
                image_path = :img, art_shape = :shape, art_hue = :hue, badge = :badge,
                is_popular = :pop, is_available = :disp, sort_order = :orden
              WHERE id = :id AND tenant_id = :t',
        )->execute([
            'c' => $d['categoryId'],
            'n' => $d['name'],
            'd' => $d['description'],
            'p' => $d['price'],
            'img' => $d['image'],
            'shape' => $d['artShape'],
            'hue' => $d['artHue'],
            'badge' => $d['badge'],
            'pop' => $d['isPopular'] ? 1 : 0,
            'disp' => $d['isAvailable'] ? 1 : 0,
            'orden' => $d['sortOrder'],
            'id' => $id,
            't' => $tenantId,
        ]);

        $this->guardarEtiquetas($id, $d['tags']);
        $this->guardarGruposDeProducto($tenantId, $menuId, $id, $d['optionGroupIds']);
    }

    /** Prender y apagar un plato es lo que más se usa en el día a día. */
    public function cambiarDisponibilidad(int $tenantId, int $id, bool $disponible): void
    {
        $this->exigirFila('products', $tenantId, $id, 'El plato no existe.');

        $this->db->prepare('UPDATE products SET is_available = :d WHERE id = :id AND tenant_id = :t')
            ->execute(['d' => $disponible ? 1 : 0, 'id' => $id, 't' => $tenantId]);
    }

    public function guardarFoto(int $tenantId, int $id, string $ruta): void
    {
        $this->exigirFila('products', $tenantId, $id, 'El plato no existe.');

        $this->db->prepare('UPDATE products SET image_path = :r WHERE id = :id AND tenant_id = :t')
            ->execute(['r' => $ruta, 'id' => $id, 't' => $tenantId]);
    }

    /** La foto anterior, para poder borrar el archivo al reemplazarla. */
    public function fotoActual(int $tenantId, int $id): ?string
    {
        $stmt = $this->db->prepare('SELECT image_path FROM products WHERE id = :id AND tenant_id = :t');
        $stmt->execute(['id' => $id, 't' => $tenantId]);
        $ruta = $stmt->fetchColumn();

        return $ruta === false || $ruta === null ? null : (string) $ruta;
    }

    public function borrarProducto(int $tenantId, int $id): void
    {
        $this->exigirFila('products', $tenantId, $id, 'El plato no existe.');

        // order_items -> products es SET NULL: borrar un plato no rompe
        // los pedidos viejos, que guardan nombre y precio propios.
        $this->db->prepare('DELETE FROM products WHERE id = :id AND tenant_id = :t')
            ->execute(['id' => $id, 't' => $tenantId]);
    }

    /* =================================================================
       Grupos de opciones
       ================================================================= */

    /** @return list<array<string,mixed>> */
    public function gruposDeOpciones(int $tenantId, int $menuId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM option_groups
              WHERE tenant_id = :t AND menu_id = :m
              ORDER BY sort_order ASC, id ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);
        $grupos = $stmt->fetchAll();

        if ($grupos === []) {
            return [];
        }

        $stmt = $this->db->prepare(
            'SELECT * FROM option_choices
              WHERE tenant_id = :t
              ORDER BY sort_order ASC, id ASC',
        );
        $stmt->execute(['t' => $tenantId]);

        $porGrupo = [];
        foreach ($stmt->fetchAll() as $c) {
            $porGrupo[(int) $c['option_group_id']][] = [
                'id' => (int) $c['id'],
                'slug' => $c['slug'],
                'name' => $c['name'],
                'priceDelta' => (float) $c['price_delta'],
                'isDefault' => (bool) $c['is_default'],
                'sortOrder' => (int) $c['sort_order'],
            ];
        }

        return array_map(static fn (array $g): array => [
            'id' => (int) $g['id'],
            'slug' => $g['slug'],
            'name' => $g['name'],
            'type' => $g['type'],
            'isRequired' => (bool) $g['is_required'],
            'minChoices' => (int) $g['min_choices'],
            'maxChoices' => (int) $g['max_choices'],
            'sortOrder' => (int) $g['sort_order'],
            'choices' => $porGrupo[(int) $g['id']] ?? [],
        ], $grupos);
    }

    /** @param array<string,mixed> $d */
    public function guardarGrupo(int $tenantId, int $menuId, ?int $id, array $d): int
    {
        if ($id === null) {
            $slug = $this->slugLibre('option_groups', $menuId, Slug::de((string) $d['name']) ?: 'grupo');

            $this->db->prepare(
                'INSERT INTO option_groups
                   (tenant_id, menu_id, slug, name, type, is_required, min_choices, max_choices, sort_order)
                 VALUES (:t, :m, :s, :n, :tipo, :req, :min, :max, :orden)',
            )->execute([
                't' => $tenantId, 'm' => $menuId, 's' => $slug, 'n' => $d['name'],
                'tipo' => $d['type'], 'req' => $d['isRequired'] ? 1 : 0,
                'min' => $d['minChoices'], 'max' => $d['maxChoices'], 'orden' => $d['sortOrder'],
            ]);

            $id = (int) $this->db->lastInsertId();
        } else {
            $this->exigirFila('option_groups', $tenantId, $id, 'El grupo de opciones no existe.');

            $this->db->prepare(
                'UPDATE option_groups SET
                    name = :n, type = :tipo, is_required = :req,
                    min_choices = :min, max_choices = :max, sort_order = :orden
                  WHERE id = :id AND tenant_id = :t',
            )->execute([
                'n' => $d['name'], 'tipo' => $d['type'], 'req' => $d['isRequired'] ? 1 : 0,
                'min' => $d['minChoices'], 'max' => $d['maxChoices'], 'orden' => $d['sortOrder'],
                'id' => $id, 't' => $tenantId,
            ]);
        }

        $this->reemplazarElecciones($tenantId, $id, $d['choices']);

        return $id;
    }

    public function borrarGrupo(int $tenantId, int $id): void
    {
        $this->exigirFila('option_groups', $tenantId, $id, 'El grupo de opciones no existe.');

        // product_option_groups y option_choices cuelgan con CASCADE.
        $this->db->prepare('DELETE FROM option_groups WHERE id = :id AND tenant_id = :t')
            ->execute(['id' => $id, 't' => $tenantId]);
    }

    /* =================================================================
       Promos y cupones
       ================================================================= */

    /** @return list<array<string,mixed>> */
    public function promos(int $tenantId, int $menuId): array
    {
        $stmt = $this->db->prepare(
            'SELECT pr.*, p.name AS plato
               FROM promos pr
               LEFT JOIN products p ON p.id = pr.product_id
              WHERE pr.tenant_id = :t AND pr.menu_id = :m
              ORDER BY pr.sort_order ASC, pr.id ASC',
        );
        $stmt->execute(['t' => $tenantId, 'm' => $menuId]);

        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'slug' => $r['slug'],
            'kicker' => $r['kicker'],
            'title' => $r['title'],
            'body' => $r['body'],
            'productId' => $r['product_id'] === null ? null : (int) $r['product_id'],
            'productName' => $r['plato'],
            'isActive' => (bool) $r['is_active'],
            'sortOrder' => (int) $r['sort_order'],
        ], $stmt->fetchAll());
    }

    /** @param array<string,mixed> $d */
    public function guardarPromo(int $tenantId, int $menuId, ?int $id, array $d): int
    {
        if ($d['productId'] !== null) {
            $this->exigirFila('products', $tenantId, (int) $d['productId'], 'El plato de la promo no existe.');
        }

        if ($id === null) {
            $slug = $this->slugLibre('promos', $menuId, Slug::de((string) $d['title']) ?: 'promo');

            $this->db->prepare(
                'INSERT INTO promos (tenant_id, menu_id, slug, kicker, title, body, product_id, is_active, sort_order)
                 VALUES (:t, :m, :s, :k, :ti, :b, :p, :act, :orden)',
            )->execute([
                't' => $tenantId, 'm' => $menuId, 's' => $slug, 'k' => $d['kicker'],
                'ti' => $d['title'], 'b' => $d['body'], 'p' => $d['productId'],
                'act' => $d['isActive'] ? 1 : 0, 'orden' => $d['sortOrder'],
            ]);

            return (int) $this->db->lastInsertId();
        }

        $this->exigirFila('promos', $tenantId, $id, 'La promo no existe.');

        $this->db->prepare(
            'UPDATE promos SET kicker = :k, title = :ti, body = :b, product_id = :p,
                               is_active = :act, sort_order = :orden
              WHERE id = :id AND tenant_id = :t',
        )->execute([
            'k' => $d['kicker'], 'ti' => $d['title'], 'b' => $d['body'], 'p' => $d['productId'],
            'act' => $d['isActive'] ? 1 : 0, 'orden' => $d['sortOrder'], 'id' => $id, 't' => $tenantId,
        ]);

        return $id;
    }

    public function borrarPromo(int $tenantId, int $id): void
    {
        $this->exigirFila('promos', $tenantId, $id, 'La promo no existe.');
        $this->db->prepare('DELETE FROM promos WHERE id = :id AND tenant_id = :t')
            ->execute(['id' => $id, 't' => $tenantId]);
    }

    /** @return list<array<string,mixed>> */
    public function cupones(int $tenantId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM coupons WHERE tenant_id = :t ORDER BY id ASC',
        );
        $stmt->execute(['t' => $tenantId]);

        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'code' => $r['code'],
            'type' => $r['type'],
            'value' => (float) $r['value'],
            'label' => $r['label'],
            'minOrder' => $r['min_order'] === null ? null : (float) $r['min_order'],
            'maxUses' => $r['max_uses'] === null ? null : (int) $r['max_uses'],
            'usedCount' => (int) $r['used_count'],
            'isActive' => (bool) $r['is_active'],
        ], $stmt->fetchAll());
    }

    /** @param array<string,mixed> $d */
    public function guardarCupon(int $tenantId, ?int $id, array $d): int
    {
        $codigo = strtoupper((string) $d['code']);

        // El código es único por local, así que un choque es un error del
        // usuario y merece un mensaje, no un 500 de la base.
        $stmt = $this->db->prepare(
            'SELECT id FROM coupons WHERE tenant_id = :t AND code = :c AND id <> :id',
        );
        $stmt->execute(['t' => $tenantId, 'c' => $codigo, 'id' => $id ?? 0]);

        if ($stmt->fetchColumn() !== false) {
            throw HttpException::badRequest('Ya existe un cupón con ese código.', 'cupon_repetido');
        }

        if ($id === null) {
            $this->db->prepare(
                'INSERT INTO coupons (tenant_id, code, type, value, label, min_order, max_uses, is_active)
                 VALUES (:t, :c, :tipo, :v, :l, :min, :max, :act)',
            )->execute([
                't' => $tenantId, 'c' => $codigo, 'tipo' => $d['type'], 'v' => $d['value'],
                'l' => $d['label'], 'min' => $d['minOrder'], 'max' => $d['maxUses'],
                'act' => $d['isActive'] ? 1 : 0,
            ]);

            return (int) $this->db->lastInsertId();
        }

        $this->exigirFila('coupons', $tenantId, $id, 'El cupón no existe.');

        $this->db->prepare(
            'UPDATE coupons SET code = :c, type = :tipo, value = :v, label = :l,
                                min_order = :min, max_uses = :max, is_active = :act
              WHERE id = :id AND tenant_id = :t',
        )->execute([
            'c' => $codigo, 'tipo' => $d['type'], 'v' => $d['value'], 'l' => $d['label'],
            'min' => $d['minOrder'], 'max' => $d['maxUses'], 'act' => $d['isActive'] ? 1 : 0,
            'id' => $id, 't' => $tenantId,
        ]);

        return $id;
    }

    public function borrarCupon(int $tenantId, int $id): void
    {
        $this->exigirFila('coupons', $tenantId, $id, 'El cupón no existe.');
        $this->db->prepare('DELETE FROM coupons WHERE id = :id AND tenant_id = :t')
            ->execute(['id' => $id, 't' => $tenantId]);
    }

    /* =================================================================
       Ayudas internas
       ================================================================= */

    /**
     * Confirma que la fila existe y es de este local. Es la pieza que
     * impide que alguien edite el plato de otra marca probando ids.
     */
    private function exigirFila(string $tabla, int $tenantId, int $id, string $mensaje): void
    {
        // $tabla nunca viene del usuario: son literales de este archivo.
        $stmt = $this->db->prepare("SELECT 1 FROM `$tabla` WHERE id = :id AND tenant_id = :t");
        $stmt->execute(['id' => $id, 't' => $tenantId]);

        if ($stmt->fetchColumn() === false) {
            throw HttpException::notFound($mensaje);
        }
    }

    private function exigirCategoria(int $tenantId, int $menuId, int $categoryId): void
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM categories WHERE id = :id AND tenant_id = :t AND menu_id = :m',
        );
        $stmt->execute(['id' => $categoryId, 't' => $tenantId, 'm' => $menuId]);

        if ($stmt->fetchColumn() === false) {
            throw HttpException::badRequest('Ese rubro no es de esta carta.', 'rubro_invalido');
        }
    }

    /**
     * Un slug que no choque dentro de la misma carta. El nombre lo elige
     * una persona y «Papas» puede repetirse; el slug no.
     */
    private function slugLibre(string $tabla, int $menuId, string $base): string
    {
        $base = substr($base, 0, 50);
        $slug = $base;
        $n = 2;

        for (;;) {
            $stmt = $this->db->prepare("SELECT 1 FROM `$tabla` WHERE menu_id = :m AND slug = :s");
            $stmt->execute(['m' => $menuId, 's' => $slug]);

            if ($stmt->fetchColumn() === false) {
                return $slug;
            }

            $slug = $base . '-' . $n;
            $n++;
        }
    }

    /** @param list<string> $tags */
    private function guardarEtiquetas(int $productId, array $tags): void
    {
        $this->db->prepare('DELETE FROM product_tags WHERE product_id = :p')->execute(['p' => $productId]);

        if ($tags === []) {
            return;
        }

        $stmt = $this->db->prepare('INSERT INTO product_tags (product_id, tag) VALUES (:p, :t)');
        foreach (array_unique($tags) as $tag) {
            $stmt->execute(['p' => $productId, 't' => $tag]);
        }
    }

    /** @param list<int> $groupIds */
    private function guardarGruposDeProducto(int $tenantId, int $menuId, int $productId, array $groupIds): void
    {
        $this->db->prepare('DELETE FROM product_option_groups WHERE product_id = :p')
            ->execute(['p' => $productId]);

        if ($groupIds === []) {
            return;
        }

        // Sólo grupos de esta carta: un id de otra marca no entra.
        $marcas = implode(',', array_fill(0, count($groupIds), '?'));
        $stmt = $this->db->prepare(
            "SELECT id FROM option_groups
              WHERE tenant_id = ? AND menu_id = ? AND id IN ($marcas)",
        );
        $stmt->execute([$tenantId, $menuId, ...$groupIds]);
        $validos = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $insert = $this->db->prepare(
            'INSERT INTO product_option_groups (product_id, option_group_id, sort_order)
             VALUES (:p, :g, :o)',
        );

        $orden = 10;
        foreach ($validos as $gid) {
            $insert->execute(['p' => $productId, 'g' => $gid, 'o' => $orden]);
            $orden += 10;
        }
    }

    /** @param list<array<string,mixed>> $choices */
    private function reemplazarElecciones(int $tenantId, int $groupId, array $choices): void
    {
        $this->db->prepare('DELETE FROM option_choices WHERE option_group_id = :g AND tenant_id = :t')
            ->execute(['g' => $groupId, 't' => $tenantId]);

        $stmt = $this->db->prepare(
            'INSERT INTO option_choices
               (tenant_id, option_group_id, slug, name, price_delta, is_default, sort_order)
             VALUES (:t, :g, :s, :n, :p, :def, :orden)',
        );

        $usados = [];
        $orden = 10;

        foreach ($choices as $c) {
            $slug = Slug::de((string) $c['name']) ?: 'opcion';
            $base = $slug;
            $n = 2;
            while (isset($usados[$slug])) {
                $slug = $base . '-' . $n;
                $n++;
            }
            $usados[$slug] = true;

            $stmt->execute([
                't' => $tenantId,
                'g' => $groupId,
                's' => $slug,
                'n' => $c['name'],
                'p' => $c['priceDelta'],
                'def' => $c['isDefault'] ? 1 : 0,
                'orden' => $orden,
            ]);

            $orden += 10;
        }
    }

    /**
     * @param list<int> $ids
     * @return array<int, list<string>>
     */
    private function etiquetasPorProducto(array $ids): array
    {
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare("SELECT product_id, tag FROM product_tags WHERE product_id IN ($marcas)");
        $stmt->execute($ids);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['product_id']][] = $r['tag'];
        }

        return $out;
    }

    /**
     * @param list<int> $ids
     * @return array<int, list<int>>
     */
    private function gruposPorProducto(array $ids): array
    {
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare(
            "SELECT product_id, option_group_id FROM product_option_groups
              WHERE product_id IN ($marcas) ORDER BY sort_order ASC",
        );
        $stmt->execute($ids);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['product_id']][] = (int) $r['option_group_id'];
        }

        return $out;
    }
}
