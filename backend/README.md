# Backend

PHP vanilla, sin Composer ni framework. Sirve la carta y los pedidos. Lo único
que falta es Mercado Pago de verdad: hasta que haya credenciales, el cobro se
cierra con un endpoint marcado como simulado.

## Poner en marcha

**1. Crear la base.** Desde phpMyAdmin importá, en este orden:

1. `database/foodix.sql` — la base `foodix`, el catálogo y datos de arranque
   para dos locales.
2. `database/pedidos.sql` — pedidos, pagos e historial.

Van separados a propósito: así se puede reimportar el catálogo con datos
nuevos sin borrar los pedidos que ya se hicieron.

**2. Configurar.** Copiá `.env.example` a `.env` y ajustá la conexión.

> En esta máquina el MariaDB de XAMPP escucha en el **3307**, no en el 3306:
> el 3306 lo tiene ocupado otro MySQL 8. El `.env` ya quedó apuntando al 3307.

**3. Levantar.** Con Apache de XAMPP alcanza con que el proyecto esté en
`htdocs`. Sin Apache, el servidor embebido de PHP hace el mismo trabajo:

```bash
cd backend/public
php -S 127.0.0.1:8080 index.php
```

**4. Comprobar.**

```bash
php backend/tools/check.php
```

Revisa extensiones, `.env`, conexión, tablas, que cada carta se arme completa
y que el motor de precios cotice bien. Es lo primero que hay que correr
cuando algo no anda.

## Endpoints

### Carta

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/health` | Señal de vida. |
| GET | `/menu` | La carta por defecto del local. |
| GET | `/menu/{carta}` | Una carta puntual del local. |
| GET | `/menus` | Las cartas que publica el local. |

### Pedidos

| Método | Ruta | Qué hace |
| --- | --- | --- |
| POST | `/orders/quote` | El total, calculado en el servidor. |
| POST | `/orders` | Crea el pedido. Devuelve `{ order, checkoutUrl }`. |
| GET | `/orders/{id}` | El pedido con su estado y su historial. |
| POST | `/orders/{id}/pago-simulado` | Cierra el cobro sin pasarela. Sólo desarrollo. |

Todas existen también con el local explícito en la ruta: `/t/{local}/menu`,
`/t/{local}/orders`, y así.

```bash
curl http://127.0.0.1:8080/menu
curl -H "X-Tenant: cafe-rivas" http://127.0.0.1:8080/menu

curl -X POST http://127.0.0.1:8080/orders/quote \
  -H "Content-Type: application/json" \
  -d '{"mode":"delivery","couponCode":"FOODIX10",
       "lines":[{"key":"a","itemId":"b-doble","qty":2,"optionIds":["apunto","panceta"]}]}'
```

Los errores salen siempre con la misma forma:

```json
{ "error": { "codigo": "local_no_encontrado", "mensaje": "No encontramos ese local." } }
```

Y con datos extra según el caso: **422** con `campos` cuando faltan datos del
cliente, **409** con `issues` cuando el carrito quedó viejo, **403** si se llama
al pago simulado con `ALLOW_FAKE_PAYMENTS=false`.

## El precio lo decide el servidor

`Pricing` es la única parte del sistema que sabe cuánto sale algo. El front
manda **qué** pidió, nunca **cuánto** sale, y todo lo que llega se vuelve a
buscar en la base: el precio actual, si el plato sigue disponible y si esa
opción pertenece de verdad a ese plato.

No es paranoia de manual. Un carrito puede haber estado dos días en
`localStorage`, y una petición se arma a mano en treinta segundos. Sin esa
verificación, mandar `optionIds: ["panceta"]` sobre unas papas fritas sumaría
una panceta gratis, o directamente restaría del total.

`POST /orders` **vuelve a cotizar** antes de guardar, sin confiar en lo que
había calculado el carrito: entre que el cliente abrió la app y apretó pagar
pudo subir un precio o agotarse un plato.

Las cuentas se hacen en centavos con enteros (`Support\Money`). En la base el
dinero es `DECIMAL(12,2)`, que es exacto, pero PHP lo recibe como string y en
cuanto se suma con `+` se vuelve float: con un 10% de descuento sobre tres
líneas aparecen los `0.30000000000000004`.

## Multi-tenant

Una sola base, un solo esquema y una columna `tenant_id` en cada tabla que
pertenece a un local. Es lo más barato de operar para muchos menús chicos:
un backup, una migración, un pool de conexiones. A cambio la regla es
innegociable: **toda consulta filtra por `tenant_id`**, incluso cuando
`menu_id` ya lo implica. Es redundante a propósito.

Las claves únicas siempre llevan el alcance del local, así dos restaurantes
pueden tener los dos un plato `b-clasica` sin pisarse. Los pedidos también:
el enlace de un pedido de un local devuelve 404 desde otro.

### De qué local es cada petición

Se resuelve en este orden, de lo más explícito a lo más implícito:

1. el slug en la ruta — `/t/cafe-rivas/menu`
2. la cabecera `X-Tenant: cafe-rivas`
3. el parámetro `?tenant=cafe-rivas`
4. el subdominio — `cafe-rivas.foodix.app`
5. `DEFAULT_TENANT` del `.env`

**El paso 5 hay que sacarlo antes de producción.** Existe sólo para que el
front pueda pegar a `/menu` pelado. Un pedido que no identifica su local es un
error, no un pedido al local por defecto.

## Cómo está armado

```
backend/
├── database/
│   ├── foodix.sql          Catálogo + datos de arranque
│   └── pedidos.sql         Pedidos, pagos e historial
├── public/
│   ├── index.php           Front controller: autoload, rutas, errores
│   └── .htaccess           Todo lo que no es archivo real va a index.php
├── config/config.php       Lee el .env, con valores de desarrollo por defecto
├── src/
│   ├── Support/
│   │   ├── Database.php        PDO, excepciones, sin emulación de prepares
│   │   ├── Request.php         El cuerpo JSON, ya recortado y validado
│   │   ├── Response.php        JSON, CORS por lista blanca, ETag
│   │   ├── Money.php           Cuentas en centavos
│   │   ├── Router.php          Rutas con {parametros}
│   │   └── HttpException.php   Errores que ya saben su código HTTP
│   ├── Tenant/TenantResolver.php
│   ├── Menu/
│   │   ├── MenuRepository.php  Las consultas de la carta
│   │   ├── MenuPresenter.php   El contrato con el front
│   │   └── MenuController.php
│   └── Order/
│       ├── Pricing.php          El único lugar que calcula precios
│       ├── OrderRepository.php  Persistencia, en transacción
│       ├── OrderPresenter.php   El contrato con el front
│       └── OrderController.php
└── tools/
    ├── check.php        Diagnóstico
    └── nuevo-local.php  Alta de un local
```

`src/`, `config/`, `database/` y `tools/` tienen su propio `.htaccess` que
niega el acceso web. Van uno por carpeta y no uno solo en la raíz porque en
Apache 2.4 las reglas de autorización se combinan con las del padre: un
`Require all denied` arriba también taparía `public/`.

### Decisiones que conviene conocer

- **Siete consultas por carta, no una por plato.** Cada tabla se trae entera
  acotada al menú y el armado se hace en PHP. Con 29 platos da igual; con
  una carta de 200 y varios locales a la vez, no.
- **Los grupos de opciones viven a nivel carta**, no de plato. "Sumale algo"
  es el mismo para las cuatro hamburguesas: duplicarlo obligaría a corregir
  el precio de la panceta en cuatro lugares.
- **Hacia afuera se exponen slugs**, no ids numéricos. El front ya usa
  `b-clasica` como clave de React y en `/?plato=b-clasica`. El pedido es la
  excepción: su id público es aleatorio, porque quien tenga el enlace ve el
  pedido sin estar logueado.
- **Cada línea de pedido congela nombre y precio.** Si mañana sube la
  hamburguesa o se borra un plato, el ticket de la semana pasada tiene que
  seguir diciendo lo que decía.
- **El número corto de pedido se reserva con `SELECT … FOR UPDATE`.** Sin ese
  bloqueo, dos pedidos simultáneos leen el mismo valor y el segundo choca
  contra la clave única `(tenant_id, number)`.
- **Cobrar es idempotente.** Mercado Pago reintenta los webhooks; un pedido ya
  aprobado no se vuelve a tocar.
- **`theme` y `layout` salen de la base.** El estilo de carta y la paleta son
  configuración del local, no del teléfono que lo abre.
- **CORS por lista blanca, nunca `*`.**
- **La carta se cachea un minuto, y `private`.** La misma URL `/menu` devuelve
  cosas distintas según el local: con `public` una caché compartida podría
  entregarle a un cliente la carta de otro restaurante. Va con
  `Vary: X-Tenant` además.

## Lo que sigue

- **Mercado Pago de verdad.** Crear la preferencia con el SDK o la API REST,
  verificar la firma del webhook y volver a consultar el pago por API antes de
  dar una orden por pagada. El access token va en variable de entorno, nunca
  en el repo ni en el front. Cuando esté: `checkoutUrl` pasa a ser el
  `init_point`, se agrega `POST /webhooks/mercadopago` y
  `ALLOW_FAKE_PAYMENTS` se pone en false.
- **Un panel para el local**: editar la carta, ver los pedidos que entran,
  moverlos de estado y elegir paleta y estilo de carta. Hoy los estados
  posteriores a `confirmado` existen en la base pero no los mueve nadie, y
  `tenant_settings.theme` / `.layout` se cambian a mano por SQL.
- **Autenticación** para ese panel. Todo lo que hay ahora es público de lectura.
- **Sacar `DEFAULT_TENANT`.**
- **Limitar la tasa de `POST /orders`**, o alcanza con un script para llenar la
  cocina de pedidos falsos.
