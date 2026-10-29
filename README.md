# Foodix · Friedbox

Menú digital, carrito y pago. React en el front, PHP vanilla en el back.

Foodix es la plataforma; **Friedbox** es la marca que esta instalación
sirve. Lo que se ve en pantalla sale de la base, así que cambiar de marca
es cargar otra carta, no tocar el código.

**No hay datos simulados.** La carta, los precios, los pedidos y su estado
salen de MySQL a través de la API en PHP. El cobro es Mercado Pago (Checkout
Pro) apenas se carga `MP_ACCESS_TOKEN` en `backend/.env`; sin token, cae en un
endpoint marcado como simulado, y el pedido que queda guardado es un pedido de
verdad. Ver «Mercado Pago» en `backend/README.md`.

```
foodix/
├── frontend/     React + Vite
└── backend/      API en PHP vanilla + MySQL (ver backend/README.md)
```

## Arrancar

Hacen falta las tres piezas: sin backend el front no tiene qué mostrar.

```bash
# 1. base: importar desde phpMyAdmin, en este orden
#      backend/database/foodix.sql     esquema del catálogo
#      backend/database/pedidos.sql    esquema de pedidos
#      backend/database/friedbox.sql   la carta de Friedbox
#      backend/database/admin.sql      usuarios del panel y abierto/cerrado
#      backend/database/promos.sql     descuentos de las promos (días, rubros, platos)

# 2. backend
cp backend/.env.example backend/.env      # y ajustar la conexión
cd backend/public && php -S 127.0.0.1:8080 index.php

# 3. front, en otra terminal
cd frontend && npm install && npm run dev
```

El front queda en http://localhost:5173 y la API en http://127.0.0.1:8080.
Para comprobar que el backend está sano: `php backend/tools/check.php`.

Si la API no responde, el front lo dice en pantalla en lugar de quedarse en
blanco.

## Una marca, servida desde la raíz

La app muestra **Friedbox** y nada más. No hay slug en la URL.

| URL | Qué es |
| --- | --- |
| `/` | La carta |
| `/pedido` | El carrito |
| `/checkout` | Datos y pago |
| `/pedido/ord_…` | El estado de un pedido |

### Dónde vive el nombre de la marca

En un solo lugar del front, `frontend/src/brand.js`, y en la base. El slug
viaja en la cabecera `X-Tenant` de cada llamada y es la clave con la que se
guardan el carrito y las preferencias en `localStorage`.

```bash
VITE_BRAND=cafe-rivas npm run dev     # levanta otra marca sin tocar código
```

Todo lo que se ve en pantalla —el nombre del topbar, el de la comanda, la
dirección, el teléfono, la paleta y el estilo de carta— sale de la base. En
el código no hay nombres de platos ni de locales escritos a mano.

### El backend sigue siendo multi-local

PHP no cambió: resuelve el local por ruta, cabecera, parámetro o subdominio,
y si no viene ninguno usa `DEFAULT_TENANT` del `.env`, que ahora apunta a
`friedbox`. Lo que se sacó es el slug de la URL del front. Volver a montar
varias marcas es trabajo del front, no del backend.

`backend/tools/nuevo-local.php "Nombre"` sigue andando para dar de alta otro
local en la base.

## El panel del local

En `/admin`. El local entra con mail y contraseña y administra su carta
sin tocar la base.

```
admin@friedbox.com · friedbox
```

Ese usuario existe para poder abrir el panel la primera vez y **hay que
cambiarlo antes de mostrarle esto a nadie**:

```bash
php backend/tools/nuevo-usuario.php friedbox vos@ejemplo.com "Tu Nombre"
```

Sin `--clave` la pide por teclado, que es el camino recomendado: una
contraseña escrita en la línea de comandos queda en el historial. Si el
mail ya existe, le cambia la clave y cierra sus sesiones abiertas.

### Qué se puede hacer

| Pantalla | Qué administra |
| --- | --- |
| Carta | Platos: nombre, descripción, precio, foto, rubro, etiquetas, sello y qué opciones le tocan |
| Rubros | Crear, renombrar, ordenar y borrar los rubros de la carta |
| Opciones | Grupos como «Elegí tu salsa»: las opciones y cuánto suma cada una |
| Promos | Las franjas de arriba de la carta y los cupones de descuento |
| Local | Envío, mínimo, demoras, dirección de retiro, contacto, estilo y paleta |

Prender y apagar un plato («se acabó la milanesa») es un toque desde la
fila, sin abrir nada. El interruptor de **abrir y cerrar el local** vive
en la barra de arriba y se ve desde cualquier pantalla.

### Abierto y cerrado

Cerrar el local no esconde la carta: se sigue viendo, con un cartel
arriba y el motivo que escribió el local. Lo que no se puede es
terminar el pedido.

El bloqueo está en el backend, en `OrderController::exigirAbierto()`.
El front también apaga el botón, pero eso es cortesía: la que manda es
la comprobación del servidor, que mira la misma fila que prende el
panel. Un `POST /orders` con el local cerrado devuelve **409
`local_cerrado`** venga de donde venga.

### Las fotos

Se suben desde el panel y quedan en `backend/public/uploads/platos/`,
que el front pide por `/uploads/...` (en desarrollo lo proxea Vite, ver
`vite.config.js`).

De lo que entra no se cree nada: ni la extensión, ni el `Content-Type`,
ni el nombre del archivo. El tipo se saca del contenido con
`getimagesize()`, se aceptan sólo JPEG, PNG y WebP, y la imagen se
**reescribe** con GD en vez de moverse. Eso último es lo que importa:
un archivo que es JPEG válido y además PHP válido deja de serlo después
de pasar por `imagecreatefrom*()` e `imagejpeg()`. El nombre de destino
lo inventa el servidor, y la carpeta lleva un `.htaccess` que apaga la
ejecución de PHP.

Se guardan dos tamaños por plato, igual que las fotos del repositorio,
y al reemplazar una foto se borra la anterior del disco.

### Cómo está separado por local

Un usuario pertenece a un local y el `tenant_id` sale **de la sesión**,
nunca de la petición. Toda consulta del panel lleva ese id en el
`WHERE`, también al actualizar y al borrar, porque el id del plato
viaja en la URL y alguien puede probar con otro. Pedir el plato de otra
marca devuelve 404, no 403: si no es tuyo, para vos no existe.

La sesión es un token opaco que viaja en `Authorization: Bearer`. En la
base se guarda su SHA-256, así que un volcado de la base no entrega
sesiones vivas. Vence a los 14 días y cambiar la contraseña cierra las
demás.

## Los seis estilos de carta

El mismo menú y el mismo carrito, dibujados de seis maneras. Cada local elige
uno en `tenant_settings`; desde la carta no se cambia, porque es una decisión
del restaurante y no del cliente que la abre. Para comparar sin tocar la base
están `/preview.html` y los parámetros de URL.

| Estilo | Cómo se ve | Para qué sirve |
| --- | --- | --- |
| **Lista** | Filas con miniatura a la derecha | Cartas largas. La más rápida de escanear. |
| **Grilla** | Dos columnas con imagen grande | Cartas cortas y muy visuales. |
| **Mosaico** | Grilla despareja: un destacado por rubro | Empujar un plato de cada categoría. |
| **Vidriera** | Un plato por bloque, tratamiento editorial | Menú del día o carta premium. |
| **Cinta** | Bandas con la foto de fondo y el texto encima | Cartas con fotos fuertes. |
| **Carrusel** | Cada rubro se desliza en horizontal | Explorar mucha carta con poco scroll. |

### Las ocho paletas

| Paleta | Idea | Pensada para |
| --- | --- | --- |
| **Sifón** | Cobalto sobre papel; el azul es la interfaz y la comida pone el calor | Cocina de barrio, delivery |
| **Tostado** | Avena, café tostado y caramelo | Cafeterías y panaderías |
| **Sal** | Cal, azul egeo y limón | Pescados, mediterráneo |
| **Higo** | Ciruela y pistacho sobre rosa apagado | Pastelería y brunch |
| **Menta** | Verde fresco y coral | Ensaladas, comida sana |
| **Fuego** | Rojo y blanco, alto contraste | Pizza, burgers, rotisería |
| **Vermut** | Oxblood, hueso y naranja de aperitivo | Bares y bodegones, de noche |
| **Carbón** | Nocturna y neutra | Cualquier carta, de noche |

### Páginas para comparar

| URL | Qué muestra |
| --- | --- |
| `/preview.html` | Los seis estilos lado a lado, con selector de paleta. |
| `/flow.html` | El recorrido completo: carta → pedido → datos y pago. |
| `/?estilo=cinta&paleta=tostado` | Fuerza una combinación sin guardarla. |
| `/?plato=f-burger-doble` | Abre la carta con el detalle de ese plato ya abierto. |
| `/seed.html?to=/checkout` | Carga un pedido de prueba y salta a la pantalla que le pidas. |

`preview.html`, `flow.html` y `seed.html` son andamiaje de trabajo: se borran
antes de publicar.

## Cómo está armado el front

```
frontend/src/
├── api/index.js            El único lugar que habla con el backend
├── brand.js                El slug y el nombre de la marca, en un solo lugar
├── store/
│   ├── VenueProvider.jsx   La marca y su carta, cargada una vez
│   ├── CartProvider.jsx    Carrito, en localStorage bajo el slug de la marca
│   └── PrefsProvider.jsx   Estilo de carta y paleta
├── styles/
│   ├── tokens.css          Tipografía, espaciado y las ocho paletas
│   ├── menu.css            Los seis estilos de carta
│   ├── motion.css          Loader, entradas escalonadas y microinteracciones
│   └── …                   shell, sheet, cart, checkout, lab
├── components/
│   ├── menu/               MenuBoard (elige el estilo), DishCard, ItemSheet
│   ├── cart/Ticket.jsx     La comanda: carrito, resumen y pedido confirmado
│   ├── ui/DishArt.jsx      Foto del plato, o ilustración vectorial de respaldo
│   ├── ui/FoodLoader.jsx   El plato con vapor que se ve mientras carga
│   └── StyleLab.jsx        Panel de estilos, sin montar: lo reemplazó el admin
├── pages/                  Menu, Cart, Checkout, Gateway (simulada), Order
└── admin/                  El panel del local
    ├── api.js              Las llamadas con el token de sesión
    ├── PanelProvider.jsx   Todo el panel en una carga, y las escrituras
    ├── Campos.jsx          Inputs con la etiqueta arriba, avisos y vacíos
    ├── AdminShell.jsx      Barra, navegación y el interruptor abierto/cerrado
    └── secciones/          Carta, Rubros, Opciones, Promos, Local
```

### Decisiones que conviene conocer

- **El precio final lo decide el servidor.** El front muestra una estimación
  optimista mientras espera y después la pisa con lo que devuelve
  `POST /orders/quote`. Tampoco valida el formulario por su cuenta: los
  errores de `Nombre`, `Teléfono` y `Dirección` vienen del backend, para no
  tener dos versiones de las mismas reglas desincronizándose.
- **La paleta y el estilo de carta los configura el local**, en
  `tenant_settings`, y la carta no ofrece cómo cambiarlos. El panel «Modo
  diseño» quedó en `components/StyleLab.jsx` sin montar: ese control es del
  panel de administración del local, no del cliente que abre el menú. Lo
  único que sigue pisando la configuración es `?estilo=` y `?paleta=` en la
  URL, que no se guardan y existen para comparar.
- **Las fotos son provisorias.** Están en `public/img/platos/`, bajadas de Unsplash
  para cerrar el diseño con material realista; el detalle de cada una está en
  `public/img/platos/CREDITOS.md`. Hay dos tamaños por plato y `DishArt` los sirve
  con `srcset`. Para reemplazar una, pisá el archivo con el mismo nombre en 4:3.
- **Las ilustraciones quedaron como red de seguridad.** Un plato sin `image` se
  dibuja por vector desde `art: { shape, hue }` en lugar de mostrar un hueco gris.
  No es una opción que elija nadie: si hay foto, va la foto.
- **La comanda es la misma pieza en tres pantallas.** Cambia si se puede editar
  y qué pie lleva; el resto es idéntico.
- **Sin token de Mercado Pago, el pago se simula en `/pago-simulado/:id`.**
  Está marcada como pasarela simulada a propósito: no imita la pantalla real.
  Con token, `createOrder()` devuelve el link de Mercado Pago y esa ruta no se
  usa.

## Movimiento

Todo el movimiento vive en `frontend/src/styles/motion.css`, y es de dos tipos.

**Una secuencia al abrir la carta.** Primero el loader de la casa (un plato con
vapor y el aro girando, `FoodLoader`), que aparece con 140 ms de retardo para no
parpadear cuando la carta llega rápido. Después entran la franja del día, la
línea de datos, los rubros y las tarjetas, escalonadas de a 45 ms. El retardo se
corta en el séptimo ítem: más abajo el usuario todavía no llegó scrolleando y
sólo estaríamos demorando la carta. No hay revelado por scroll.

**Feedback cuando el usuario hace algo.** El botón de agregar se pone en verde
con un tilde por un segundo, el contador del pedido rebota, el total se atenúa
mientras el servidor recalcula, las fotos entran con un fundido sobre un hueco
que late, y la hoja de detalle baja en lugar de desaparecer de golpe.

`prefers-reduced-motion` apaga todo desde `base.css`; `motion.css` no necesita
repetirlo.

## Lo que falta

- **Devoluciones de Mercado Pago.** Un pago devuelto o contracargado después
  de aprobado no mueve el pedido; se hace a mano desde Mercado Pago.
- **Recuperar la contraseña.** Hoy, si alguien la pierde, se la vuelve a
  poner con `nuevo-usuario.php`. Falta el circuito por mail.
- **Fotos de Friedbox.** Hoy son las provisorias de Unsplash, y once platos
  (los boxes, el pollo, los aros) no tienen ninguna: se dibujan por vector.
  Ver `public/img/platos/CREDITOS.md`.
- **La identidad visual de Friedbox.** La demo usa la paleta Fuego y el
  estilo Grilla, elegidos como punto de partida: son dos campos de
  `tenant_settings`. Falta logo, tipografía propia y los textos del local.
